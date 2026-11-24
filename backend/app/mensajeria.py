"""Envío de mensajes por WhatsApp a través del bot propio.

Un solo sitio que sabe cómo se le habla al bot (`/send` para texto y
`/send-file` para adjuntos), para que cada módulo solo se ocupe de redactar.
Todas las funciones son síncronas y nunca lanzan: devuelven (ok, detalle) para
que quien llama decida si avisa, reintenta o lo deja pasar.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

import httpx

from .config import settings

logger = logging.getLogger(__name__)


def cabeceras_bot() -> dict:
    """La clave compartida con el bot de WhatsApp.

    El bot puede mandar mensajes en nombre de la empresa, así que no debe
    aceptar peticiones de cualquiera que alcance su puerto. Un solo sitio la
    arma para que ningún módulo se olvide de mandarla.
    """
    if settings.WHATSAPP_API_TOKEN:
        return {"X-API-Token": settings.WHATSAPP_API_TOKEN}
    return {}


def oculta(telefono: str) -> str:
    """Un número para escribir en el log sin dejarlo entero: 9****7069.

    En los registros hace falta saber *a qué* número se escribió para poder
    investigar un problema, pero no hace falta que el número completo de un
    cliente quede guardado en texto plano en los logs del servidor.
    """
    t = (telefono or "").strip()
    if len(t) <= 5:
        return "***"
    return f"{t[0]}{'*' * (len(t) - 5)}{t[-4:]}"


def telefono_de(cliente) -> str:
    """El número al que se le escribe a un cliente: el de WhatsApp si lo tiene."""
    return (getattr(cliente, "telefono_whatsapp", None) or getattr(cliente, "telefono", None) or "").strip()


def enviar_texto(phone: str, mensaje: str, timeout: float = 15) -> tuple[bool, str]:
    """Manda un mensaje de texto. Devuelve (ok, detalle)."""
    if not phone:
        return False, "sin número de teléfono"
    try:
        with httpx.Client(timeout=timeout) as http:
            r = http.post(
                f"{settings.WHATSAPP_API_URL}/send",
                json={"phone": phone, "message": mensaje},
                headers=cabeceras_bot(),
            )
        if r.status_code == 200:
            return True, "enviado"
        return False, _detalle(r)
    except Exception as e:
        return False, str(e)


def enviar_archivo(
    phone: str,
    caption: str,
    filename: str,
    contenido: bytes,
    mimetype: str = "application/pdf",
    timeout: float = 30,
) -> tuple[bool, str]:
    """Manda un archivo con un texto de descripción.

    Si el bot todavía no tiene `/send-file` (versión vieja) responde 404 y acá
    se cae de vuelta al mensaje de texto: el cliente igual recibe el aviso.
    """
    if not phone:
        return False, "sin número de teléfono"
    try:
        with httpx.Client(timeout=timeout) as http:
            r = http.post(
                f"{settings.WHATSAPP_API_URL}/send-file",
                headers=cabeceras_bot(),
                json={
                    "phone": phone,
                    "caption": caption,
                    "filename": filename,
                    "mimetype": mimetype,
                    "base64": base64.b64encode(contenido).decode(),
                },
            )
            if r.status_code == 200:
                return True, "archivo enviado"
            if r.status_code != 404:
                return False, _detalle(r)
            logger.info("El bot no tiene /send-file — se manda solo el texto")
    except Exception as e:
        return False, str(e)
    return enviar_texto(phone, caption, timeout=timeout)


def _detalle(r: httpx.Response) -> str:
    """El motivo que dio el bot, en corto."""
    try:
        if r.headers.get("content-type", "").startswith("application/json"):
            return f"HTTP {r.status_code}: {r.json().get('error')}"
    except Exception:
        pass
    return f"HTTP {r.status_code}: {r.text[:200]}"


def contacto_empresa() -> Optional[str]:
    """Los teléfonos de la empresa, para cerrar los mensajes."""
    return settings.EMPRESA_TELEFONOS or None


def bot_conectado(timeout: float = 5) -> bool:
    """¿El bot tiene sesión de WhatsApp abierta? Sin lanzar nunca.

    Versión síncrona de lo que hace `wa_request("GET", "/status")`. Hace falta
    porque quien pregunta es `get_notificaciones`, que el panel consulta cada
    30 segundos desde cada pestaña abierta: siendo `async def` esa espera
    corría en el bucle de eventos y detenía la API entera varias veces por
    minuto. Como `def` normal, FastAPI la lleva al pool de hilos, y entonces lo
    que hace falta aquí es un cliente síncrono.

    El timeout es más corto que el de enviar un mensaje a propósito: esto es
    un adorno de la campana de notificaciones. Si el bot tarda, la respuesta
    correcta es decir que no se sabe, no hacer esperar a quien abrió el panel.
    """
    try:
        with httpx.Client(timeout=timeout) as http:
            r = http.get(f"{settings.WHATSAPP_API_URL}/status", headers=cabeceras_bot())
        return bool(r.status_code == 200 and r.json().get("connected"))
    except Exception as e:
        logger.debug("No se pudo consultar el estado del bot: %s", e)
        return False
