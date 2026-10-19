from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import asyncio
import random
import httpx
import logging
from datetime import date, datetime

from ..database import get_db, SessionLocal
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..billing import monto_mensual
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

WA_API = settings.WHATSAPP_API_URL

MESES = ["", "Enero","Febrero","Marzo","Abril","Mayo","Junio",
         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]


def _mes_pendiente(cliente_id: int, db: Session) -> str:
    hoy = date.today()
    mes_str = f"{hoy.year}-{hoy.month:02d}"
    pago = db.query(models.Pago).filter(
        models.Pago.cliente_id == cliente_id,
        models.Pago.mes_pagado == mes_str,
        models.Pago.estado == models.EstadoPago.pagado,
    ).first()
    if not pago:
        return f"{MESES[hoy.month]} {hoy.year}"
    # Mes actual pagado: verificar si el anterior está pendiente
    if hoy.month == 1:
        return f"{MESES[12]} {hoy.year - 1}"
    mes_ant = f"{hoy.year}-{(hoy.month - 1):02d}"
    pago_ant = db.query(models.Pago).filter(
        models.Pago.cliente_id == cliente_id,
        models.Pago.mes_pagado == mes_ant,
        models.Pago.estado == models.EstadoPago.pagado,
    ).first()
    if not pago_ant:
        return f"{MESES[hoy.month - 1]} {hoy.year}"
    return f"{MESES[hoy.month]} {hoy.year}"


def _tiendas_text(zona) -> str:
    if zona and zona.tiendas_pago:
        return f"🏪 *Tiendas autorizadas:*\n{zona.tiendas_pago}\n"
    return ""


async def wa_request(method: str, path: str, json: dict = None):
    async with httpx.AsyncClient(timeout=10) as client:
        url = f"{WA_API}{path}"
        if method == "GET":
            r = await client.get(url)
        else:
            r = await client.post(url, json=json)
        return r.json()


@router.get("/status")
async def get_status(current_user: models.Usuario = Depends(get_current_user)):
    try:
        data = await wa_request("GET", "/status")
        return data
    except Exception:
        return {"connected": False, "status": "desconectado", "error": "No se pudo conectar al servicio WhatsApp"}


@router.get("/qr")
async def get_qr(current_user: models.Usuario = Depends(get_current_user)):
    try:
        data = await wa_request("GET", "/qr")
        return data
    except Exception:
        return {"qr": None, "error": "No se pudo obtener el QR"}


@router.post("/send")
async def send_message(
    phone: str,
    message: str,
    current_user: models.Usuario = Depends(get_current_user),
):
    try:
        data = await wa_request("POST", "/send", {"phone": phone, "message": message})
        return data
    except Exception as e:
        logger.error("Error en send manual a %s: %s", phone, e)
        raise HTTPException(status_code=500, detail="Error al enviar mensaje")


@router.post("/aviso-cobro/{cliente_id}")
async def aviso_cobro(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    phone = cliente.telefono_whatsapp or cliente.telefono
    if not phone:
        raise HTTPException(status_code=400, detail="Cliente sin número WhatsApp")

    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
    nombre = cliente.nombre.split()[0]
    mes = _mes_pendiente(cliente_id, db)
    tiendas = _tiendas_text(zona)

    monto = monto_mensual(cliente, plan) if plan else 0
    mensaje = (
        f"📶 *WISP* — Aviso de Pago\n\n"
        f"Hola *{nombre}* 👋, le recordamos que tiene pendiente el pago de:\n\n"
        f"📅 Mes: *{mes}*\n"
        f"📦 Plan: {plan.nombre if plan else 'Internet'}\n"
        f"💰 Monto: *S/ {monto:.2f}*\n\n"
        f"💳 *Formas de pago:*\n"
        f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
        f"{tiendas}"
        f"📞 Consultas: {settings.PHONE_CONTACTO}\n\n"
        f"Gracias por confiar en *WISP* 🙏"
    )

    try:
        data = await wa_request("POST", "/send", {"phone": phone, "message": mensaje})
        return {"ok": True, "resultado": data}
    except Exception as e:
        logger.warning("No se pudo enviar aviso-cobro a cliente %d: %s", cliente_id, e)
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con WhatsApp: {e}")


@router.post("/aviso-corte/{cliente_id}")
async def aviso_corte(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    phone = cliente.telefono_whatsapp or cliente.telefono
    if not phone:
        raise HTTPException(status_code=400, detail="Cliente sin número WhatsApp")

    zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    nombre = cliente.nombre.split()[0]
    mes = _mes_pendiente(cliente_id, db)
    tiendas = _tiendas_text(zona)

    monto = monto_mensual(cliente, plan) if plan else 0
    mensaje = (
        f"⚠️ *WISP* — Aviso de Corte\n\n"
        f"Estimado *{nombre}*, le informamos que su servicio de internet será *suspendido* por falta de pago.\n\n"
        f"📅 Mes pendiente: *{mes}*\n"
        f"💰 Monto: *S/ {monto:.2f}*\n\n"
        f"Para evitar el corte pague a la brevedad:\n"
        f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
        f"{tiendas}"
        f"📞 *Llamadas:* {settings.PHONE_CONTACTO}\n\n"
        f"_WISP — Internet para todos_ 🌐"
    )

    try:
        data = await wa_request("POST", "/send", {"phone": phone, "message": mensaje})
        return {"ok": True, "resultado": data}
    except Exception as e:
        logger.warning("No se pudo enviar aviso-corte a cliente %d: %s", cliente_id, e)
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con WhatsApp: {e}")


@router.post("/broadcast-cobros", response_model=schemas.MensajeMasivoOut, status_code=201)
def broadcast_cobros(
    background_tasks: BackgroundTasks,
    mes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Recordatorio de pago a todos los activos que no pagaron el mes indicado.
    Antes mandaba todo de golpe en un loop dentro del request — eso arriesgaba
    que WhatsApp bloquee el número por spam. Ahora usa el mismo motor del
    mensaje masivo: corre en segundo plano, con pausa aleatoria entre envíos,
    y se puede cancelar a la mitad."""
    if not mes:
        hoy = date.today()
        mes = f"{hoy.year}-{hoy.month:02d}"
    mes_parts = mes.split("-")
    mes_label = f"{MESES[int(mes_parts[1])]} {mes_parts[0]}"

    pagaron = db.query(models.Pago.cliente_id).filter(
        models.Pago.mes_pagado == mes
    ).subquery()

    sin_pago = db.query(models.Cliente).filter(
        models.Cliente.estado == models.EstadoCliente.activo,
        (models.Cliente.telefono_whatsapp.isnot(None)) | (models.Cliente.telefono.isnot(None)),
        ~models.Cliente.id.in_(pagaron),
    ).all()

    if not sin_pago:
        raise HTTPException(status_code=400, detail="No hay clientes activos con pago pendiente ese mes")

    campania = models.MensajeMasivo(
        mensaje=f"Recordatorio de pago — {mes_label}",
        plantilla_nombre="recordatorio_cobros",
        zona_ids=None,
        estados_incluidos=[models.EstadoCliente.activo.value],
        meta={"mes": mes, "mes_label": mes_label},
        total_destinatarios=len(sin_pago),
        creado_por_id=current_user.id,
    )
    db.add(campania)
    db.flush()

    for cliente in sin_pago:
        db.add(models.MensajeMasivoEnvio(mensaje_masivo_id=campania.id, cliente_id=cliente.id))
    db.commit()
    db.refresh(campania)

    background_tasks.add_task(_ejecutar_mensaje_masivo, campania.id)
    return campania


@router.post("/recordatorio-preventivo/ejecutar")
async def ejecutar_recordatorio_preventivo(
    dias_antes: int = 3,
    current_user: models.Usuario = Depends(get_current_user),
):
    from ..scheduler import job_recordatorio_preventivo
    result = await job_recordatorio_preventivo(dias_antes=dias_antes)
    return result


# ── Mensajes masivos ────────────────────────────────────────────────────────────
# Aviso libre (ej. "mantenimiento en Cabanillas") a todos los clientes de una o
# varias zonas. Corre en segundo plano con pausa aleatoria entre cada envío —
# mandarlos todos de golpe arriesga que WhatsApp bloquee el número por spam.

def _query_destinatarios(db: Session, zona_ids: Optional[List[int]], estados: List[str]):
    query = db.query(models.Cliente).filter(
        models.Cliente.estado.in_(estados),
        (models.Cliente.telefono_whatsapp.isnot(None)) | (models.Cliente.telefono.isnot(None)),
    )
    if zona_ids:
        query = query.filter(models.Cliente.zona_id.in_(zona_ids))
    return query


def _personalizar(mensaje: str, cliente: models.Cliente) -> str:
    nombre = cliente.nombre.split()[0] if cliente.nombre else ""
    return mensaje.replace("{nombre}", nombre)


def _texto_recordatorio_cobro(cliente: models.Cliente, mes_label: str) -> str:
    plan = cliente.plan
    zona = cliente.zona
    nombre = cliente.nombre.split()[0] if cliente.nombre else ""
    tiendas = _tiendas_text(zona)
    monto = monto_mensual(cliente, plan) if plan else 0
    return (
        f"📶 *WISP* — Recordatorio de Pago\n\n"
        f"Hola *{nombre}* 👋, tiene pendiente el pago de:\n\n"
        f"📅 Mes: *{mes_label}*\n"
        f"📦 Plan: {plan.nombre if plan else 'Internet'}\n"
        f"💰 Monto: *S/ {monto:.2f}*\n\n"
        f"💳 *Formas de pago:*\n"
        f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
        f"{tiendas}"
        f"📞 Consultas: {settings.PHONE_CONTACTO}\n\n"
        f"¡Gracias por su pago! 🙏 — *WISP*"
    )


async def _ejecutar_mensaje_masivo(mensaje_masivo_id: int):
    db: Session = SessionLocal()
    try:
        campania = db.query(models.MensajeMasivo).filter(models.MensajeMasivo.id == mensaje_masivo_id).first()
        if not campania:
            return

        envios = db.query(models.MensajeMasivoEnvio).options(
            joinedload(models.MensajeMasivoEnvio.cliente).joinedload(models.Cliente.plan),
            joinedload(models.MensajeMasivoEnvio.cliente).joinedload(models.Cliente.zona),
        ).filter(
            models.MensajeMasivoEnvio.mensaje_masivo_id == mensaje_masivo_id,
            models.MensajeMasivoEnvio.estado == models.EstadoEnvioMasivo.pendiente,
        ).all()

        for i, envio in enumerate(envios):
            db.refresh(campania)
            if campania.estado == models.EstadoMensajeMasivo.cancelado:
                break

            cliente = envio.cliente
            phone = (cliente.telefono_whatsapp or cliente.telefono) if cliente else None
            try:
                if not phone:
                    raise ValueError("Cliente sin número de WhatsApp")
                if campania.plantilla_nombre == "recordatorio_cobros":
                    mes_label = (campania.meta or {}).get("mes_label", "")
                    texto = _texto_recordatorio_cobro(cliente, mes_label)
                else:
                    texto = _personalizar(campania.mensaje, cliente)
                await wa_request("POST", "/send", {"phone": phone, "message": texto})
                envio.estado = models.EstadoEnvioMasivo.enviado
                campania.enviados += 1
            except Exception as e:
                envio.estado = models.EstadoEnvioMasivo.fallido
                envio.error = str(e)
                campania.fallidos += 1
            envio.enviado_en = datetime.utcnow()
            db.commit()

            if i < len(envios) - 1:
                await asyncio.sleep(random.uniform(5, 10))

        db.refresh(campania)
        if campania.estado != models.EstadoMensajeMasivo.cancelado:
            campania.estado = models.EstadoMensajeMasivo.completado
        campania.finalizado_en = datetime.utcnow()
        db.commit()
    finally:
        db.close()


@router.get("/masivos/destinatarios-count")
def contar_destinatarios_masivo(
    zona_ids: Optional[str] = Query(None, description="IDs de zona separados por coma; vacío = todas"),
    estados: str = Query("activo", description="Estados separados por coma"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    ids = [int(z) for z in zona_ids.split(",") if z.strip()] if zona_ids else None
    lista_estados = [e.strip() for e in estados.split(",") if e.strip()]
    return {"count": _query_destinatarios(db, ids, lista_estados).count()}


@router.post("/masivos", response_model=schemas.MensajeMasivoOut, status_code=201)
def crear_mensaje_masivo(
    data: schemas.MensajeMasivoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if not data.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    estados = [e.value for e in data.estados] or [models.EstadoCliente.activo.value]
    destinatarios = _query_destinatarios(db, data.zona_ids, estados).all()
    if not destinatarios:
        raise HTTPException(status_code=400, detail="No hay clientes que coincidan con los filtros elegidos")

    campania = models.MensajeMasivo(
        mensaje=data.mensaje,
        plantilla_nombre=data.plantilla_nombre,
        zona_ids=data.zona_ids or None,
        estados_incluidos=estados,
        total_destinatarios=len(destinatarios),
        creado_por_id=current_user.id,
    )
    db.add(campania)
    db.flush()

    for cliente in destinatarios:
        db.add(models.MensajeMasivoEnvio(mensaje_masivo_id=campania.id, cliente_id=cliente.id))
    db.commit()
    db.refresh(campania)

    background_tasks.add_task(_ejecutar_mensaje_masivo, campania.id)
    return campania


@router.get("/masivos", response_model=List[schemas.MensajeMasivoOut])
def listar_mensajes_masivos(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    return (
        db.query(models.MensajeMasivo)
        .options(joinedload(models.MensajeMasivo.creado_por))
        .order_by(models.MensajeMasivo.creado_en.desc())
        .limit(50)
        .all()
    )


@router.get("/masivos/{mensaje_id}", response_model=schemas.MensajeMasivoOut)
def obtener_mensaje_masivo(
    mensaje_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    campania = (
        db.query(models.MensajeMasivo)
        .options(joinedload(models.MensajeMasivo.creado_por))
        .filter(models.MensajeMasivo.id == mensaje_id)
        .first()
    )
    if not campania:
        raise HTTPException(status_code=404, detail="No encontrado")
    return campania


@router.post("/masivos/{mensaje_id}/cancelar", response_model=schemas.MensajeMasivoOut)
def cancelar_mensaje_masivo(
    mensaje_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    campania = db.query(models.MensajeMasivo).filter(models.MensajeMasivo.id == mensaje_id).first()
    if not campania:
        raise HTTPException(status_code=404, detail="No encontrado")
    if campania.estado != models.EstadoMensajeMasivo.en_progreso:
        raise HTTPException(status_code=400, detail="Esta campaña ya terminó")
    campania.estado = models.EstadoMensajeMasivo.cancelado
    db.commit()
    db.refresh(campania)
    return campania
