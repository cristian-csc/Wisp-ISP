import asyncio
import logging
import random
from datetime import date, timedelta

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session, joinedload

from . import models
from .billing import monto_mensual
from .config import settings
from .mensajeria import cabeceras_bot
from . import lineas
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
        # Pausa entre mensajes: mandarlos de corrido es la forma más rápida de
        # que WhatsApp tome el número por spam y lo bloquee. Es la misma espera
        # que usa el envío masivo del panel (routers/whatsapp.py). Importa más
        # aquí que allá: este trabajo corre solo, de madrugada, sin que nadie
        # lo esté mirando.
        for i, cliente in enumerate(clientes):
            phone = cliente.telefono_whatsapp or cliente.telefono
            plan = cliente.plan
            zona = cliente.zona
            nombre = cliente.nombre.split()[0]
            tiendas = f"🏪 *Tiendas autorizadas:*\n{zona.tiendas_pago}\n" if zona and zona.tiendas_pago else ""
            monto = monto_mensual(cliente, plan) if plan else 0

            # Cada línea vence por su cuenta y se cobra por separado, así que
            # al titular con dos le llegan dos avisos. Sin decir cuál es cada
            # uno, el segundo parece el primero repetido y se ignora; peor
            # aún, paga una sola vez creyendo que cubrió las dos.
            cual = lineas.etiqueta(cliente.linea)
            servicio = f"su *{cual}* ({cliente.usuario_pppoe})" if cual else "su servicio"

            mensaje = (
                f"📅 *WISP* — Recordatorio de Pago\n\n"
                f"Hola *{nombre}* 👋, le recordamos que {servicio} vence en *{dias_antes} días* "
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
                    await c.post(f"{settings.WHATSAPP_API_URL}/send",
                                 json={"phone": phone, "message": mensaje},
                                 headers=cabeceras_bot())
                enviados += 1
            except Exception as e:
                logger.warning("Recordatorio falló para %s: %s", cliente.nombre, e)

            if i < len(clientes) - 1:
                await asyncio.sleep(random.uniform(5, 10))

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
                # A un hilo del pool, y no aquí mismo.
                #
                # cortar_cliente es síncrona y por cada cliente hace una
                # petición HTTP a WhatsApp (8 s de timeout) y abre una conexión
                # SSH al MikroTik (10 s de conexión más 10 s por comando).
                # Ninguna de las dos cede el control, y este trabajo corre en
                # el bucle de eventos del único proceso que atiende la API: con
                # 100 clientes a cortar y una zona cuyo router no contesta, el
                # panel, la app y el bot se quedaban muertos entre 15 y 30
                # minutos. Todos los días, a las nueve de la mañana.
                await asyncio.to_thread(
                    cortar_cliente, db, cliente,
                    "Servicio cortado automáticamente por falta de pago",
                )
                cortados += 1
            except Exception as e:
                db.rollback()
                logger.warning("Corte automático falló para %s: %s", cliente.nombre, e)

        logger.info("Corte automático: %d cortados de %d candidatos", cortados, len(candidatos))
        return {"cortados": cortados, "candidatos": len(candidatos)}
    finally:
        db.close()


async def job_backup_diario():
    """El respaldo de cada noche.

    Existe porque hasta ahora el único respaldo era el que alguien se
    acordara de pulsar en el panel. No había cron, ni trabajo aquí, ni nada en
    scripts/: el RPO real era «desde el último que alguien recordó hacer».

    Va en un hilo por lo mismo que el corte automático: pg_dump es un proceso
    externo y esperarlo en el bucle de eventos para la API entera.

    A las 03:30 y no a medianoche: a esa hora no hay nadie cobrando, y queda
    lejos del recordatorio de las 08:00 y del corte de las 09:00 para que tres
    trabajos no se peleen por el mismo disco.
    """
    from .routers.admin import hacer_backup

    try:
        resultado = await asyncio.to_thread(hacer_backup)
    except Exception as e:
        # Se anota como ERROR y no como WARNING: un respaldo que falla en
        # silencio es exactamente cómo se pierde una base de datos.
        logger.error("Respaldo diario FALLÓ: %s", e)
        return {"ok": False, "error": str(e)}

    logger.info(
        "Respaldo diario listo — %s (%d KB)",
        resultado["filename"], resultado["size_kb"],
    )

    # Y fuera del servidor, si está configurado. El respaldo en el disco de al
    # lado de la base protege de un borrado por error; esto, de perder la
    # máquina. Nunca lanza: un fallo al enviar no puede dejar el respaldo
    # local sin hacer, que es lo único que ya está garantizado.
    from . import respaldos

    enviado, detalle = await asyncio.to_thread(
        respaldos.preparar_y_enviar, resultado["ruta"],
    )
    if enviado:
        logger.info("Respaldo enviado fuera del servidor — %s", detalle)
    elif (settings.BACKUP_REMOTO_CMD or "").strip():
        # Configurado y falló: eso sí es un problema que alguien debe ver.
        logger.error("El respaldo NO salió del servidor — %s", detalle)
    else:
        # Sin configurar: se dice una vez por noche y sin alarmismo, para que
        # no se olvide que la copia fuera no existe todavía.
        logger.warning("Respaldo solo en este disco — %s", detalle)

    return {"ok": True, "enviado_fuera": enviado, **resultado}


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
    scheduler.add_job(
        job_backup_diario,
        CronTrigger(hour=3, minute=30, timezone="America/Lima"),
        id="backup_diario",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler iniciado — respaldo 03:30, recordatorio 08:00, "
        "corte automático 09:00 (hora Lima)"
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
