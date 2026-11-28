import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, or_
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import date, datetime, timedelta
import calendar
import threading
import httpx
import logging

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..config import settings
from ..lineas import etiqueta as etiqueta_linea
from ..facturacion import dia_de_pago
from ..billing import monto_mensual, detalle_monto
from ..recibos import DatosRecibo, LineaRecibo, etiqueta_mes, generar_recibo_pdf
from ..mensajeria import enviar_archivo, enviar_texto, oculta
from .. import reportes

logger = logging.getLogger(__name__)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


def _sumar_un_mes(d: date) -> date:
    """Avanza exactamente un mes respetando días al final de mes (ej: 31 ene → 28/29 feb)."""
    mes = d.month % 12 + 1
    anio = d.year + (1 if d.month == 12 else 0)
    dia = min(d.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


MESES_NOMBRE = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _meses_consecutivos(desde: str, cantidad: int) -> list[str]:
    """['2026-11', '2026-12', '2027-01'] a partir de '2026-11' y 3."""
    anio, mes = map(int, desde.split("-"))
    salida = []
    for _ in range(cantidad):
        salida.append(f"{anio}-{mes:02d}")
        mes += 1
        if mes == 13:
            mes, anio = 1, anio + 1
    return salida


def _repartir(total: float, partes: int) -> list[float]:
    """Divide el total en partes de dos decimales. El sobrante de céntimos va
    a la última, para que la suma sea exactamente lo que entró a caja."""
    if partes == 1:
        return [round(total, 2)]
    centimos = int(round(total * 100))
    base = centimos // partes
    montos = [base] * partes
    montos[-1] += centimos - base * partes
    return [c / 100 for c in montos]


def _etiqueta_mes(mes_pagado: str) -> str:
    anio, mes = map(int, mes_pagado.split("-"))
    return f"{MESES_NOMBRE[mes]} {anio}"


METODO_PAGO_LABEL = {
    "efectivo": "EFECTIVO",
    "yape": "YAPE",
    "plin": "PLIN",
    "transferencia": "TRANSFERENCIA",
    "deposito": "DEPOSITO",
    "otro": "OTRO",
}


def _pagos_del_recibo(db: Session, pago: models.Pago) -> list[models.Pago]:
    """Los pagos que entran en el mismo recibo: uno solo, o todos los meses que
    se cobraron juntos en un adelanto."""
    if not pago.grupo_adelanto:
        return [pago]
    return db.query(models.Pago).filter(
        models.Pago.grupo_adelanto == pago.grupo_adelanto
    ).order_by(models.Pago.mes_pagado.asc()).all()


def _datos_recibo(db: Session, pago: models.Pago) -> DatosRecibo:
    """Traduce un pago (o el grupo del adelanto) a lo que imprime el recibo.

    Los números se arman para que cuadren entre sí: IMP. TOTAL menos DESCUENTO
    es siempre el IMPORTE PAGADO, porque el subtotal sale de sumar lo cobrado
    más la rebaja, no de recalcular la tarifa de hoy.
    """
    grupo = _pagos_del_recibo(db, pago)
    primero = grupo[0]
    cliente = pago.cliente or db.query(models.Cliente).filter(
        models.Cliente.id == pago.cliente_id
    ).first()
    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first() if cliente else None

    pagado_meses = round(sum(p.monto for p in grupo), 2)
    descuento = round(next((p.descuento for p in grupo if p.descuento), 0) or 0, 2)
    # El costo de instalación va aparte de la mensualidad: no es un mes, es un
    # cobro único que se suma al importe pagado pero no al desglose por mes.
    instalacion = round(next((p.cargo_instalacion for p in grupo if p.cargo_instalacion), 0) or 0, 2)
    subtotal = round(pagado_meses + descuento, 2)
    meses = len(grupo)

    # Lo que no es mensualidad (televisores adicionales, por ejemplo) sale del
    # desglose real del cliente; el resto es mensualidad.
    detalle = detalle_monto(cliente, plan) if cliente else []
    otros_mes = round(sum(d["monto"] for d in detalle[1:]), 2)
    otros = min(round(otros_mes * meses, 2), subtotal)
    mensualidad = round(subtotal - otros, 2)

    por_mes = round(subtotal / meses, 2) if meses else 0.0
    lineas = [
        LineaRecibo(mes=p.mes_pagado, plan=(plan.nombre if plan else ""),
                    precio=por_mes, total=por_mes)
        for p in grupo
    ]
    # El último renglón absorbe el céntimo que deje la división
    if lineas:
        suma = round(por_mes * meses, 2)
        if suma != subtotal:
            ajuste = round(subtotal - suma, 2)
            lineas[-1].precio = round(lineas[-1].precio + ajuste, 2)
            lineas[-1].total = lineas[-1].precio

    dia_pago = None
    if cliente:
        if cliente.fecha_instalacion:
            dia_pago = cliente.fecha_instalacion.day
        elif cliente.fecha_vencimiento:
            dia_pago = cliente.fecha_vencimiento.day

    registrador = primero.registrador or db.query(models.Usuario).filter(
        models.Usuario.id == primero.registrado_por
    ).first()

    return DatosRecibo(
        numero=primero.id,
        cliente=cliente.nombre if cliente else f"Cliente #{pago.cliente_id}",
        # Un cliente con dos lineas paga dos veces al mes, cada una por su
        # cuenta. Si los dos recibos dicen lo mismo, el que reclama tiene
        # razon y nosotros no podemos demostrar nada.
        servicio=(
            f"{etiqueta_linea(cliente.linea).capitalize()} ({cliente.usuario_pppoe})"
            if cliente and cliente.linea > 1
            else None
        ),
        direccion=cliente.direccion if cliente else None,
        dia_pago=dia_pago,
        dia_corte=(dia_pago + settings.DIAS_GRACIA) if dia_pago else None,
        fecha_pago=primero.fecha_pago,
        hora_pago=primero.creado_en,
        metodo_pago=primero.metodo_pago or "efectivo",
        numero_operacion=next((p.numero_operacion for p in grupo if p.numero_operacion), None),
        cajero=registrador.nombre if registrador else None,
        lineas=lineas,
        mensualidad=mensualidad,
        otros=otros,
        instalacion=instalacion,
        descuento=descuento,
        # Lo que de verdad entró a caja: los meses más la instalación.
        pagado=round(pagado_meses + instalacion, 2),
        observaciones=primero.notas,
    )


def _mensaje_confirmacion_pago(cliente: models.Cliente, datos: DatosRecibo) -> str:
    """El texto que acompaña al PDF, con los mismos números del recibo."""
    meses = [ln.mes for ln in datos.lineas]
    if len(meses) > 1:
        linea_mes = (
            f"\u2705 Meses pagados ({len(meses)}): "
            f"{etiqueta_mes(meses[0])} a {etiqueta_mes(meses[-1])}"
        )
    else:
        linea_mes = f"\u2705 Recibo del mes: {etiqueta_mes(meses[0]) if meses else ''}"

    cuerpo = [
        f"*{cliente.nombre}* su pago ha sido registrado \u2705",
        "",
        f"\u2705 N\u00famero del recibo: {datos.numero}",
        linea_mes,
        f"\u2705 Importe mensual: {datos.mensualidad:.2f}",
        f"\u2705 Imp. otros: {datos.otros:.2f}",
        *(
            [f"\u2705 Instalaci\u00f3n: {datos.instalacion:.2f}"]
            if datos.instalacion
            else []
        ),
        f"\u2705 Imp. total: {datos.imp_total:.2f}",
        f"\u2705 Descuento: {datos.descuento:.2f}",
        f"\u2705 Importe pagado: {datos.pagado:.2f}",
        f"\u2705 Su medio de pago ha sido por: "
        f"{METODO_PAGO_LABEL.get(datos.metodo_pago, datos.metodo_pago.upper())}",
    ]
    if cliente.fecha_vencimiento:
        cuerpo.append(
            f"\u2705 Su servicio est\u00e1 activo hasta: "
            f"{cliente.fecha_vencimiento.strftime('%d/%m/%Y')}"
        )
    cuerpo += ["", "\u2705 GRACIAS POR SU PREFERENCIA."]
    return "\n".join(cuerpo)


def _enviar_recibo_whatsapp(
    phone: str,
    mensaje: str,
    pdf: Optional[bytes],
    numero: int,
) -> tuple[bool, str]:
    """Manda el recibo por WhatsApp: el PDF con el mensaje de descripción, o
    solo el texto si no se pudo armar el PDF."""
    if pdf:
        return enviar_archivo(phone, mensaje, f"recibo-{numero}.pdf", pdf)
    return enviar_texto(phone, mensaje)


def _enviar_confirmacion_pago(cliente: models.Cliente, datos: DatosRecibo, pdf: Optional[bytes]):
    """Envía el recibo por WhatsApp en segundo plano (no bloquea la respuesta
    ni lanza excepciones) — se usa al registrar el pago."""
    phone = (cliente.telefono_whatsapp or cliente.telefono or "").strip()
    if not phone:
        logger.warning("WhatsApp pago omitido — cliente %d sin número de teléfono", cliente.id)
        return

    mensaje = _mensaje_confirmacion_pago(cliente, datos)
    logger.info("WhatsApp recibo %d: enviando a %s (cliente %d)", datos.numero, oculta(phone), cliente.id)

    def _enviar():
        ok, detalle = _enviar_recibo_whatsapp(phone, mensaje, pdf, datos.numero)
        if ok:
            logger.info("WhatsApp recibo %d OK a %s (%s)", datos.numero, phone, detalle)
        else:
            logger.warning("WhatsApp recibo %d falló a %s: %s", datos.numero, phone, detalle)

    threading.Thread(target=_enviar, daemon=True).start()


router = APIRouter()


def _consulta_pagos(
    db: Session,
    cliente_id: Optional[int] = None,
    mes: Optional[str] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    con_zona: bool = False,
):
    """Los filtros de la lista de pagos, en un solo sitio.

    La usan la tabla de la pantalla y el reporte que se descarga, así lo que
    sale en el archivo es exactamente lo que el usuario está viendo. `con_zona`
    trae además la zona del cliente, que solo necesita el reporte.
    """
    carga_cliente = joinedload(models.Pago.cliente)
    if con_zona:
        carga_cliente = carga_cliente.joinedload(models.Cliente.zona)
    query = db.query(models.Pago).options(
        carga_cliente,
        joinedload(models.Pago.registrador),
    )

    if cliente_id:
        query = query.filter(models.Pago.cliente_id == cliente_id)
    if mes:
        query = query.filter(models.Pago.mes_pagado == mes)
    if estado:
        query = query.filter(models.Pago.estado == estado)
    if search:
        like = f"%{search}%"
        query = query.join(models.Cliente).filter(
            or_(
                models.Cliente.nombre.ilike(like),
                models.Cliente.usuario_pppoe.ilike(like),
                models.Cliente.dni.ilike(like),
                models.Pago.numero_operacion.ilike(like),
            )
        )

    return query.order_by(models.Pago.fecha_pago.desc())


@router.get("", response_model=dict)
def list_pagos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    cliente_id: Optional[int] = None,
    mes: Optional[str] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    query = _consulta_pagos(db, cliente_id, mes, estado, search)
    total = query.count()
    pagos = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": [schemas.PagoOut.model_validate(p) for p in pagos],
    }


def _meses_ya_pagados(db: Session, cliente_id: int, meses: list[str]) -> list[str]:
    """Cuáles de esos meses ya tienen un pago registrado para ese cliente."""
    return [
        p.mes_pagado for p in db.query(models.Pago).filter(
            models.Pago.cliente_id == cliente_id,
            models.Pago.mes_pagado.in_(meses),
        ).all()
    ]


def _error_de_mes_repetido(detalle: str, varios: bool) -> HTTPException:
    """El 400 de «ese mes ya está pagado», igual venga del SELECT o de la
    restricción de la base."""
    if not varios:
        return HTTPException(status_code=400, detail=f"Ya existe un pago para {detalle}")
    return HTTPException(
        status_code=400,
        detail=f"Estos meses ya están pagados: {detalle}. Ajusta el mes de inicio o la cantidad de meses.",
    )


def _instalacion_sugerida(db: Session, cliente: models.Cliente) -> tuple[bool, float]:
    """(aplica, costo) del cargo de instalación para el PRÓXIMO pago del cliente.

    Aplica una sola vez: en el primer pago de un cliente NO migrado de una zona
    que cobra instalación. Es la misma regla que usa el cobro, para que lo que
    la pantalla muestra coincida con lo que se guarda.
    """
    ya_pago = (
        db.query(models.Pago).filter(models.Pago.cliente_id == cliente.id).first() is not None
    )
    if ya_pago or cliente.migrado:
        return False, 0.0
    zona = (
        db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
        if cliente.zona_id
        else None
    )
    costo = round((zona.costo_instalacion or 0) if zona else 0, 2)
    return (costo > 0), costo


@router.get("/instalacion-sugerida/{cliente_id}")
def instalacion_sugerida(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)
    ),
):
    """Le dice a la caja si a este cliente le toca cobro de instalación y cuánto,
    para precargarlo (editable) en el formulario de pago. Solo informa."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    aplica, costo = _instalacion_sugerida(db, cliente)
    return {"aplica": aplica, "costo": costo}


@router.post("", response_model=schemas.PagoOut, status_code=201)
def create_pago(
    data: schemas.PagoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == data.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # El tope de cero vale para los COBROS, no para todo lo que se registra.
    #
    # Un corte temporal es, por diseño, un pago de S/ 0: marca en amarillo un
    # mes en que el servicio estuvo cortado. Cuando se añadieron los
    # descuentos, este guard se escribió sobre el monto a secas y se llevó por
    # delante esa función entera — el enum, las etiquetas de los informes y las
    # insignias de tres pantallas seguían ahí, pero ningún camino podía crear
    # un corte temporal. Las tres pruebas de TestCorteTemporal lo decían desde
    # entonces; nadie las vio porque la suite no arrancaba.
    if data.estado == models.EstadoPago.pagado and data.monto <= 0:
        raise HTTPException(
            status_code=400,
            detail="El total a pagar tiene que ser mayor que cero — revisa el descuento",
        )

    # Meses que cubre este cobro: uno solo, o varios si es un adelanto
    meses = _meses_consecutivos(data.mes_pagado, data.meses)

    # Check duplicate (mismo cliente + mes) — en un adelanto, ninguno de los
    # meses puede estar pagado ya, y se avisa cuáles para no dejarlo a medias.
    #
    # Esto es solo para el mensaje. Lo que de verdad impide el cobro doble es
    # uq_pagos_cliente_mes en la base (ver models.py): entre este SELECT y el
    # commit hay segundos —se genera un PDF y se espera a WhatsApp— y en esa
    # ventana caben dos peticiones de un doble clic.
    ya_pagados = _meses_ya_pagados(db, data.cliente_id, meses)
    if ya_pagados:
        raise _error_de_mes_repetido(", ".join(sorted(ya_pagados)), len(meses) > 1)

    # El número de operación es único en todo el sistema — evita que se
    # reutilice (a propósito o por error) el comprobante de un pago anterior.
    # Se normaliza a mayúsculas sin espacios para que "op-123" y "OP-123"
    # cuenten como el mismo número (bancos/Yape/Plin no son consistentes
    # con las mayúsculas al mostrarlo).
    numero_operacion = (data.numero_operacion or "").strip().upper() or None
    if numero_operacion:
        duplicado = db.query(models.Pago).options(joinedload(models.Pago.cliente)).filter(
            models.Pago.numero_operacion == numero_operacion
        ).first()
        if duplicado:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El número de operación \"{numero_operacion}\" ya fue registrado — "
                    f"pago de {duplicado.cliente.nombre if duplicado.cliente else f'cliente #{duplicado.cliente_id}'} "
                    f"por el mes {duplicado.mes_pagado}"
                ),
            )

    datos_pago = data.model_dump(exclude={"meses", "descuento", "cargo_instalacion"})
    datos_pago["numero_operacion"] = numero_operacion

    plan_cliente = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()

    # ── Costo de instalación ─────────────────────────────────────────────────
    # Se cobra UNA sola vez, en el primer pago de un cliente recién instalado
    # de una zona que lo cobra. Automático pero editable: si quien cobra manda
    # el campo (incluido 0 para quitarlo), manda su valor; si no lo manda, el
    # servidor lo deduce. Los migrados quedan fuera: ya estaban instalados.
    es_primer_pago = (
        db.query(models.Pago).filter(models.Pago.cliente_id == cliente.id).first() is None
    )
    if "cargo_instalacion" in data.model_fields_set:
        cargo_instalacion = round(data.cargo_instalacion or 0, 2) or None
    elif data.estado == models.EstadoPago.pagado:
        aplica, costo = _instalacion_sugerida(db, cliente)
        cargo_instalacion = costo if aplica else None
    else:
        cargo_instalacion = None

    # El cargo de instalación solo puede ir en el PRIMER pago del cliente: así
    # no se cobra dos veces aunque quien registra lo mande por error más tarde.
    if cargo_instalacion and not es_primer_pago:
        raise HTTPException(
            status_code=400,
            detail="El costo de instalación solo se cobra en el primer pago del cliente.",
        )

    # La rebaja la decide quien cobra y viene en el propio pedido — si mandó 0,
    # es que no hubo rebaja y no hay que inventar ninguna. Solo cuando el campo
    # no viene (el móvil no lo manda) se deduce comparando con la cuota.
    if "descuento" in data.model_fields_set:
        descuento = round(data.descuento or 0, 2) or None
    else:
        cuota = monto_mensual(cliente, plan_cliente) if plan_cliente else None
        precio_lista = round(cuota * len(meses), 2) if cuota else None
        descuento = round(precio_lista - data.monto, 2) if precio_lista else None
        if descuento is not None and descuento <= 0:
            descuento = None

    grupo = uuid.uuid4().hex if len(meses) > 1 else None
    montos = _repartir(data.monto, len(meses))

    pagos = []
    for i, (mes_cubierto, monto_mes) in enumerate(zip(meses, montos)):
        datos = dict(datos_pago)
        datos["mes_pagado"] = mes_cubierto
        datos["monto"] = monto_mes
        # El voucher y su número van una sola vez: es un solo comprobante
        datos["numero_operacion"] = numero_operacion if i == 0 else None
        p = models.Pago(
            **datos,
            grupo_adelanto=grupo,
            descuento=descuento if i == 0 else None,
            # El cargo de instalación va una sola vez, en el primer mes del grupo.
            cargo_instalacion=cargo_instalacion if i == 0 else None,
            registrado_por=current_user.id,
        )
        db.add(p)
        pagos.append(p)
    pago = pagos[0]

    # Solo reactivar si es un pago real (no corte_temporal)
    if data.estado == models.EstadoPago.pagado and cliente.estado == models.EstadoCliente.suspendido:
        cliente.estado = models.EstadoCliente.activo
        historial = models.Historial(
            cliente_id=cliente.id,
            tipo=models.TipoHistorial.activacion,
            descripcion=(
                f"Reactivado automáticamente por pago del mes {data.mes_pagado}"
                if len(meses) == 1
                else f"Reactivado automáticamente por pago adelantado de {len(meses)} meses"
            ),
            usuario_id=current_user.id,
        )
        db.add(historial)

    if len(meses) == 1:
        descripcion_historial = (
            f"Pago registrado: S/{data.monto} - Mes {data.mes_pagado} - Método: {data.metodo_pago}"
        )
    else:
        descripcion_historial = (
            f"Pago adelantado de {len(meses)} meses ({_etiqueta_mes(meses[0])} a "
            f"{_etiqueta_mes(meses[-1])}): S/{data.monto:.2f} - Método: {data.metodo_pago}"
        )
        if descuento:
            descripcion_historial += (
                f" - Descuento S/{descuento:.2f} sobre S/{data.monto + descuento:.2f}"
            )
    historial_pago = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.pago,
        descripcion=descripcion_historial,
        usuario_id=current_user.id,
    )
    db.add(historial_pago)

    # Solo actualizar fecha_vencimiento para pagos reales, no cortes temporales
    if data.estado == models.EstadoPago.pagado:
        anio_p, mes_p = map(int, meses[-1].split("-"))
        next_mes  = mes_p % 12 + 1
        next_anio = anio_p + (1 if mes_p == 12 else 0)
        # El dia de pago sale de cuando se ACTIVO el servicio, no de cuando se
        # instalo: se puede tender el cable un martes y dejarlo funcionando el
        # jueves porque la caja no tenia potencia, y el cliente cuenta desde
        # que tiene internet. Para los migrados, que no tienen fecha de
        # activacion, sigue valiendo la de instalacion.
        base = cliente.fecha_ultima_activacion or cliente.fecha_instalacion
        dia_ciclo = dia_de_pago(base) if base else 1
        dia_ciclo = min(dia_ciclo, calendar.monthrange(next_anio, next_mes)[1])
        nueva_vencimiento = date(next_anio, next_mes, dia_ciclo)
        # Nunca retroceder si ya hay una fecha posterior (pagos de meses atrasados)
        cliente.fecha_vencimiento = max(nueva_vencimiento, cliente.fecha_vencimiento or date.today())
        # Ya pagó — el compromiso que tenía (si había) queda resuelto
        cliente.compromiso_pago_hasta = None

    try:
        db.commit()
    except IntegrityError:
        # Aquí llega el doble clic: la otra petición insertó el mismo mes
        # mientras esta generaba su PDF, y uq_pagos_cliente_mes la paró.
        #
        # Para saber si fue ESA violación y no otra, se vuelve a preguntar por
        # los meses en vez de leer el texto del error. Es a propósito: el
        # mensaje lo redacta el driver, y no dicen lo mismo —PostgreSQL nombra
        # la restricción, SQLite solo lista las columnas—, así que mirarlo
        # funcionaría en el servidor y no en las pruebas, que es la peor forma
        # de que algo funcione.
        db.rollback()
        repetidos = _meses_ya_pagados(db, data.cliente_id, meses)
        if repetidos:
            logger.info(
                "Cobro doble evitado por la restricción — cliente %d, mes(es) %s",
                data.cliente_id, ", ".join(sorted(repetidos)),
            )
            raise _error_de_mes_repetido(
                ", ".join(sorted(repetidos)), len(meses) > 1,
            ) from None
        # No era un mes repetido: no se disfraza de otra cosa.
        raise
    db.refresh(pago)
    db.refresh(cliente)

    # Notificación WhatsApp — no bloqueante, falla silenciosa
    # El recibo se arma una sola vez: sirve para el PDF y para el mensaje
    datos = _datos_recibo(db, pago)
    try:
        pdf = generar_recibo_pdf(datos)
    except Exception as e:  # el PDF nunca debe tumbar el registro del pago
        logger.warning("No se pudo generar el recibo %d: %s", datos.numero, e)
        pdf = None
    _enviar_confirmacion_pago(cliente, datos, pdf)

    return pago


@router.post("/{pago_id}/comprobante", response_model=schemas.PagoOut)
def subir_comprobante_pago(
    pago_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    pago = db.query(models.Pago).options(joinedload(models.Pago.cliente)).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    ext = os.path.splitext(archivo.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido (solo imágenes o PDF)")

    target_dir = os.path.join(settings.MEDIA_DIR, "comprobantes")
    os.makedirs(target_dir, exist_ok=True)
    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    ruta_completa = os.path.join(target_dir, nombre_archivo)

    with open(ruta_completa, "wb") as f:
        f.write(archivo.file.read())

    pago.ruta_comprobante = ruta_completa
    db.commit()
    db.refresh(pago)
    return pago


@router.get("/{pago_id}/comprobante")
def descargar_comprobante_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    pago = db.query(models.Pago).filter(models.Pago.id == pago_id).first()
    if not pago or not pago.ruta_comprobante or not os.path.isfile(pago.ruta_comprobante):
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    return FileResponse(pago.ruta_comprobante)


@router.post("/{pago_id}/reenviar-whatsapp")
def reenviar_confirmacion_whatsapp(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Reenvía manualmente la confirmación de pago por WhatsApp — a pedido,
    a diferencia del envío automático al registrar el pago (ej. si el bot
    estaba desconectado en ese momento, o el cliente pide que se lo reenvíen).
    A diferencia del envío automático, este SÍ espera la respuesta real del
    bot para poder avisarle al usuario si se mandó o no."""
    pago = db.query(models.Pago).options(joinedload(models.Pago.cliente)).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    cliente = pago.cliente
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    phone = (cliente.telefono_whatsapp or cliente.telefono or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="El cliente no tiene un número de teléfono registrado")

    datos = _datos_recibo(db, pago)
    mensaje = _mensaje_confirmacion_pago(cliente, datos)
    try:
        pdf = generar_recibo_pdf(datos)
    except Exception as e:
        logger.warning("No se pudo generar el recibo %d: %s", datos.numero, e)
        pdf = None

    ok, detalle = _enviar_recibo_whatsapp(phone, mensaje, pdf, datos.numero)
    if not ok:
        raise HTTPException(status_code=502, detail=f"WhatsApp no pudo enviar el recibo: {detalle}")

    return {"ok": True, "telefono": phone}


@router.get("/{pago_id}/recibo-pdf")
def recibo_pdf(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """El recibo del pago en PDF, con el formato de ticket de la empresa. Si el
    pago es parte de un cobro adelantado, sale un solo recibo con todos los
    meses."""
    pago = db.query(models.Pago).options(joinedload(models.Pago.cliente)).filter(
        models.Pago.id == pago_id
    ).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    datos = _datos_recibo(db, pago)
    pdf = generar_recibo_pdf(datos)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="recibo-{datos.numero}.pdf"'},
    )


@router.get("/resumen-mensual")
def resumen_mensual(
    anio: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if not anio:
        anio = date.today().year

    result = []
    for mes in range(1, 13):
        mes_str = f"{anio}-{mes:02d}"
        total = db.query(func.sum(models.Pago.monto)).filter(
            models.Pago.mes_pagado == mes_str,
            models.Pago.estado == models.EstadoPago.pagado,
        ).scalar() or 0

        gastos = db.query(func.sum(models.Gasto.monto)).filter(
            extract("year", models.Gasto.fecha) == anio,
            extract("month", models.Gasto.fecha) == mes,
        ).scalar() or 0

        result.append({
            "mes": mes_str,
            "ingresos": float(total),
            "gastos": float(gastos),
        })

    return result


def _datos_caja(db: Session, fecha: Optional[date], zona_id: Optional[int]) -> dict:
    """Corte de caja del día: cuánto entró, por qué método (para saber qué
    hay que cuadrar en efectivo vs. lo digital) y quién lo cobró — clave
    para que atención al cliente rinda cuentas al final del turno.

    Lo usan el endpoint que alimenta la pantalla y el que arma el archivo
    descargable, para que los dos digan lo mismo."""
    if not fecha:
        fecha = date.today()

    query = db.query(models.Pago).options(
        joinedload(models.Pago.cliente).joinedload(models.Cliente.zona),
        joinedload(models.Pago.registrador),
    ).filter(
        models.Pago.fecha_pago == fecha,
        models.Pago.estado == models.EstadoPago.pagado,
    )
    if zona_id:
        query = query.join(models.Cliente).filter(models.Cliente.zona_id == zona_id)

    pagos = query.order_by(models.Pago.creado_en.asc()).all()
    total = sum(p.monto for p in pagos)

    por_metodo: dict = {}
    for p in pagos:
        m = por_metodo.setdefault(p.metodo_pago, {"metodo": p.metodo_pago, "total": 0.0, "cantidad": 0})
        m["total"] += p.monto
        m["cantidad"] += 1

    por_usuario: dict = {}
    for p in pagos:
        key = p.registrado_por or 0
        u = por_usuario.setdefault(key, {
            "usuario_id": p.registrado_por,
            "nombre": p.registrador.nombre if p.registrador else "Sin registrar",
            "rol": p.registrador.rol.value if p.registrador else None,
            "total": 0.0,
            "cantidad": 0,
        })
        u["total"] += p.monto
        u["cantidad"] += 1

    return {
        "fecha": str(fecha),
        "total": round(total, 2),
        "cantidad_pagos": len(pagos),
        "por_metodo": sorted(por_metodo.values(), key=lambda x: -x["total"]),
        "por_usuario": sorted(por_usuario.values(), key=lambda x: -x["total"]),
        "pagos": [
            {
                "id": p.id,
                "cliente_id": p.cliente_id,
                "cliente_nombre": p.cliente.nombre if p.cliente else None,
                "zona_nombre": p.cliente.zona.nombre if p.cliente and p.cliente.zona else None,
                "monto": p.monto,
                "metodo_pago": p.metodo_pago,
                "registrado_por": p.registrador.nombre if p.registrador else None,
                "hora": p.creado_en.isoformat() if p.creado_en else None,
            }
            for p in pagos
        ],
    }


@router.get("/reporte-caja")
def reporte_caja(
    fecha: date = Query(default=None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    return _datos_caja(db, fecha, zona_id)


@router.get("/reporte-instalaciones")
def reporte_instalaciones(
    desde: date = Query(default=None),
    hasta: date = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Ingresos por COSTO DE INSTALACIÓN en un período, aparte del ingreso
    mensual. Es un cobro único (no recurrente): mezclarlo con las cuotas
    infla el mes y miente sobre la tendencia real, así que va en su reporte.

    Incluye un control de fugas: en las zonas que cobran instalación, cada
    cliente activado en el período debería tener su cargo; los que no lo
    tienen se listan para revisarlos (plata que se pudo escapar o un cobro
    mal registrado).
    """
    hoy = date.today()
    if desde is None:
        desde = date(hoy.year, hoy.month, 1)
    if hasta is None:
        hasta = hoy

    # Cargos de instalación cobrados en el período (solo pagos reales).
    base = (
        db.query(models.Pago)
        .join(models.Cliente, models.Cliente.id == models.Pago.cliente_id)
        .filter(
            models.Pago.cargo_instalacion.isnot(None),
            models.Pago.cargo_instalacion > 0,
            models.Pago.estado == models.EstadoPago.pagado,
            models.Pago.fecha_pago >= desde,
            models.Pago.fecha_pago <= hasta,
        )
    )

    total_q = base.with_entities(
        func.coalesce(func.sum(models.Pago.cargo_instalacion), 0),
        func.count(models.Pago.id),
    ).first()
    total = round(float(total_q[0] or 0), 2)
    cantidad = int(total_q[1] or 0)
    promedio = round(total / cantidad, 2) if cantidad else 0.0

    # Por zona.
    por_zona = [
        {
            "zona_id": zid,
            "zona_nombre": nombre,
            "cantidad": int(cant),
            "total": round(float(suma or 0), 2),
        }
        for zid, nombre, cant, suma in (
            base.join(models.Zona, models.Zona.id == models.Cliente.zona_id)
            .with_entities(
                models.Zona.id,
                models.Zona.nombre,
                func.count(models.Pago.id),
                func.sum(models.Pago.cargo_instalacion),
            )
            .group_by(models.Zona.id, models.Zona.nombre)
            .all()
        )
    ]
    por_zona.sort(key=lambda x: -x["total"])

    # Por técnico instalador (para conciliar quién instaló).
    por_tecnico = [
        {
            "tecnico_id": tid,
            "tecnico_nombre": nombre or "Sin registrar",
            "cantidad": int(cant),
            "total": round(float(suma or 0), 2),
        }
        for tid, nombre, cant, suma in (
            base.outerjoin(
                models.Usuario, models.Usuario.id == models.Cliente.tecnico_instalador_id
            )
            .with_entities(
                models.Cliente.tecnico_instalador_id,
                models.Usuario.nombre,
                func.count(models.Pago.id),
                func.sum(models.Pago.cargo_instalacion),
            )
            .group_by(models.Cliente.tecnico_instalador_id, models.Usuario.nombre)
            .all()
        )
    ]
    por_tecnico.sort(key=lambda x: -x["total"])

    # Control de fugas: clientes activados en el período, de zonas que cobran,
    # no migrados, que NO tienen ningún cargo de instalación registrado.
    con_cargo = {
        cid
        for (cid,) in db.query(models.Pago.cliente_id)
        .filter(models.Pago.cargo_instalacion.isnot(None), models.Pago.cargo_instalacion > 0)
        .distinct()
        .all()
    }
    activados = (
        db.query(models.Cliente, models.Zona)
        .join(models.Zona, models.Zona.id == models.Cliente.zona_id)
        .filter(
            models.Zona.costo_instalacion > 0,
            models.Cliente.migrado.isnot(True),
            models.Cliente.fecha_ultima_activacion >= desde,
            models.Cliente.fecha_ultima_activacion <= hasta,
        )
        .all()
    )
    fugas = [
        {
            "cliente_id": c.id,
            "cliente_nombre": c.nombre,
            "zona_nombre": z.nombre,
            "fecha_activacion": c.fecha_ultima_activacion.isoformat()
            if c.fecha_ultima_activacion
            else None,
            "costo_zona": round(float(z.costo_instalacion or 0), 2),
        }
        for c, z in activados
        if c.id not in con_cargo
    ]
    fugas.sort(key=lambda x: x["fecha_activacion"] or "")

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "resumen": {
            "total": total,
            "cantidad": cantidad,
            "promedio": promedio,
            "activaciones_zonas_con_cobro": len(activados),
            "sin_cargo": len(fugas),
        },
        "por_zona": por_zona,
        "por_tecnico": por_tecnico,
        "fugas": fugas,
    }


def _datos_zonas(db: Session, mes: Optional[str]) -> list[dict]:
    """Cuánto se recaudó ese mes en cada zona — para comparar de un vistazo
    qué zonas rinden más."""
    if not mes:
        hoy = date.today()
        mes = f"{hoy.year}-{hoy.month:02d}"

    filas = (
        db.query(
            models.Zona.id,
            models.Zona.nombre,
            func.sum(models.Pago.monto),
            func.count(models.Pago.id),
            func.count(func.distinct(models.Pago.cliente_id)),
        )
        .join(models.Cliente, models.Cliente.zona_id == models.Zona.id)
        .join(models.Pago, models.Pago.cliente_id == models.Cliente.id)
        .filter(models.Pago.mes_pagado == mes, models.Pago.estado == models.EstadoPago.pagado)
        .group_by(models.Zona.id, models.Zona.nombre)
        .all()
    )
    result = [
        {
            "zona_id": zid,
            "zona_nombre": nombre,
            "total": round(float(total or 0), 2),
            "cantidad_pagos": int(cant),
            "clientes_distintos": int(clientes),
        }
        for zid, nombre, total, cant, clientes in filas
    ]
    result.sort(key=lambda x: -x["total"])
    return result


@router.get("/reporte-mensual-zonas")
def reporte_mensual_zonas(
    mes: Optional[str] = Query(None, description="YYYY-MM — por defecto, el mes actual"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    return _datos_zonas(db, mes)


@router.get("/clientes-sin-pago")
def clientes_sin_pago(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Clientes activos cuyo propio ciclo de pago (fecha_vencimiento) ya
    llegó o ya pasó — no usa el mes calendario: un cliente que vence el 29
    no debe aparecer aquí el día 2, aunque el mes calendario recién empiece."""
    hoy = date.today()
    sin_pago = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(
        models.Cliente.estado == models.EstadoCliente.activo,
        models.Cliente.fecha_vencimiento.isnot(None),
        models.Cliente.fecha_vencimiento <= hoy,
    ).order_by(models.Cliente.fecha_vencimiento.asc()).all()

    items = []
    for c in sin_pago:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        item["monto_mensual_detalle"] = detalle_monto(c, c.plan)
        item["mes_que_debe"] = f"{c.fecha_vencimiento.year}-{c.fecha_vencimiento.month:02d}"
        item["dias_atraso"] = (hoy - c.fecha_vencimiento).days
        items.append(item)
    return items


@router.get("/clientes-cortados")
def clientes_cortados(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Clientes con el servicio cortado (suspendido), más recientes primero —
    para encontrar rápido a quien quiere pagar y reactivar. No tiene límite
    de tiempo: los cortados hace años quedan al fondo de la lista solos, sin
    tener que ocultarlos a mano."""
    cortados = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(
        models.Cliente.estado == models.EstadoCliente.suspendido,
    ).order_by(models.Cliente.actualizado_en.desc()).limit(20).all()

    items = []
    for c in cortados:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        item["monto_mensual_detalle"] = detalle_monto(c, c.plan)
        item["cortado_en"] = c.actualizado_en.isoformat() if c.actualizado_en else None
        items.append(item)
    return items


@router.get("/compromisos-vigentes")
def compromisos_vigentes(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Clientes a los que se les dio plazo y todavía lo tienen corriendo.

    Hacía falta por una razón simple: al dar el compromiso, el cliente sale
    de la lista de morosos y de la de cortados — que es justo lo que se
    busca— y entonces desaparece de la pantalla. Quedaba invisible hasta que
    se le vencía el plazo. Si alguien se equivocaba de cliente, no había
    dónde ir a verlo ni cómo deshacerlo.

    Ordenados por el que vence primero, que es a quien hay que llamar hoy.
    """
    hoy = date.today()
    con_plazo = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(
        models.Cliente.compromiso_pago_hasta.isnot(None),
        models.Cliente.compromiso_pago_hasta >= hoy,
    ).order_by(models.Cliente.compromiso_pago_hasta.asc()).all()

    items = []
    for c in con_plazo:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        item["monto_mensual_detalle"] = detalle_monto(c, c.plan)
        item["dias_restantes"] = (c.compromiso_pago_hasta - hoy).days
        items.append(item)
    return items


@router.get("/pausas-por-vencer")
def pausas_por_vencer(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Clientes en pausa temporal (a su propia solicitud) cuyo plazo ya
    venció o está por vencer en los próximos 7 días — para saber a quién
    reactivar. Distinto de 'Clientes cortados': estos no son morosos."""
    limite = date.today() + timedelta(days=7)
    pausados = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(
        models.Cliente.estado == models.EstadoCliente.pausado,
        models.Cliente.pausa_hasta <= limite,
    ).order_by(models.Cliente.pausa_hasta.asc()).all()

    items = []
    for c in pausados:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        items.append(item)
    return items


# ── Reportes descargables ────────────────────────────────────────────────────
# Estas rutas van antes de "/{pago_id}": si estuvieran después, FastAPI
# intentaría leer "exportar" como el número de un pago.

def _respuesta_reporte(r: reportes.Reporte, formato: str) -> Response:
    if formato not in ("excel", "pdf"):
        raise HTTPException(status_code=400, detail="Formato no válido: use 'excel' o 'pdf'.")
    contenido, nombre, tipo = reportes.generar(r, formato)
    return Response(
        content=contenido,
        media_type=tipo,
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            # Sin esto el navegador no deja leer el nombre del archivo.
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def _texto_estado(estado) -> str:
    bruto = estado.value if hasattr(estado, "value") else str(estado or "")
    return reportes.ESTADO_LABEL.get(bruto, bruto)


def _numeros_de_recibo(db: Session, pagos: list[models.Pago]) -> dict[int, int]:
    """El número de recibo que le corresponde a cada pago.

    Un adelanto de varios meses son varias filas en la base, pero un solo
    recibo: el del primer mes cobrado. Así el número del reporte coincide con
    el papel que tiene el cliente en la mano.
    """
    grupos = {p.grupo_adelanto for p in pagos if p.grupo_adelanto}
    primero: dict[str, int] = {}
    if grupos:
        filas = (
            db.query(models.Pago.grupo_adelanto, func.min(models.Pago.id))
            .filter(models.Pago.grupo_adelanto.in_(grupos))
            .group_by(models.Pago.grupo_adelanto)
            .all()
        )
        primero = {g: int(n) for g, n in filas}
    return {p.id: primero.get(p.grupo_adelanto or "", p.id) for p in pagos}


@router.get("/exportar")
def exportar_pagos(
    formato: str = Query("excel", description="excel | pdf"),
    cliente_id: Optional[int] = None,
    mes: Optional[str] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """La lista de pagos con los mismos filtros de la pantalla, pero completa
    (sin paginar) y lista para descargar en Excel o PDF."""
    pagos = _consulta_pagos(db, cliente_id, mes, estado, search, con_zona=True).all()
    numero = _numeros_de_recibo(db, pagos)

    filas = [
        [
            numero.get(p.id, p.id),
            p.fecha_pago,
            p.cliente.nombre if p.cliente else f"#{p.cliente_id}",
            (p.cliente.dni if p.cliente else "") or "",
            (p.cliente.zona.nombre if p.cliente and p.cliente.zona else "") or "",
            reportes.etiqueta_mes(p.mes_pagado),
            round(p.monto, 2),
            round(p.descuento, 2) if p.descuento else None,
            reportes.METODO_LABEL.get(p.metodo_pago, (p.metodo_pago or "").capitalize()),
            p.numero_operacion or "",
            _texto_estado(p.estado),
            p.registrador.nombre if p.registrador else "",
        ]
        for p in pagos
    ]

    total = round(sum(p.monto for p in pagos), 2)
    descuentos = round(sum(p.descuento or 0 for p in pagos), 2)

    filtros = [f"Mes: {reportes.etiqueta_mes(mes)}" if mes else "Mes: todos"]
    filtros.append(f"Estado: {_texto_estado(estado) if estado else 'todos'}")
    archivo = "reporte-pagos"
    if cliente_id:
        nombre_cliente = next((p.cliente.nombre for p in pagos if p.cliente), f"#{cliente_id}")
        filtros.append(f"Cliente: {nombre_cliente}")
        # El archivo lleva el nombre del cliente: así no se confunden varios
        # estados de cuenta en la carpeta de descargas.
        archivo = f"pagos-{reportes.parte_de_nombre(nombre_cliente)}"
    if search:
        filtros.append(f"Búsqueda: «{search}»")

    reporte = reportes.Reporte(
        titulo="Reporte de pagos",
        archivo=archivo,
        subtitulo=f"{len(pagos)} pago(s) · S/ {total:,.2f} recaudado",
        filtros=filtros,
        generado_por=current_user.nombre,
        columnas=[
            reportes.Columna("Recibo N°", "entero", 0.6),
            reportes.Columna("Fecha", "fecha", 0.85),
            reportes.Columna("Cliente", "texto", 2.0),
            reportes.Columna("DNI / RUC", "texto", 0.9),
            reportes.Columna("Zona", "texto", 1.0),
            reportes.Columna("Mes pagado", "texto", 1.05),
            reportes.Columna("Monto", "dinero", 0.9),
            reportes.Columna("Descuento", "dinero", 0.85),
            reportes.Columna("Método", "texto", 0.95),
            reportes.Columna("N° operación", "texto", 1.0),
            reportes.Columna("Estado", "texto", 0.85),
            reportes.Columna("Cobrado por", "texto", 1.25),
        ],
        filas=filas,
        totales=[
            "", "", f"{len(pagos)} pago(s)", "", "", "TOTAL",
            total, descuentos or None, "", "", "", "",
        ],
    )
    return _respuesta_reporte(reporte, formato)


@router.get("/reporte-caja/exportar")
def exportar_reporte_caja(
    formato: str = Query("excel", description="excel | pdf"),
    fecha: date = Query(default=None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """El corte de caja del día, para imprimirlo o archivarlo al cerrar turno."""
    datos = _datos_caja(db, fecha, zona_id)
    zona = db.get(models.Zona, zona_id) if zona_id else None

    def hora(valor: Optional[str]) -> str:
        if not valor:
            return ""
        try:
            return datetime.fromisoformat(valor).strftime("%H:%M")
        except ValueError:
            return valor

    def importe(total: float, cantidad: int) -> str:
        return f"S/ {total:,.2f}  ({cantidad} pago{'' if cantidad == 1 else 's'})"

    bloques = [
        reportes.Bloque(
            "Por método de pago",
            [
                (reportes.METODO_LABEL.get(m["metodo"], str(m["metodo"]).capitalize()),
                 importe(m["total"], m["cantidad"]))
                for m in datos["por_metodo"]
            ],
        ),
        reportes.Bloque(
            "Quién cobró",
            [(u["nombre"], importe(u["total"], u["cantidad"])) for u in datos["por_usuario"]],
        ),
    ]

    reporte = reportes.Reporte(
        titulo="Corte de caja del día",
        archivo=f"corte-caja-{datos['fecha']}",
        fechar=False,
        subtitulo=f"{datos['cantidad_pagos']} pago(s) · S/ {datos['total']:,.2f} recaudado",
        filtros=[
            f"Fecha: {datetime.fromisoformat(datos['fecha']).strftime('%d/%m/%Y')}",
            f"Zona: {zona.nombre if zona else 'todas'}",
        ],
        generado_por=current_user.nombre,
        bloques=bloques,
        columnas=[
            reportes.Columna("Hora", "texto", 0.6),
            reportes.Columna("Cliente", "texto", 2.1),
            reportes.Columna("Zona", "texto", 1.1),
            reportes.Columna("Método", "texto", 1.0),
            reportes.Columna("Monto", "dinero", 0.95),
            reportes.Columna("Cobrado por", "texto", 1.4),
        ],
        filas=[
            [
                hora(p["hora"]),
                p["cliente_nombre"] or f"#{p['cliente_id']}",
                p["zona_nombre"] or "",
                reportes.METODO_LABEL.get(p["metodo_pago"], str(p["metodo_pago"]).capitalize()),
                round(p["monto"], 2),
                p["registrado_por"] or "",
            ]
            for p in datos["pagos"]
        ],
        totales=["", f"{datos['cantidad_pagos']} pago(s)", "", "TOTAL", datos["total"], ""],
    )
    return _respuesta_reporte(reporte, formato)


@router.get("/reporte-mensual-zonas/exportar")
def exportar_reporte_zonas(
    formato: str = Query("excel", description="excel | pdf"),
    mes: Optional[str] = Query(None, description="YYYY-MM — por defecto, el mes actual"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Lo recaudado en el mes, zona por zona."""
    if not mes:
        hoy = date.today()
        mes = f"{hoy.year}-{hoy.month:02d}"
    datos = _datos_zonas(db, mes)

    total = round(sum(z["total"] for z in datos), 2)
    pagos = sum(z["cantidad_pagos"] for z in datos)
    clientes = sum(z["clientes_distintos"] for z in datos)

    reporte = reportes.Reporte(
        titulo="Recaudación mensual por zona",
        archivo=f"recaudacion-por-zona-{mes}",
        fechar=False,
        subtitulo=f"{reportes.etiqueta_mes(mes)} · S/ {total:,.2f} recaudado",
        generado_por=current_user.nombre,
        columnas=[
            reportes.Columna("Zona", "texto", 2.2),
            reportes.Columna("Pagos", "entero", 0.8),
            reportes.Columna("Clientes", "entero", 0.9),
            reportes.Columna("Recaudado", "dinero", 1.1),
        ],
        filas=[
            [z["zona_nombre"], z["cantidad_pagos"], z["clientes_distintos"], z["total"]]
            for z in datos
        ],
        totales=["TOTAL", pagos, clientes, total],
    )
    return _respuesta_reporte(reporte, formato)


@router.get("/{pago_id}", response_model=schemas.PagoOut)
def get_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    pago = db.query(models.Pago).options(
        joinedload(models.Pago.cliente), joinedload(models.Pago.registrador),
    ).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    salida = schemas.PagoOut.model_validate(pago)
    # Si se cobró junto con otros meses, el recibo tiene que hablar del periodo
    # completo y del total, no de la parte que le tocó a este mes.
    if pago.grupo_adelanto:
        hermanos = db.query(models.Pago).filter(
            models.Pago.grupo_adelanto == pago.grupo_adelanto
        ).order_by(models.Pago.mes_pagado.asc()).all()
        salida.adelanto = schemas.AdelantoResumen(
            numero=hermanos[0].id,
            meses=len(hermanos),
            desde=hermanos[0].mes_pagado,
            hasta=hermanos[-1].mes_pagado,
            total=round(sum(h.monto for h in hermanos), 2),
            descuento=next((h.descuento for h in hermanos if h.descuento), None),
        )
    return salida


@router.delete("/{pago_id}")
def delete_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    pago = db.query(models.Pago).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()
    return {"ok": True}
