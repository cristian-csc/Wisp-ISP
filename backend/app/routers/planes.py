from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from .clientes import _mikrotik_exec, _ros_str

router = APIRouter()
logger = logging.getLogger(__name__)


def _sync_plan_mikrotik(plan: models.Plan, db: Session, action: str):
    """
    Sincroniza el perfil PPPoE en todos los MikroTiks activos.
    action: 'add' | 'set' | 'remove'
    """
    if plan.tipo_conexion == models.TipoConexion.satelital:
        # Un plan satelital no tiene perfil PPPoE — el servicio no pasa por
        # ningún MikroTik propio.
        return []

    zonas = db.query(models.Zona).filter(
        models.Zona.activo == True,
        models.Zona.ip_wireguard != None,
    ).all()

    # RouterOS espera rate-limit como "subida/bajada", no al revés: los dos
    # valores son desde el punto de vista del ROUTER (rx = lo que recibe del
    # cliente = su subida; tx = lo que le envía = su bajada). Hasta el
    # 2026-11-14 se escribía al revés, así que un plan de 100 de bajada y 20
    # de subida le daba al cliente 100 de subida y 20 de bajada. Nunca llegó a
    # notarse porque los perfiles de los routers en producción estaban puestos
    # a mano y el sistema no los había tocado.
    rate = f"{plan.subida_mbps}M/{plan.bajada_mbps}M"
    codigo = _ros_str(plan.codigo)
    results = []
    for zona in zonas:
        if action == "add":
            # Un perfil solo con nombre y velocidad NO da servicio: el cliente
            # se autentica y se queda sin IP, sin DNS y sin puerta de enlace.
            # Si a la zona le falta alguno de esos datos, es preferible no
            # crear nada y decirlo, antes que dejar un perfil a medias que
            # parece configurado.
            faltan = []
            if not zona.ip_lan:
                faltan.append("la IP LAN")
            if not zona.pool_pppoe:
                faltan.append("el pool PPPoE")
            if faltan:
                motivo = (
                    f"No se creó el perfil: falta {' y '.join(faltan)} en la zona. "
                    "Complétalo en la ficha de la zona y vuelve a guardar el plan."
                )
                results.append({"zona": zona.nombre, "ok": False, "error": motivo})
                logger.warning("Perfil %s no creado en %s: %s", codigo, zona.nombre, motivo)
                continue
            cmd = (
                f'/ppp profile add name="{codigo}" '
                f'local-address={_ros_str(zona.ip_lan)} '
                f'remote-address={_ros_str(zona.pool_pppoe)} '
                f'dns-server={_ros_str(zona.ip_lan)} '
                f'rate-limit="{rate}" '
                f'only-one=yes change-tcp-mss=yes'
            )
        elif action == "set":
            # Al editar solo se toca la velocidad: la red de la zona
            # (direcciones, pool, DNS) es cosa del router, no del plan.
            cmd = f'/ppp profile set [find name="{codigo}"] rate-limit="{rate}"'
        elif action == "remove":
            cmd = f'/ppp profile remove [find name="{codigo}"]'
        else:
            continue

        r = _mikrotik_exec(zona.ip_wireguard, [cmd])

        # El SSH puede funcionar y el comando fallar igual (perfil duplicado,
        # pool inexistente…). _mikrotik_exec devuelve ok=True en ese caso, así
        # que hay que mirar lo que contestó RouterOS.
        salida_error = ""
        if r.get("ok") and r.get("results"):
            salida_error = (r["results"][0].get("err") or "").strip()

        if action == "add" and "already have" in salida_error.lower():
            # El perfil ya existía en ese router (típico cuando el MikroTik se
            # configuró a mano antes de entrar al sistema). No se toca su
            # configuración de red; solo se alinea la velocidad con el plan.
            r = _mikrotik_exec(
                zona.ip_wireguard,
                [f'/ppp profile set [find name="{codigo}"] rate-limit="{rate}"'],
            )
            results.append({"zona": zona.nombre, "ya_existia": True, **r})
            continue

        if salida_error:
            r = {**r, "ok": False, "error": salida_error}

        results.append({"zona": zona.nombre, **r})
        if not r["ok"]:
            logger.warning(
                "Sync plan %s en %s falló: %s",
                codigo, zona.nombre, r.get("error") or salida_error,
            )
    return results


@router.get("", response_model=List[schemas.PlanOut])
def list_planes(
    tipo_conexion: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Plan)
    if tipo_conexion:
        query = query.filter(models.Plan.tipo_conexion == tipo_conexion)
    return query.order_by(models.Plan.precio).all()


@router.post("", response_model=schemas.PlanOut, status_code=201)
def create_plan(
    data: schemas.PlanCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if db.query(models.Plan).filter(models.Plan.codigo == data.codigo).first():
        raise HTTPException(status_code=400, detail="El código de plan ya existe")
    plan = models.Plan(**data.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    _sync_plan_mikrotik(plan, db, "add")
    return plan


@router.put("/{plan_id}", response_model=schemas.PlanOut)
def update_plan(
    plan_id: int,
    data: schemas.PlanCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    for k, v in data.model_dump().items():
        setattr(plan, k, v)
    db.commit()
    db.refresh(plan)
    _sync_plan_mikrotik(plan, db, "set")
    return plan


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    clientes = db.query(models.Cliente).filter(models.Cliente.plan_id == plan_id).count()
    if clientes > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: {clientes} cliente(s) usan este plan")
    _sync_plan_mikrotik(plan, db, "remove")
    db.delete(plan)
    db.commit()
    return {"ok": True}
