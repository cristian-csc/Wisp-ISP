from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user
from .clientes import _mikrotik_exec

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

    rate = f"{plan.bajada_mbps}M/{plan.subida_mbps}M"
    results = []
    for zona in zonas:
        if action == "add":
            cmd = (
                f'/ppp profile add name="{plan.codigo}" '
                f'rate-limit="{rate}" '
                f'only-one=yes change-tcp-mss=yes'
            )
        elif action == "set":
            cmd = f'/ppp profile set [find name="{plan.codigo}"] rate-limit="{rate}"'
        elif action == "remove":
            cmd = f'/ppp profile remove [find name="{plan.codigo}"]'
        else:
            continue
        r = _mikrotik_exec(zona.ip_wireguard, [cmd])
        results.append({"zona": zona.nombre, **r})
        if not r["ok"]:
            logger.warning("Sync plan %s en %s falló: %s", plan.codigo, zona.nombre, r.get("error"))
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
    current_user: models.Usuario = Depends(get_current_user),
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
    current_user: models.Usuario = Depends(get_current_user),
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
    current_user: models.Usuario = Depends(get_current_user),
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
