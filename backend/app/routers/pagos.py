import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, or_
from typing import Optional
from datetime import date, timedelta
import calendar
import threading
import httpx
import logging

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user
from ..config import settings
from ..billing import monto_mensual, detalle_monto

logger = logging.getLogger(__name__)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


def _sumar_un_mes(d: date) -> date:
    """Avanza exactamente un mes respetando días al final de mes (ej: 31 ene → 28/29 feb)."""
    mes = d.month % 12 + 1
    anio = d.year + (1 if d.month == 12 else 0)
    dia = min(d.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


def _mensaje_confirmacion_pago(cliente: models.Cliente, pago: models.Pago, plan: models.Plan) -> str:
    anio, mes = map(int, pago.mes_pagado.split("-"))
    if cliente.fecha_vencimiento:
        fecha_limite = cliente.fecha_vencimiento.strftime("%d/%m/%Y")
    else:
        ultimo_dia = calendar.monthrange(anio, mes)[1]
        fecha_limite = f"{ultimo_dia:02d}/{mes:02d}/{anio}"

    nombres = cliente.nombre.split()[0]
    plan_nombre = plan.nombre if plan else "Internet"
    monto = f"{pago.monto:.2f}"
    mes_nombres = [
        "", "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
    ]
    mes_label = f"{mes_nombres[mes]} {anio}"

    return (
        f"✅ *WISP* — Pago Confirmado\n\n"
        f"Hola *{nombres}* 🎉, tu pago fue registrado exitosamente:\n\n"
        f"📅 Mes: *{mes_label}*\n"
        f"💰 Monto: *S/ {monto}*\n"
        f"📶 Plan: {plan_nombre}\n"
        f"📆 Activo hasta: *{fecha_limite}*\n\n"
        f"¡Gracias por tu pago puntual! 🙏\n"
        f"_WISP — Internet para todos_ 🌐"
    )


def _enviar_confirmacion_pago(cliente: models.Cliente, pago: models.Pago, plan: models.Plan):
    """Envía confirmación de pago por WhatsApp en segundo plano (no bloquea
    la respuesta ni lanza excepciones) — se usa al registrar el pago."""
    phone = (cliente.telefono_whatsapp or cliente.telefono or "").strip()
    if not phone:
        logger.warning("WhatsApp pago omitido — cliente %d sin número de teléfono", cliente.id)
        return

    mensaje = _mensaje_confirmacion_pago(cliente, pago, plan)
    logger.info("WhatsApp pago: enviando a %s (cliente %d)", phone, cliente.id)

    def _enviar():
        try:
            with httpx.Client(timeout=10) as http:
                r = http.post(
                    f"{settings.WHATSAPP_API_URL}/send",
                    json={"phone": phone, "message": mensaje},
                )
                if r.status_code == 200:
                    logger.info("WhatsApp pago enviado OK a %s", phone)
                else:
                    logger.warning("WhatsApp pago falló HTTP %d a %s: %s", r.status_code, phone, r.text[:200])
        except Exception as e:
            logger.warning("WhatsApp pago excepción a %s: %s", phone, e)

    threading.Thread(target=_enviar, daemon=True).start()

router = APIRouter()


@router.get("", response_model=dict)
def list_pagos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    cliente_id: Optional[int] = None,
    mes: Optional[str] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Pago).options(
        joinedload(models.Pago.cliente),
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

    query = query.order_by(models.Pago.fecha_pago.desc())
    total = query.count()
    pagos = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": [schemas.PagoOut.model_validate(p) for p in pagos],
    }


@router.post("", response_model=schemas.PagoOut, status_code=201)
def create_pago(
    data: schemas.PagoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == data.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Check duplicate (mismo cliente + mes)
    existing = db.query(models.Pago).filter(
        models.Pago.cliente_id == data.cliente_id,
        models.Pago.mes_pagado == data.mes_pagado,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un pago para {data.mes_pagado}")

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

    datos_pago = data.model_dump()
    datos_pago["numero_operacion"] = numero_operacion
    pago = models.Pago(**datos_pago, registrado_por=current_user.id)
    db.add(pago)

    # Solo reactivar si es un pago real (no corte_temporal)
    if data.estado == models.EstadoPago.pagado and cliente.estado == models.EstadoCliente.suspendido:
        cliente.estado = models.EstadoCliente.activo
        historial = models.Historial(
            cliente_id=cliente.id,
            tipo=models.TipoHistorial.activacion,
            descripcion=f"Reactivado automáticamente por pago del mes {data.mes_pagado}",
            usuario_id=current_user.id,
        )
        db.add(historial)

    historial_pago = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.pago,
        descripcion=f"Pago registrado: S/{data.monto} - Mes {data.mes_pagado} - Método: {data.metodo_pago}",
        usuario_id=current_user.id,
    )
    db.add(historial_pago)

    # Solo actualizar fecha_vencimiento para pagos reales, no cortes temporales
    if data.estado == models.EstadoPago.pagado:
        anio_p, mes_p = map(int, data.mes_pagado.split("-"))
        next_mes  = mes_p % 12 + 1
        next_anio = anio_p + (1 if mes_p == 12 else 0)
        dia_ciclo = cliente.fecha_instalacion.day if cliente.fecha_instalacion else 1
        dia_ciclo = min(dia_ciclo, calendar.monthrange(next_anio, next_mes)[1])
        nueva_vencimiento = date(next_anio, next_mes, dia_ciclo)
        # Nunca retroceder si ya hay una fecha posterior (pagos de meses atrasados)
        cliente.fecha_vencimiento = max(nueva_vencimiento, cliente.fecha_vencimiento or date.today())
        # Ya pagó — el compromiso que tenía (si había) queda resuelto
        cliente.compromiso_pago_hasta = None

    db.commit()
    db.refresh(pago)
    db.refresh(cliente)

    # Notificación WhatsApp — no bloqueante, falla silenciosa
    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    _enviar_confirmacion_pago(cliente, pago, plan)

    return pago


@router.post("/{pago_id}/comprobante", response_model=schemas.PagoOut)
def subir_comprobante_pago(
    pago_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
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
    current_user: models.Usuario = Depends(get_current_user),
):
    pago = db.query(models.Pago).filter(models.Pago.id == pago_id).first()
    if not pago or not pago.ruta_comprobante or not os.path.isfile(pago.ruta_comprobante):
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    return FileResponse(pago.ruta_comprobante)


@router.post("/{pago_id}/reenviar-whatsapp")
def reenviar_confirmacion_whatsapp(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
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

    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    mensaje = _mensaje_confirmacion_pago(cliente, pago, plan)

    try:
        with httpx.Client(timeout=10) as http:
            r = http.post(f"{settings.WHATSAPP_API_URL}/send", json={"phone": phone, "message": mensaje})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con WhatsApp: {e}")

    if r.status_code != 200:
        detalle = r.json().get("error") if r.headers.get("content-type", "").startswith("application/json") else r.text
        raise HTTPException(status_code=502, detail=f"WhatsApp no pudo enviar el mensaje: {detalle}")

    return {"ok": True, "telefono": phone}


@router.get("/resumen-mensual")
def resumen_mensual(
    anio: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
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


@router.get("/reporte-caja")
def reporte_caja(
    fecha: date = Query(default=None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Corte de caja del día: cuánto entró, por qué método (para saber qué
    hay que cuadrar en efectivo vs. lo digital) y quién lo cobró — clave
    para que atención al cliente rinda cuentas al final del turno."""
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


@router.get("/reporte-mensual-zonas")
def reporte_mensual_zonas(
    mes: Optional[str] = Query(None, description="YYYY-MM — por defecto, el mes actual"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
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


@router.get("/clientes-sin-pago")
def clientes_sin_pago(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
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
    current_user: models.Usuario = Depends(get_current_user),
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


@router.get("/pausas-por-vencer")
def pausas_por_vencer(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
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


@router.get("/{pago_id}", response_model=schemas.PagoOut)
def get_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    pago = db.query(models.Pago).options(
        joinedload(models.Pago.cliente), joinedload(models.Pago.registrador),
    ).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return pago


@router.delete("/{pago_id}")
def delete_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    pago = db.query(models.Pago).filter(models.Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()
    return {"ok": True}
