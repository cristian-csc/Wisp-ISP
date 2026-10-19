from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import Optional, List
from datetime import date, datetime, timedelta
import calendar
import logging
import re

import paramiko
import httpx

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, get_password_hash, require_roles, zonas_asignadas
from ..config import settings
from ..billing import monto_mensual, detalle_monto

router = APIRouter()
logger = logging.getLogger(__name__)


# ── RouterOS input sanitization ───────────────────────────────────────────────

_PPPOE_USER_RE = re.compile(r'^[a-zA-Z0-9._@-]{1,100}$')
_IPV4_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')


def _ros_str(value: str) -> str:
    """Escape a value for use inside a RouterOS double-quoted string argument.
    Strips characters that could break out of the string or chain commands."""
    return str(value).replace('\\', '').replace('"', '').replace('\n', '').replace('\r', '').replace(';', '').replace('[', '').replace(']', '')


def _validate_pppoe_user(username: str) -> str:
    if not _PPPOE_USER_RE.match(username):
        raise HTTPException(status_code=400, detail="Usuario PPPoE contiene caracteres no permitidos")
    return username


def _validate_ip(ip: str) -> str:
    if ip and not _IPV4_RE.match(ip):
        raise HTTPException(status_code=400, detail="IP estática no es una dirección IPv4 válida")
    return ip


# ── SSH MikroTik ──────────────────────────────────────────────────────────────

def _mikrotik_exec(host: str, commands: list[str]) -> dict:
    """
    SSH al MikroTik en {host} (IP WireGuard) y ejecuta cada comando RouterOS.
    Retorna {"ok": bool, "results": [...], "error": str}.
    Nunca lanza excepción — el cliente se guarda en BD aunque falle MikroTik.
    """
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=host,
            username=settings.SSH_USER,
            key_filename=settings.SSH_KEY_PATH,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
        results = []
        for cmd in commands:
            try:
                _, stdout, stderr = ssh.exec_command(cmd, timeout=10)
                results.append({
                    "cmd": cmd,
                    "out": stdout.read().decode(errors="ignore").strip(),
                    "err": stderr.read().decode(errors="ignore").strip(),
                    "rc": stdout.channel.recv_exit_status(),
                })
            except Exception as e:
                results.append({"cmd": cmd, "err": str(e), "rc": -1})
        ssh.close()
        return {"ok": True, "results": results}
    except Exception as e:
        logger.warning("MikroTik SSH %s falló: %s", host, e)
        return {"ok": False, "error": str(e), "results": []}


MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]


def _ultimos_n_meses(n: int) -> list[str]:
    hoy = date.today()
    result = []
    for i in range(n - 1, -1, -1):
        m = hoy.month - i
        y = hoy.year
        while m <= 0:
            m += 12
            y -= 1
        result.append(f"{y}-{m:02d}")
    return result

def _wa_send(phone: str, message: str):
    try:
        with httpx.Client(timeout=8) as c:
            c.post(f"{settings.WHATSAPP_API_URL}/send", json={"phone": phone, "message": message})
    except Exception as e:
        logger.warning("WhatsApp send falló: %s", e)


def _get_wg_ip(db: Session, zona_id: int) -> Optional[str]:
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    return zona.ip_wireguard if zona else None


def _check_zona_access(db: Session, current_user: models.Usuario, zona_id: int):
    """Un técnico solo puede ver/operar clientes de sus zonas asignadas."""
    if current_user.rol == models.RolUsuario.tecnico:
        if zona_id not in zonas_asignadas(db, current_user):
            raise HTTPException(status_code=403, detail="No tiene acceso a esta zona")


def _crear_secreto_pppoe(db: Session, cliente: "models.Cliente") -> dict:
    """Crea el secreto PPPoE en el MikroTik de la zona del cliente.

    Antes de crear, verifica si ya existe un secreto con ese nombre (típico
    en clientes migrados que ya estaban dados de alta en el MikroTik antes
    de pasar por este sistema). Si ya existe, NO intenta crear uno nuevo
    (eso fallaría por duplicado) — lo adopta tal cual está, sin necesidad de
    entrar al MikroTik a borrar nada a mano.
    """
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if not wg_ip:
        return {"ok": False, "error": "Zona sin IP WireGuard", "ya_existia": False}

    user = _ros_str(cliente.usuario_pppoe)

    check = _mikrotik_exec(wg_ip, [f'/ppp secret print where name="{user}"'])
    if not check["ok"]:
        return {"ok": False, "error": check.get("error", "No se pudo conectar al MikroTik"), "ya_existia": False}
    if check["results"] and check["results"][0]["out"].strip():
        return {"ok": True, "ya_existia": True, "error": None}

    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    perfil = _ros_str(plan.codigo if plan else "default")
    ip_remote = cliente.ip_estatica if cliente.ip_estatica else "0.0.0.0"
    pwd = _ros_str(cliente.password_pppoe)
    comment = _ros_str(cliente.nombre)
    cmd = (
        f'/ppp secret add name="{user}" '
        f'password="{pwd}" '
        f'profile="{perfil}" '
        f'remote-address={ip_remote} '
        f'service=pppoe '
        f'comment="{comment}"'
    )
    result = _mikrotik_exec(wg_ip, [cmd])
    if result["ok"] and result["results"] and result["results"][0].get("err"):
        # La conexión SSH funcionó pero el comando en sí falló (ej: duplicado
        # detectado en una carrera, permisos, etc.) — no lo reportamos como éxito.
        return {"ok": False, "error": result["results"][0]["err"], "ya_existia": False}
    return {**result, "ya_existia": False}


# ── Listado ───────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
def list_clientes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    zona_id: Optional[int] = None,
    estado: Optional[str] = None,
    tipo_conexion: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    )

    # Sin filtro, se comporta como siempre (todos los tipos mezclados) — lo
    # necesita el buscador de cliente de Pagos, que debe encontrar también a
    # los satelitales. El módulo "Clientes" (fibra+inalámbrico) y el de
    # "Clientes Satelital" son quienes piden el filtro explícitamente.
    if tipo_conexion:
        tipos = [t.strip() for t in tipo_conexion.split(",") if t.strip()]
        query = query.filter(models.Cliente.tipo_conexion.in_(tipos))

    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.Cliente.zona_id.in_(zonas_asignadas(db, current_user) or [-1]))
    elif current_user.rol in (models.RolUsuario.vendedor_campo, models.RolUsuario.vendedor_tienda):
        query = query.filter(models.Cliente.vendedor_id == current_user.id)

    if search:
        query = query.filter(
            or_(
                models.Cliente.nombre.ilike(f"%{search}%"),
                models.Cliente.usuario_pppoe.ilike(f"%{search}%"),
                models.Cliente.telefono.ilike(f"%{search}%"),
                models.Cliente.ip_estatica.ilike(f"%{search}%"),
            )
        )
    if zona_id:
        query = query.filter(models.Cliente.zona_id == zona_id)
    if estado:
        query = query.filter(models.Cliente.estado == estado)

    total = query.count()
    clientes = query.offset((page - 1) * per_page).limit(per_page).all()

    # Batch-query pagos de los últimos 6 meses para todos los clientes de esta página
    hoy = date.today()
    meses_6 = _ultimos_n_meses(6)
    mes_actual_date = hoy.replace(day=1)
    cliente_ids = [c.id for c in clientes]

    pagos_batch = db.query(models.Pago.cliente_id, models.Pago.mes_pagado, models.Pago.estado).filter(
        models.Pago.cliente_id.in_(cliente_ids),
        models.Pago.mes_pagado.in_(meses_6),
    ).all()

    pagos_por_cliente: dict[int, dict[str, str]] = {}
    for p in pagos_batch:
        pagos_por_cliente.setdefault(p.cliente_id, {})[p.mes_pagado] = str(p.estado)

    items = []
    for c in clientes:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        item["monto_mensual_detalle"] = detalle_monto(c, c.plan)
        c_pagos = pagos_por_cliente.get(c.id, {})
        meses_status = []
        for mes in meses_6:
            y, m = int(mes[:4]), int(mes[5:])
            mes_date = date(y, m, 1)
            if c.fecha_instalacion and mes_date < date(c.fecha_instalacion.year, c.fecha_instalacion.month, 1):
                meses_status.append({"mes": mes, "estado": "no_aplica"})
            elif mes in c_pagos:
                meses_status.append({"mes": mes, "estado": c_pagos[mes]})
            elif mes_date < mes_actual_date:
                meses_status.append({"mes": mes, "estado": "vencido"})
            else:
                meses_status.append({"mes": mes, "estado": "pendiente"})
        item["meses_pago"] = meses_status
        items.append(item)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


# ── Registrar cliente (captación por vendedor/técnico) ────────────────────────
# No toca MikroTik todavía — eso pasa recién en /aprobar. El usuario/clave
# PPPoE se derivan del DNI (regla de negocio: el DNI es lo que se registra
# como usuario y contraseña PPPoE).

@router.post("", status_code=201)
def create_cliente(
    data: schemas.ClienteCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if db.query(models.Cliente).filter(models.Cliente.dni == data.dni).first():
        raise HTTPException(status_code=400, detail="Ya existe un cliente con ese DNI")

    dump = data.model_dump()
    dump["usuario_pppoe"] = data.dni
    dump["password_pppoe"] = data.dni
    dump["vendedor_id"] = current_user.id

    cliente = models.Cliente(**dump)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Cliente registrado por {current_user.nombre} — pendiente de aprobación.",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente.id).first()

    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return {"cliente": out}


# ── Aprobar / rechazar instalación ────────────────────────────────────────────

@router.post("/{cliente_id}/aprobar")
def aprobar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="El cliente no está pendiente de aprobación")

    cliente.estado = models.EstadoCliente.aprobado
    cliente.aprobado_por_id = current_user.id
    cliente.fecha_aprobacion = datetime.utcnow()

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Instalación aprobada por {current_user.nombre}.",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # Un cliente satelital no tiene PPPoE ni pasa por ningún MikroTik — el
    # servicio lo presta Starlink directamente, no la red propia.
    if cliente.tipo_conexion == models.TipoConexion.satelital:
        return {
            "ok": True,
            "estado": "aprobado",
            "mikrotik_ok": True,
            "mikrotik_ya_existia": False,
            "mikrotik_msg": "No aplica — cliente satelital, no usa la red propia.",
        }

    mt_result = _crear_secreto_pppoe(db, cliente)
    if mt_result.get("ya_existia"):
        mikrotik_msg = "El secreto PPPoE ya existía en el MikroTik (cliente migrado) — se vinculó sin crear uno nuevo."
    else:
        mikrotik_msg = mt_result.get("error", "Secreto PPPoE creado correctamente.")

    return {
        "ok": True,
        "estado": "aprobado",
        "mikrotik_ok": mt_result["ok"],
        "mikrotik_ya_existia": mt_result.get("ya_existia", False),
        "mikrotik_msg": mikrotik_msg,
    }


@router.post("/{cliente_id}/activar-satelital")
def activar_satelital(
    cliente_id: int,
    data: schemas.ClienteActivarSatelitalRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    """Activa un cliente satelital ya aprobado — no hay fibra que tender, así
    que no pasa por /instalar (caja NAP/borne/ONU): acá se registra el equipo
    Starlink entregado y el cliente queda activo de una vez."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.tipo_conexion != models.TipoConexion.satelital:
        raise HTTPException(status_code=400, detail="Este cliente no es satelital")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado")

    cliente.estado = models.EstadoCliente.activo
    cliente.fecha_instalacion = date.today()
    cliente.fecha_ultima_activacion = date.today()
    cliente.cuenta_starlink_email = data.cuenta_starlink_email
    cliente.estado_equipo = data.estado_equipo
    cliente.equipo_marca = data.equipo_marca
    cliente.equipo_modelo = data.equipo_modelo
    cliente.equipo_serial = data.equipo_serial
    cliente.equipo_valor = data.equipo_valor
    cliente.equipo_fecha_entrega = data.equipo_fecha_entrega

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=f"Cliente satelital activado por {current_user.nombre} — equipo {data.equipo_marca} {data.equipo_modelo or ''}".strip(),
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    db.refresh(cliente)

    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente_id).first()
    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return out


@router.post("/{cliente_id}/rechazar")
def rechazar_cliente(
    cliente_id: int,
    data: schemas.ClienteRechazarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="El cliente no está pendiente de aprobación")

    cliente.estado = models.EstadoCliente.rechazado
    cliente.motivo_rechazo = data.motivo

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Instalación rechazada por {current_user.nombre}: {data.motivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    return {"ok": True, "estado": "rechazado"}


# ── Instalación física (técnico) ──────────────────────────────────────────────

@router.post("/{cliente_id}/instalar")
def instalar_cliente(
    cliente_id: int,
    data: schemas.ClienteInstalarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado para instalación")
    _check_zona_access(db, current_user, cliente.zona_id)

    caja = db.query(models.CajaNap).filter(models.CajaNap.id == data.caja_nap_id).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    borne = db.query(models.Borne).filter(
        models.Borne.caja_nap_id == caja.id,
        models.Borne.numero == data.numero_borne,
    ).first()
    if not borne:
        raise HTTPException(status_code=404, detail="Borne no encontrado en esa caja")
    if borne.estado != models.EstadoBorne.libre:
        raise HTTPException(status_code=400, detail="El borne no está libre")

    onu = db.query(models.Onu).filter(models.Onu.id == data.onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    if onu.estado != models.EstadoOnu.asignado_tecnico or (
        current_user.rol == models.RolUsuario.tecnico and onu.tecnico_id != current_user.id
    ):
        raise HTTPException(status_code=400, detail="La ONU no está disponible en el inventario de este técnico")

    hoy = date.today()
    cliente.estado = models.EstadoCliente.activo
    cliente.fecha_instalacion = hoy
    cliente.fecha_vencimiento = hoy + timedelta(days=30)
    cliente.fecha_ultima_activacion = hoy
    cliente.tecnico_instalador_id = current_user.id
    cliente.metros_cable = data.metros_cable

    borne.estado = models.EstadoBorne.ocupado
    borne.cliente_id = cliente.id
    borne.codigo_precinto = data.codigo_precinto
    borne.potencia_optica_dbm = data.potencia_optica_dbm

    onu.estado = models.EstadoOnu.instalado
    onu.cliente_id = cliente.id
    onu.fecha_instalacion = hoy

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=(
            f"Instalado por {current_user.nombre} — Caja {caja.codigo}, borne {borne.numero}, "
            f"ONU {onu.numero_serie}."
        ),
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    db.refresh(cliente)

    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        nombre = cliente.nombre.split()[0]
        monto = monto_mensual(cliente, plan)
        msg = (
            f"🟢 *WISP* — Servicio Activado\n\n"
            f"Hola *{nombre}* 🎉, tu instalación se completó y tu servicio ya está *activo*.\n\n"
            f"📶 Plan: *{plan.nombre if plan else 'Internet'}*\n"
            f"💰 Cuota mensual: *S/ {monto:.2f}*\n"
            f"📆 Próximo vencimiento: *{cliente.fecha_vencimiento.strftime('%d/%m/%Y')}*\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {"ok": True, "estado": "activo"}


@router.post("/{cliente_id}/no-instalar")
def no_instalar_cliente(
    cliente_id: int,
    data: schemas.ClienteNoInstalarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado para instalación")
    _check_zona_access(db, current_user, cliente.zona_id)

    cliente.estado = models.EstadoCliente.no_instalado
    cliente.motivo_no_instalado = data.motivo

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Instalación no efectuada — {current_user.nombre}: {data.motivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    return {"ok": True, "estado": "no_instalado"}


# ── Obtener cliente ───────────────────────────────────────────────────────────

@router.get("/{cliente_id}")
def get_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
        joinedload(models.Cliente.vendedor),
        joinedload(models.Cliente.aprobado_por),
        joinedload(models.Cliente.tecnico_instalador),
        joinedload(models.Cliente.borne).joinedload(models.Borne.caja_nap),
    ).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _check_zona_access(db, current_user, cliente.zona_id)
    if current_user.rol in (models.RolUsuario.vendedor_campo, models.RolUsuario.vendedor_tienda):
        if cliente.vendedor_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene acceso a este cliente")
    out = schemas.ClienteOut.model_validate(cliente).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente, cliente.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente, cliente.plan)
    return out


# ── Actualizar cliente ────────────────────────────────────────────────────────

@router.put("/{cliente_id}")
def update_cliente(
    cliente_id: int,
    data: schemas.ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _check_zona_access(db, current_user, cliente.zona_id)

    update_data = data.model_dump(exclude_unset=True)

    # Un cliente satelital no tiene secreto PPPoE — no hay nada que
    # sincronizar en ningún MikroTik.
    if cliente.tipo_conexion != models.TipoConexion.satelital:
        cmds = []
        wg_ip = _get_wg_ip(db, cliente.zona_id)

        user = _ros_str(cliente.usuario_pppoe)
        if "password_pppoe" in update_data:
            cmds.append(f'/ppp secret set [find name="{user}"] password="{_ros_str(update_data["password_pppoe"])}"')

        if "plan_id" in update_data:
            plan = db.query(models.Plan).filter(models.Plan.id == update_data["plan_id"]).first()
            if plan:
                cmds.append(f'/ppp secret set [find name="{user}"] profile="{_ros_str(plan.codigo)}"')

        if cmds and wg_ip:
            _mikrotik_exec(wg_ip, cmds)

    if "pin_app" in update_data and update_data["pin_app"]:
        update_data["pin_app"] = get_password_hash(update_data["pin_app"])

    for key, value in update_data.items():
        setattr(cliente, key, value)

    db.commit()
    db.refresh(cliente)
    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente_id).first()
    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return out


# ── Eliminar cliente + MikroTik ───────────────────────────────────────────────

@router.delete("/{cliente_id}")
def delete_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    usuario = _ros_str(cliente.usuario_pppoe)
    wg_ip = _get_wg_ip(db, cliente.zona_id)

    # Liberar borne/ONU asignados — no se destruyen, vuelven a disponibles
    borne = db.query(models.Borne).filter(models.Borne.cliente_id == cliente_id).first()
    if borne:
        borne.cliente_id = None
        borne.estado = models.EstadoBorne.libre
        borne.codigo_precinto = None
        borne.potencia_optica_dbm = None

    for onu in db.query(models.Onu).filter(models.Onu.cliente_id == cliente_id).all():
        onu.cliente_id = None
        onu.fecha_instalacion = None
        onu.estado = models.EstadoOnu.asignado_tecnico if onu.tecnico_id else models.EstadoOnu.en_almacen

    # Eliminar registros que no tienen sentido sin el cliente
    averia_ids = [a.id for a in db.query(models.Averia.id).filter(models.Averia.cliente_id == cliente_id).all()]
    if averia_ids:
        db.query(models.Evidencia).filter(models.Evidencia.averia_id.in_(averia_ids)).delete(synchronize_session=False)
        db.query(models.Averia).filter(models.Averia.cliente_id == cliente_id).delete(synchronize_session=False)
    db.query(models.Evidencia).filter(models.Evidencia.cliente_id == cliente_id).delete()
    orden_retiro_ids = [o.id for o in db.query(models.OrdenRetiro.id).filter(models.OrdenRetiro.cliente_id == cliente_id).all()]
    if orden_retiro_ids:
        db.query(models.Evidencia).filter(models.Evidencia.orden_retiro_id.in_(orden_retiro_ids)).delete(synchronize_session=False)
    db.query(models.OrdenRetiro).filter(models.OrdenRetiro.cliente_id == cliente_id).delete()
    db.query(models.Historial).filter(models.Historial.cliente_id == cliente_id).delete()
    db.query(models.Pago).filter(models.Pago.cliente_id == cliente_id).delete()
    db.delete(cliente)
    db.commit()

    # Eliminar secreto PPPoE del MikroTik
    mt_result = {"ok": False}
    if wg_ip:
        cmd = f'/ppp secret remove [find name="{usuario}"]'
        mt_result = _mikrotik_exec(wg_ip, [cmd])

    return {"ok": True, "mikrotik_ok": mt_result["ok"]}


# ── Cortar servicio + MikroTik ────────────────────────────────────────────────

def cortar_cliente(db: Session, cliente: models.Cliente, motivo: str, usuario_id: Optional[int] = None) -> dict:
    """Lógica real del corte — la usa tanto el endpoint manual (admin/atención
    al cliente) como el job automático del scheduler (sin usuario autenticado,
    de ahí que usuario_id sea opcional)."""
    if cliente.tipo_conexion == models.TipoConexion.satelital:
        raise HTTPException(status_code=400, detail="No se puede cortar un cliente satelital — el servicio lo presta Starlink directamente")

    cliente.estado = models.EstadoCliente.suspendido
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.corte,
        descripcion=motivo,
        usuario_id=usuario_id,
    )
    db.add(historial)
    db.commit()

    # WhatsApp primero — cliente lo recibe mientras aún tiene internet
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
        nombre = cliente.nombre.split()[0]
        hoy = date.today()
        mes_label = f"{MESES[hoy.month]} {hoy.year}"
        tiendas = f"🏪 *Tiendas autorizadas:*\n{zona.tiendas_pago}\n" if zona and zona.tiendas_pago else ""
        monto = monto_mensual(cliente, plan) if plan else 0
        msg = (
            f"🔴 *WISP* — Servicio Suspendido\n\n"
            f"Estimado *{nombre}*, su servicio de internet ha sido *suspendido* por falta de pago.\n\n"
            f"📅 Mes pendiente: *{mes_label}*\n"
            f"💰 Monto: *S/ {monto:.2f}*\n\n"
            f"Para reactivar su servicio:\n"
            f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
            f"{tiendas}"
            f"📞 *Llamadas:* {settings.PHONE_CONTACTO}\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    # Bloquear en MikroTik después del WhatsApp
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip:
        user = _ros_str(cliente.usuario_pppoe)
        cmds = []
        if cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            cmds.append(
                f'/ip firewall address-list add list=CORTE-MOROSO '
                f'address={ip_safe} comment="{user}"'
            )
        cmds.append(f'/ppp active remove [find name="{user}"]')
        mt_result = _mikrotik_exec(wg_ip, cmds)

    return {"ok": True, "estado": "suspendido", "mikrotik_ok": mt_result["ok"]}


@router.post("/{cliente_id}/cortar")
def cortar_servicio(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cortar_cliente(db, cliente, "Servicio cortado por administrador", current_user.id)


# ── Pausar servicio (a pedido del cliente, no por falta de pago) ─────────────

def _agregar_meses(d: date, meses: int) -> date:
    mes = d.month - 1 + meses
    anio = d.year + mes // 12
    mes = mes % 12 + 1
    dia = min(d.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


@router.post("/{cliente_id}/pausar")
def pausar_servicio(
    cliente_id: int,
    data: schemas.ClientePausarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Pausa temporal pedida por el propio cliente (ej. viaje) — distinta de
    un corte por falta de pago: no es morosidad, así que no debe aparecer en
    las listas de cortados/sin pago ni mandar el aviso de corte."""
    if data.meses < 1:
        raise HTTPException(status_code=400, detail="La pausa debe ser de al menos 1 mes")

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    hoy = date.today()
    pausa_hasta = _agregar_meses(hoy, data.meses)
    cliente.estado = models.EstadoCliente.pausado
    cliente.pausa_hasta = pausa_hasta

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.corte,
        descripcion=f"Servicio pausado a pedido del cliente por {data.meses} mes(es) — hasta {pausa_hasta.strftime('%d/%m/%Y')}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # WhatsApp primero — cliente lo recibe mientras aún tiene internet
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        nombre = cliente.nombre.split()[0]
        msg = (
            f"⏸️ *WISP* — Pausa Confirmada\n\n"
            f"Hola *{nombre}* 👋, confirmamos la pausa temporal de tu servicio como la solicitaste.\n\n"
            f"📅 Hasta: *{pausa_hasta.strftime('%d/%m/%Y')}*\n\n"
            f"Tu servicio se reactivará automáticamente al terminar este periodo, o antes si nos avisas.\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    # Bloquear en MikroTik (misma mecánica que un corte, pero sin el motivo de morosidad)
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip:
        user = _ros_str(cliente.usuario_pppoe)
        cmds = []
        if cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            cmds.append(
                f'/ip firewall address-list add list=CORTE-MOROSO '
                f'address={ip_safe} comment="{user}"'
            )
        cmds.append(f'/ppp active remove [find name="{user}"]')
        mt_result = _mikrotik_exec(wg_ip, cmds)

    return {"ok": True, "estado": "pausado", "pausa_hasta": pausa_hasta.isoformat(), "mikrotik_ok": mt_result["ok"]}


# ── Reactivar servicio + MikroTik ─────────────────────────────────────────────

@router.post("/{cliente_id}/reactivar")
def reactivar_servicio(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    estaba_pausado = cliente.estado == models.EstadoCliente.pausado

    hoy = date.today()
    cliente.estado = models.EstadoCliente.activo
    # Reactivar solo reconecta — NO perdona deuda. Si ya tenía una fecha de
    # vencimiento (aunque esté vencida), se deja tal cual: si seguía
    # atrasado antes del corte, sigue atrasado después de reactivar, y
    # vuelve a aparecer en "Control de clientes" hasta que se le registre
    # el pago de verdad. Solo se pone un valor por defecto si nunca tuvo uno.
    if not cliente.fecha_vencimiento:
        cliente.fecha_vencimiento = hoy + timedelta(days=30)
    debe_pendiente = cliente.fecha_vencimiento <= hoy
    cliente.fecha_ultima_activacion = hoy
    cliente.pausa_hasta = None
    nota_deuda = " — OJO: sigue con un mes pendiente de pago, no se registró ningún pago al reactivar" if debe_pendiente else ""
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=f"Servicio reactivado — vencimiento: {cliente.fecha_vencimiento.strftime('%d/%m/%Y')}{nota_deuda}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # Desbloquear en MikroTik
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip and cliente.ip_estatica:
        ip_safe = _validate_ip(cliente.ip_estatica)
        cmd = (
            f'/ip firewall address-list remove '
            f'[find where list=CORTE-MOROSO address={ip_safe}]'
        )
        mt_result = _mikrotik_exec(wg_ip, [cmd])
    elif wg_ip:
        mt_result = {"ok": True}  # Sin IP estática no hay nada que remover

    # WhatsApp automático
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        nombre = cliente.nombre.split()[0]
        if estaba_pausado:
            cierre = "Esperamos que hayas disfrutado tu pausa 🙌"
        elif debe_pendiente:
            cierre = (
                f"⚠️ Aún tienes un pago pendiente — regulariza pronto para evitar un nuevo corte.\n"
                f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}"
            )
        else:
            cierre = "¡Gracias por su pago! 🙏"
        msg = (
            f"✅ *WISP* — Servicio Reactivado\n\n"
            f"Hola *{nombre}* 🎉, su servicio de internet ha sido *reactivado* exitosamente.\n\n"
            f"📶 Plan: *{plan.nombre if plan else 'Internet'}*\n"
            f"🌐 Ya puede navegar con normalidad.\n\n"
            f"{cierre}\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {"ok": True, "estado": "activo", "mikrotik_ok": mt_result["ok"]}


# ── Compromiso de pago ────────────────────────────────────────────────────────

@router.post("/{cliente_id}/compromiso-pago")
def dar_compromiso_pago(
    cliente_id: int,
    data: schemas.CompromisoPagoRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """El cliente pidió plazo ('espérame hasta el 25'). Mientras el compromiso
    esté vigente, el job de corte automático lo saltea. Si ya estaba cortado,
    se reactiva de una vez — la deuda (fecha_vencimiento) no se toca, solo se
    le da chance de pagar sin que lo corten antes de esa fecha."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if data.fecha_limite <= date.today():
        raise HTTPException(status_code=400, detail="La fecha límite debe ser posterior a hoy")

    estaba_suspendido = cliente.estado == models.EstadoCliente.suspendido
    cliente.compromiso_pago_hasta = data.fecha_limite

    nota_reactivo = " — se reactivó el servicio" if estaba_suspendido else ""
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.compromiso_pago,
        descripcion=f"Compromiso de pago hasta el {data.fecha_limite.strftime('%d/%m/%Y')}{nota_reactivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)

    mt_result = {"ok": False}
    if estaba_suspendido:
        cliente.estado = models.EstadoCliente.activo
        cliente.fecha_ultima_activacion = date.today()
        wg_ip = _get_wg_ip(db, cliente.zona_id)
        if wg_ip and cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            cmd = f'/ip firewall address-list remove [find where list=CORTE-MOROSO address={ip_safe}]'
            mt_result = _mikrotik_exec(wg_ip, [cmd])
        elif wg_ip:
            mt_result = {"ok": True}

    db.commit()

    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        nombre = cliente.nombre.split()[0]
        reactivado = "✅ Mientras tanto, su servicio fue reactivado.\n\n" if estaba_suspendido else ""
        msg = (
            f"🤝 *WISP* — Compromiso de Pago\n\n"
            f"Hola *{nombre}*, quedó registrado su compromiso de pago hasta el "
            f"*{data.fecha_limite.strftime('%d/%m/%Y')}*.\n\n"
            f"{reactivado}"
            f"Si no se registra el pago antes de esa fecha, el servicio será suspendido.\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {
        "ok": True,
        "estado": cliente.estado.value,
        "compromiso_pago_hasta": str(cliente.compromiso_pago_hasta),
        "mikrotik_ok": mt_result["ok"],
    }


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/historial", response_model=List[schemas.HistorialOut])
def get_historial(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    return db.query(models.Historial).filter(
        models.Historial.cliente_id == cliente_id
    ).order_by(models.Historial.creado_en.desc()).all()


# ── Calendario de pagos ───────────────────────────────────────────────────────

@router.get("/{cliente_id}/calendario-pagos")
def get_calendario_pagos(
    cliente_id: int,
    anio: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    hoy = date.today()
    if not anio:
        anio = hoy.year

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    pagos = db.query(models.Pago).filter(
        models.Pago.cliente_id == cliente_id,
        models.Pago.mes_pagado.like(f"{anio}-%"),
    ).all()

    pagos_dict = {p.mes_pagado: p.estado for p in pagos}
    calendario = []
    instalacion = cliente.fecha_instalacion.replace(day=1) if cliente.fecha_instalacion else None

    for mes in range(1, 13):
        mes_str = f"{anio}-{mes:02d}"
        mes_date = date(anio, mes, 1)

        if instalacion and mes_date < instalacion:
            estado = "no_aplica"
        elif mes_date > hoy.replace(day=1):
            estado = "futuro"
        elif mes_str in pagos_dict:
            estado = pagos_dict[mes_str].value if hasattr(pagos_dict[mes_str], 'value') else str(pagos_dict[mes_str])
        else:
            estado = "vencido" if mes_date < hoy.replace(day=1) else "pendiente"

        calendario.append({"mes": mes_str, "estado": estado})

    return calendario


# ── Estado PPPoE en tiempo real ───────────────────────────────────────────────

@router.get("/{cliente_id}/pppoe-status")
def get_pppoe_status(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona)
    ).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    zona = cliente.zona
    if not zona or not zona.ip_wireguard:
        return {"conectado": False, "uptime": None, "ip_remota": None, "error": "Zona sin WireGuard"}

    result = _mikrotik_exec(zona.ip_wireguard, [
        f'/ppp active print detail where name="{_ros_str(cliente.usuario_pppoe)}"'
    ])

    if not result["ok"]:
        return {"conectado": False, "uptime": None, "ip_remota": None, "error": "Sin conexión al MikroTik"}

    output = result["results"][0]["out"] if result["results"] else ""
    conectado = bool(output.strip())

    uptime = None
    ip_remota = None
    if conectado:
        m = re.search(r'uptime=(\S+)', output)
        if m:
            uptime = m.group(1)
        m = re.search(r'\baddress=(\S+)', output)
        if m:
            ip_remota = m.group(1)

    return {"conectado": conectado, "uptime": uptime, "ip_remota": ip_remota, "error": None}
