from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
import re

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from .clientes import _mikrotik_exec, _ros_str

router = APIRouter()
logger = logging.getLogger(__name__)


def _perfiles_del_router(zona) -> tuple[dict, str]:
    """Lee los perfiles PPPoE de un MikroTik: {nombre: rate-limit}.

    Devuelve ({}, motivo) si no se pudo hablar con el router. Un perfil sin
    rate-limit (como el "default" de fábrica) aparece con cadena vacía.
    """
    r = _mikrotik_exec(zona.ip_wireguard, ["/ppp profile print detail"])
    if not r.get("ok"):
        return {}, r.get("error", "No se pudo conectar con el router")

    salida = (r["results"][0].get("out") or "") if r.get("results") else ""
    perfiles = {}
    # La salida trae un perfil por bloque; name= y rate-limit= pueden venir
    # con o sin comillas segun la version de RouterOS.
    for bloque in re.split(r"\n(?=\s*\d+\s)", salida):
        m_nombre = re.search(r'name="?([^"\s]+)"?', bloque)
        if not m_nombre:
            continue
        m_rate = re.search(r'rate-limit="?([^"\s]+)"?', bloque)
        perfiles[m_nombre.group(1)] = m_rate.group(1) if m_rate else ""
    return perfiles, ""


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
    db.delete(plan)
    db.commit()
    return {"ok": True}


@router.get("/verificacion")
def verificar_planes(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Compara los planes del panel con los perfiles reales de cada router.

    No escribe nada: solo mira y reporta. Se consulta UNA vez por zona y se
    comparan todos los planes contra esa lectura, en vez de una conexión por
    plan y zona — con 15 routers y 4 planes, eso serían 60 conexiones SSH
    para la misma información.

    Es una operación lenta (habla con todos los routers), así que va detrás de
    un botón y no se ejecuta al guardar un plan.
    """
    zonas = db.query(models.Zona).filter(
        models.Zona.activo == True,
        models.Zona.ip_wireguard != None,
    ).all()
    planes = db.query(models.Plan).filter(
        models.Plan.tipo_conexion != models.TipoConexion.satelital
    ).order_by(models.Plan.codigo).all()

    filas = []
    for zona in zonas:
        perfiles, error = _perfiles_del_router(zona)
        if error:
            filas.append({
                "zona": zona.nombre,
                "sin_contacto": True,
                "detalle": error,
                "planes": [],
            })
            continue

        estado_planes = []
        for plan in planes:
            esperado = f"{plan.subida_mbps}M/{plan.bajada_mbps}M"
            en_router = perfiles.get(plan.codigo)
            if en_router is None:
                estado = "falta"
                detalle = "El router no tiene ese perfil"
            elif en_router != esperado:
                estado = "difiere"
                detalle = f"Router: {en_router} · Panel: {esperado}"
            else:
                estado = "ok"
                detalle = en_router
            estado_planes.append({
                "codigo": plan.codigo,
                "nombre": plan.nombre,
                "estado": estado,
                "detalle": detalle,
            })

        filas.append({
            "zona": zona.nombre,
            "sin_contacto": False,
            "detalle": f"{len(perfiles)} perfil(es) en el router",
            "perfiles_del_router": sorted(perfiles.keys()),
            "planes": estado_planes,
        })

    return {"zonas": filas, "total_planes": len(planes)}


@router.get("/perfiles-de-zona/{zona_id}")
def perfiles_de_zona(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Los perfiles PPPoE que tiene ese router, tal cual.

    Sirve para elegir el código de un plan de una lista real en vez de
    escribirlo a mano y arriesgarse a una errata que solo se descubre cuando
    un cliente no puede conectarse.
    """
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    if not zona.ip_wireguard:
        raise HTTPException(
            status_code=400,
            detail="La zona todavía no tiene túnel WireGuard configurado.",
        )
    perfiles, error = _perfiles_del_router(zona)
    if error:
        raise HTTPException(status_code=502, detail=error)
    return {
        "zona": zona.nombre,
        "perfiles": [
            {"nombre": n, "rate_limit": r} for n, r in sorted(perfiles.items())
        ],
    }
