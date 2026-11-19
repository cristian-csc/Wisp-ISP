"""Validar y anotar ONUs.

Todo lo que cambia una ONU pasa por `anotar`, para que su historial cuente
el recorrido completo: no importa si el cambio vino del panel, de la app del
técnico, de una avería o de una orden de retiro.
"""
import re
from typing import Optional

from sqlalchemy.orm import Session

from . import models

# Los cuatro primeros caracteres de la serie GPON dicen el fabricante.
FABRICANTES = {
    "ASKY": "Askey",
    "MSTC": "Mitrastar",
    "HWTC": "Huawei",
    "ZTEG": "ZTE",
    "FHTT": "FiberHome",
    "TPLG": "TP-Link",
    "ALCL": "Nokia",
    "VSOL": "V-SOL",
    "GPON": "Genérica",
    "SCOM": "Sercomm",
    "CDTC": "C-Data",
    "UBNT": "Ubiquiti",
}

_SERIE = re.compile(r"^[A-Z]{4}[0-9A-F]{8}$")
_SERIE_HEX = re.compile(r"^[0-9A-F]{16}$")


def normalizar_serie(texto: str) -> str:
    """Serie GPON como la imprime la etiqueta: 4 letras del fabricante y 8
    dígitos hexadecimales (ASKY10790001). Si llega en hexadecimal completo
    (41534B5910790001, como la muestran algunas OLT) se traduce. Lanza
    ValueError con un mensaje para la persona si no es válida."""
    s = re.sub(r"[\s\-_:]", "", texto or "").upper()
    if not s:
        raise ValueError("Escribe o escanea el número de serie")
    if _SERIE_HEX.match(s):
        try:
            prefijo = bytes.fromhex(s[:8]).decode("ascii")
        except (ValueError, UnicodeDecodeError):
            prefijo = ""
        if re.fullmatch(r"[A-Z]{4}", prefijo):
            s = prefijo + s[8:]
    if not _SERIE.match(s):
        raise ValueError(
            "La serie GPON tiene 4 letras y 8 caracteres entre 0-9 y A-F (por ejemplo ASKY10790001)"
        )
    return s


def normalizar_mac(texto: Optional[str]) -> Optional[str]:
    """MAC en el formato AA:BB:CC:DD:EE:FF, venga con dos puntos, guiones,
    puntos o sin separar. Vacía es válida: no todas las cajas la traen."""
    if texto is None or not texto.strip():
        return None
    s = re.sub(r"[\s:\-\.]", "", texto).upper()
    if not re.fullmatch(r"[0-9A-F]{12}", s):
        raise ValueError("La MAC tiene 12 caracteres entre 0-9 y A-F (por ejemplo A4:B1:C2:3D:4E:5F)")
    if s in ("000000000000", "FFFFFFFFFFFF"):
        raise ValueError("Esa MAC no es de un equipo real")
    if int(s[1], 16) & 1:
        raise ValueError("Esa MAC es de grupo (multicast), no de un equipo: revisa el segundo carácter")
    return ":".join(s[i:i + 2] for i in range(0, 12, 2))


def fabricante_de(serie: str) -> Optional[str]:
    return FABRICANTES.get(serie[:4])


def anotar(
    db: Session,
    onu: models.Onu,
    tipo: str,
    usuario: Optional[models.Usuario],
    estado_anterior: Optional[models.EstadoOnu] = None,
    persona_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    nota: Optional[str] = None,
) -> None:
    """Deja constancia de un cambio ya hecho en `onu`."""
    db.add(models.OnuMovimiento(
        onu_id=onu.id,
        tipo=tipo,
        estado_anterior=estado_anterior.value if estado_anterior else None,
        estado_nuevo=onu.estado.value,
        persona_id=persona_id,
        cliente_id=cliente_id,
        nota=(nota or "").strip()[:255] or None,
        registrado_por_id=usuario.id if usuario else None,
    ))
