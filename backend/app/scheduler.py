import logging
from datetime import date, timedelta

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session, joinedload

from . import models
from .billing import monto_mensual
from .config import settings
from .database import SessionLocal

logger = logging.getLogger(__name__)

MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
         "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]


async def job_recordatorio_preventivo(dias_antes: int = 3):
    db: Session = SessionLocal()
    try:
        hoy = date.today()
        fecha_objetivo = hoy + timedelta(days=dias_antes)
        mes_actual = f"{hoy.year}-{hoy.month:02d}"

        pagaron = db.query(models.Pago.cliente_id).filter(
            models.Pago.mes_pagado == mes_actual,
            models.Pago.estado == models.EstadoPago.pagado,
        ).subquery()

        clientes = db.query(models.Cliente).options(
            joinedload(models.Cliente.plan),
            joinedload(models.Cliente.zona),
        ).filter(
            models.Cliente.estado == models.EstadoCliente.activo,
            models.Cliente.fecha_vencimiento == fecha_objetivo,
            (models.Cliente.telefono_whatsapp.isnot(None)) | (models.Cliente.telefono.isnot(None)),
            ~models.Cliente.id.in_(pagaron),
        ).all()

        enviados = 0
        for cliente in clientes:
            phone = cliente.telefono_whatsapp or cliente.telefono
            plan = cliente.plan
            zona = cliente.zona
            nombre = cliente.nombre.split()[0]
            tiendas = f"🏪 *Tiendas autorizadas:*\n{zona.tiendas_pago}\n" if zona and zona.tiendas_pago else ""
            monto = monto_mensual(cliente, plan) if plan else 0
            mensaje = (
                f"📅 *WISP* — Recordatorio de Pago\n\n"
                f"Hola *{nombre}* 👋, le recordamos que su servicio vence en *{dias_antes} días* "
                f"({fecha_objetivo.strftime('%d/%m/%Y')}).\n\n"
                f"📦 Plan: {plan.nombre if plan else 'Internet'}\n"
                f"💰 Monto: *S/ {monto:.2f}*\n\n"
                f"💳 *Formas de pago:*\n"
                f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
                f"{tiendas}"
                f"📞 Consultas: {settings.PHONE_CONTACTO}\n\n"
                f"¡Gracias por su pago! 🙏 — *WISP*"
            )
            try:
                async with httpx.AsyncClient(timeout=8) as c:
                    await c.post(f"{settings.WHATSAPP_API_URL}/send", json={"phone": phone, "message": mensaje})
                enviados += 1
            except Exception as e:
                logger.warning("Recordatorio falló para %s: %s", cliente.nombre, e)

        logger.info("Recordatorios preventivos: %d enviados de %d clientes", enviados, len(clientes))
        return {"enviados": enviados, "total": len(clientes)}
    finally:
        db.close()


async def job_corte_automatico():
    from .routers.clientes import cortar_cliente

    db: Session = SessionLocal()
    try:
        hoy = date.today()
        limite = hoy - timedelta(days=settings.DIAS_GRACIA)

        candidatos = db.query(models.Cliente).filter(
            models.Cliente.estado == models.EstadoCliente.activo,
            models.Cliente.fecha_vencimiento.isnot(None),
            models.Cliente.fecha_vencimiento <= limite,
            models.Cliente.tipo_conexion != models.TipoConexion.satelital,
        ).all()

        cortados = 0
        for cliente in candidatos:
            if cliente.compromiso_pago_hasta and cliente.compromiso_pago_hasta >= hoy:
                continue  # tiene compromiso de pago vigente, se saltea por ahora
            try:
                cortar_cliente(db, cliente, "Servicio cortado automáticamente por falta de pago")
                cortados += 1
            except Exception as e:
                db.rollback()
                logger.warning("Corte automático falló para %s: %s", cliente.nombre, e)

        logger.info("Corte automático: %d cortados de %d candidatos", cortados, len(candidatos))
        return {"cortados": cortados, "candidatos": len(candidatos)}
    finally:
        db.close()


scheduler = AsyncIOScheduler(timezone="America/Lima")


def init_scheduler():
    scheduler.add_job(
        job_recordatorio_preventivo,
        CronTrigger(hour=8, minute=0, timezone="America/Lima"),
        id="recordatorio_preventivo",
        replace_existing=True,
    )
    scheduler.add_job(
        job_corte_automatico,
        CronTrigger(hour=9, minute=0, timezone="America/Lima"),
        id="corte_automatico",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler iniciado — recordatorio 08:00, corte automático 09:00 (hora Lima)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
