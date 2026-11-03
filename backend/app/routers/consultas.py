"""Consulta automática del nombre a partir del documento.

La hace SIEMPRE el backend, nunca la web ni el móvil directamente: el token del
proveedor viajaría dentro del APK y cualquiera podría extraerlo y gastar la
cuota. Como todo pasa por aquí, además se lleva una cuenta única del consumo.

Nada de esto puede impedir dar de alta un cliente: si la cuota se agotó, el
proveedor no responde o el documento no existe, se devuelve un motivo claro y
el formulario deja escribir el nombre a mano, igual que antes.
"""

import logging
import re
from datetime import date

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from .. import models
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

_DNI_RE = re.compile(r'^\d{8}$')
_RUC_RE = re.compile(r'^(10|15|17|20)\d{9}$')


def _contador(db: Session) -> models.ConsultaDocumentoMes:
    """La fila del mes en curso, creándola la primera vez."""
    hoy = date.today()
    fila = (
        db.query(models.ConsultaDocumentoMes)
        .filter(
            models.ConsultaDocumentoMes.anio == hoy.year,
            models.ConsultaDocumentoMes.mes == hoy.month,
        )
        .first()
    )
    if not fila:
        fila = models.ConsultaDocumentoMes(anio=hoy.year, mes=hoy.month, cantidad=0)
        db.add(fila)
        db.commit()
        db.refresh(fila)
    return fila


@router.get("/uso")
def uso_del_mes(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Cuántas consultas van este mes, para mostrarlo en el panel."""
    fila = _contador(db)
    limite = settings.CONSULTAS_LIMITE_MENSUAL
    return {
        "usadas": fila.cantidad,
        "limite": limite,
        "restantes": max(0, limite - fila.cantidad),
        "aviso": fila.cantidad >= settings.CONSULTAS_AVISO_DESDE,
        "agotado": fila.cantidad >= limite,
        "anio": fila.anio,
        "mes": fila.mes,
        "configurado": bool(settings.APISPERU_TOKEN),
    }


@router.get("/documento")
def consultar_documento(
    tipo: str = Query(..., pattern="^(dni|ruc)$"),
    numero: str = Query(..., min_length=8, max_length=11),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Devuelve el nombre asociado a un DNI o la razón social de un RUC.

    Respuesta siempre con la misma forma:
      { encontrado: bool, nombre: str|None, origen: str, motivo: str|None, uso: {...} }

    `origen` dice de dónde salió el dato: 'sistema' si ya era cliente,
    'proveedor' si se consultó, o el motivo por el que no se pudo.
    """
    numero = numero.strip()
    patron = _DNI_RE if tipo == "dni" else _RUC_RE
    if not patron.match(numero):
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "formato",
            "motivo": "El DNI debe tener 8 dígitos"
            if tipo == "dni"
            else "El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20",
            "uso": uso_del_mes(db, current_user),
        }

    # 1 ─ ¿Ya es cliente nuestro? No gasta consulta y además avisa del duplicado.
    columna = models.Cliente.dni if tipo == "dni" else models.Cliente.ruc
    ya = db.query(models.Cliente).filter(columna == numero).first()
    if ya:
        return {
            "encontrado": True,
            "nombre": ya.nombre if tipo == "ruc" else (ya.responsable_nombre or ya.nombre),
            "origen": "sistema",
            "motivo": f"Ya está registrado como cliente: {ya.nombre}",
            "cliente_id": ya.id,
            "uso": uso_del_mes(db, current_user),
        }

    if not settings.APISPERU_TOKEN:
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "sin_token",
            "motivo": "La consulta automática no está configurada",
            "uso": uso_del_mes(db, current_user),
        }

    # 2 ─ ¿Queda cuota?
    fila = _contador(db)
    if fila.cantidad >= settings.CONSULTAS_LIMITE_MENSUAL:
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "sin_cuota",
            "motivo": (
                f"Se agotaron las {settings.CONSULTAS_LIMITE_MENSUAL} consultas de este mes. "
                "Escribe el nombre a mano."
            ),
            "uso": uso_del_mes(db, current_user),
        }

    # 3 ─ Consultar al proveedor
    url = f"{settings.APISPERU_URL}/{tipo}/{numero}"
    try:
        with httpx.Client(timeout=8.0) as cli:
            r = cli.get(url, params={"token": settings.APISPERU_TOKEN})
    except Exception as e:  # red caída, DNS, timeout…
        logger.warning("Consulta %s %s falló: %s", tipo, numero, e)
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "sin_respuesta",
            "motivo": "El servicio de consulta no responde. Escribe el nombre a mano.",
            "uso": uso_del_mes(db, current_user),
        }

    # La consulta se gastó apenas el proveedor contestó, haya encontrado o no.
    fila.cantidad += 1
    db.commit()
    db.refresh(fila)

    if r.status_code == 404:
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "no_existe",
            "motivo": "No se encontró ese documento",
            "uso": uso_del_mes(db, current_user),
        }
    if r.status_code != 200:
        logger.warning("Consulta %s %s devolvió %s", tipo, numero, r.status_code)
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "error_proveedor",
            "motivo": "El servicio de consulta devolvió un error. Escribe el nombre a mano.",
            "uso": uso_del_mes(db, current_user),
        }

    datos = r.json()
    if tipo == "dni":
        partes = [
            (datos.get("nombres") or "").strip(),
            (datos.get("apellidoPaterno") or "").strip(),
            (datos.get("apellidoMaterno") or "").strip(),
        ]
        nombre = " ".join(p for p in partes if p).title()
    else:
        nombre = (datos.get("razonSocial") or "").strip()

    if not nombre:
        return {
            "encontrado": False,
            "nombre": None,
            "origen": "no_existe",
            "motivo": "No se encontró ese documento",
            "uso": uso_del_mes(db, current_user),
        }

    salida = {
        "encontrado": True,
        "nombre": nombre,
        "origen": "proveedor",
        "motivo": None,
        "uso": uso_del_mes(db, current_user),
    }
    if tipo == "ruc":
        # Datos públicos de la empresa, útiles para que el operador confirme
        salida["estado"] = datos.get("estado")
        salida["condicion"] = datos.get("condicion")
        salida["direccion"] = datos.get("direccion")
    return salida
