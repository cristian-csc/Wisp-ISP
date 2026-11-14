from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import subprocess
import re
import socket
import logging
import base64
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

def wg_show_dump() -> list[dict]:
    """
    Parsea `wg show wg0 dump` — se ejecuta por SSH en la VPS, porque el
    backend ya no vive en la misma máquina que el túnel WireGuard (esa es
    la VPS; el backend corre en el servidor local de la empresa).
    Retorna lista de peers con: pubkey, endpoint, allowed_ips,
    last_handshake (epoch), rx_bytes, tx_bytes.
    """
    result = _ssh_vps("wg show wg0 dump")
    if not result["ok"]:
        logger.warning("wg show dump falló: %s", result["output"])
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
            "online": int(last_hs) > 0 and (
                (datetime.utcnow().timestamp() - int(last_hs)) < 180
            ),
        })
    return peers


def wg_peer_status(pubkey: str) -> Optional[dict]:
    """Retorna el estado del peer con esa clave pública, o None si no existe."""
    for p in wg_show_dump():
        if p["pubkey"] == pubkey:
            return p
    return None


def wg_add_peer(pubkey: str, allowed_ips: str, comment: str = "") -> dict:
    """Agrega peer al wg0.conf de la VPS y lo aplica con wg set — todo por
    SSH, porque el backend corre en el servidor local, no en la VPS."""
    conf_path = settings.WG_CONFIG_PATH

    leido = _ssh_vps(f"cat {conf_path}")
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
    escrito = _ssh_vps(f"echo {b64_block} | base64 -d >> {conf_path}")
    if not escrito["ok"]:
        return {"ok": False, "error": f"Error escribiendo config en la VPS: {escrito['output']}"}

    # Aplicar sin reiniciar
    ips_clean = allowed_ips.replace(" ", "")
    aplicado = _ssh_vps(f"wg set wg0 peer {pubkey} allowed-ips {ips_clean}")
    if not aplicado["ok"]:
        return {"ok": False, "error": f"wg set falló: {aplicado['output']}"}
    return {"ok": True}


def wg_remove_peer(pubkey: str) -> dict:
    """Elimina peer del wg0.conf de la VPS y de la interfaz activa — por
    SSH, mismo motivo que wg_add_peer."""
    conf_path = settings.WG_CONFIG_PATH

    leido = _ssh_vps(f"cat {conf_path}")
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
    escrito = _ssh_vps(f"echo {b64_content} | base64 -d > {conf_path}")
    if not escrito["ok"]:
        return {"ok": False, "error": f"Error escribiendo config en la VPS: {escrito['output']}"}

    quitado = _ssh_vps(f"wg set wg0 peer {pubkey} remove")
    if not quitado["ok"]:
        return {"ok": False, "error": f"wg set remove falló: {quitado['output']}"}
    return {"ok": True}


# Roles que pueden ver la red por dentro (túnel, router, direcciones IP).
# Atención al cliente, técnicos y vendedoras entran a Zonas para consultar
# cobertura: no necesitan —ni deben recibir— la configuración de la red.
_ROLES_VEN_RED = (
    models.RolUsuario.admin,
)


def _ve_la_red(usuario: Optional[models.Usuario]) -> bool:
    return bool(usuario) and usuario.rol in _ROLES_VEN_RED


def _zona_to_dict(zona, db: Session, usuario: Optional[models.Usuario] = None) -> dict:
    """La zona tal como la ve `usuario`.

    Los campos de red solo se incluyen para los roles que los administran. No
    basta con esconderlos en la pantalla: si viajan en la respuesta, quedan al
    alcance de cualquiera que mire las peticiones del navegador.
    """
    total = db.query(models.Cliente).filter(models.Cliente.zona_id == zona.id).count()
    activos = db.query(models.Cliente).filter(
        models.Cliente.zona_id == zona.id,
        models.Cliente.estado == models.EstadoCliente.activo,
    ).count()

    datos = {
        "id": zona.id,
        "nombre": zona.nombre,
        "lat": zona.lat,
        "lng": zona.lng,
        "descripcion": zona.descripcion,
        "tiendas_pago": zona.tiendas_pago,
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
    })
    return datos


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[dict])
def list_zonas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    zonas = db.query(models.Zona).filter(models.Zona.activo == True).all()
    return [_zona_to_dict(z, db, current_user) for z in zonas]


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
    wg_peer = wg_peer_status(zona.wg_public_key) if zona.wg_public_key else None

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
