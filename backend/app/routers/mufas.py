from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from math import asin, cos, radians, sin, sqrt

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles, zonas_asignadas

router = APIRouter()


def _scope_zonas(query, db: Session, current_user: models.Usuario):
    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.Mufa.zona_id.in_(zonas_asignadas(db, current_user) or [-1]))
    return query


def _mufa_to_out(mufa: models.Mufa, db: Session) -> dict:
    total_cajas = db.query(models.CajaNap).filter(models.CajaNap.mufa_id == mufa.id).count()
    return {
        "id": mufa.id,
        "codigo": mufa.codigo,
        "zona_id": mufa.zona_id,
        "lat": mufa.lat,
        "lng": mufa.lng,
        "descripcion": mufa.descripcion,
        "trazado": mufa.trazado,
        "corridas": [_corrida_to_out(c) for c in mufa.corridas],
        "activo": mufa.activo,
        "creado_en": mufa.creado_en,
        "total_cajas": total_cajas,
    }


@router.get("", response_model=List[schemas.MufaOut])
def list_mufas(
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Mufa).filter(models.Mufa.activo == True)
    query = _scope_zonas(query, db, current_user)
    if zona_id:
        query = query.filter(models.Mufa.zona_id == zona_id)
    return [_mufa_to_out(m, db) for m in query.all()]


@router.post("", response_model=schemas.MufaOut, status_code=201)
def create_mufa(
    data: schemas.MufaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """El encargado registra una mufa nueva al mapear la zona — no toca
    MikroTik/WireGuard, es solo infraestructura física de fibra."""
    if db.query(models.Mufa).filter(models.Mufa.codigo == data.codigo).first():
        raise HTTPException(status_code=400, detail="Ya existe una mufa con ese código")
    if not db.query(models.Zona).filter(models.Zona.id == data.zona_id).first():
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    mufa = models.Mufa(**data.model_dump())
    db.add(mufa)
    db.commit()
    db.refresh(mufa)
    return _mufa_to_out(mufa, db)


@router.get("/{mufa_id}", response_model=schemas.MufaOut)
def get_mufa(
    mufa_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    mufa = db.query(models.Mufa).filter(models.Mufa.id == mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    if current_user.rol == models.RolUsuario.tecnico and mufa.zona_id not in zonas_asignadas(db, current_user):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta zona")
    return _mufa_to_out(mufa, db)


@router.get("/{mufa_id}/cajas-nap", response_model=List[schemas.CajaNapOut])
def list_cajas_de_mufa(
    mufa_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    mufa = db.query(models.Mufa).filter(models.Mufa.id == mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    return db.query(models.CajaNap).filter(models.CajaNap.mufa_id == mufa_id).all()


@router.put("/{mufa_id}", response_model=schemas.MufaOut)
def update_mufa(
    mufa_id: int,
    data: schemas.MufaUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    mufa = db.query(models.Mufa).filter(models.Mufa.id == mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(mufa, k, v)
    db.commit()
    db.refresh(mufa)
    return _mufa_to_out(mufa, db)


@router.delete("/{mufa_id}")
def delete_mufa(
    mufa_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    mufa = db.query(models.Mufa).filter(models.Mufa.id == mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    cajas = db.query(models.CajaNap).filter(models.CajaNap.mufa_id == mufa_id).count()
    if cajas > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {cajas} caja(s) NAP asignadas")
    db.delete(mufa)
    db.commit()
    return {"ok": True}


# ── Corridas ──────────────────────────────────────────────────────────────────


def _metros_de_trazado(puntos) -> Optional[float]:
    """Largo del trazado en metros, sumando tramo a tramo.

    Es la distancia en linea recta entre los puntos dibujados, no la del cable
    real: sirve como punto de partida para que nadie tenga que medir a ojo, y
    se puede corregir a mano.
    """
    if not puntos or len(puntos) < 2:
        return None
    total = 0.0
    R = 6371000.0  # radio de la Tierra en metros
    for a, b in zip(puntos, puntos[1:]):
        lat1 = radians(a["lat"] if isinstance(a, dict) else a.lat)
        lng1 = radians(a["lng"] if isinstance(a, dict) else a.lng)
        lat2 = radians(b["lat"] if isinstance(b, dict) else b.lat)
        lng2 = radians(b["lng"] if isinstance(b, dict) else b.lng)
        h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
        total += 2 * R * asin(min(1.0, sqrt(h)))
    return round(total, 1)


def _corrida_to_out(c: models.Corrida) -> dict:
    return {
        "id": c.id,
        "mufa_id": c.mufa_id,
        "nombre": c.nombre,
        "color": c.color,
        "metros": c.metros,
        "trazado": c.trazado,
    }


def _mufa_o_404(mufa_id: int, db: Session) -> models.Mufa:
    mufa = db.query(models.Mufa).filter(models.Mufa.id == mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    return mufa


@router.post("/{mufa_id}/corridas", response_model=schemas.CorridaOut, status_code=201)
def crear_corrida(
    mufa_id: int,
    data: schemas.CorridaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    _mufa_o_404(mufa_id, db)
    if len(data.trazado) < 2:
        raise HTTPException(status_code=400, detail="Una corrida necesita al menos dos puntos")
    puntos = [p.model_dump() for p in data.trazado]
    corrida = models.Corrida(
        mufa_id=mufa_id,
        nombre=data.nombre.strip() or "Corrida",
        color=(data.color or "#8754ec").strip(),
        metros=data.metros if data.metros is not None else _metros_de_trazado(puntos),
        trazado=puntos,
    )
    db.add(corrida)
    db.commit()
    db.refresh(corrida)
    return _corrida_to_out(corrida)


@router.put("/{mufa_id}/corridas/{corrida_id}", response_model=schemas.CorridaOut)
def actualizar_corrida(
    mufa_id: int,
    corrida_id: int,
    data: schemas.CorridaUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    corrida = db.query(models.Corrida).filter(
        models.Corrida.id == corrida_id,
        models.Corrida.mufa_id == mufa_id,
    ).first()
    if not corrida:
        raise HTTPException(status_code=404, detail="Corrida no encontrada")

    valores = data.model_dump(exclude_unset=True)
    if "trazado" in valores and valores["trazado"] is not None:
        puntos = [dict(p) for p in valores["trazado"]]
        if len(puntos) < 2:
            raise HTTPException(status_code=400, detail="Una corrida necesita al menos dos puntos")
        corrida.trazado = puntos
        # Si se redibuja y no se dijo el metraje, se recalcula: dejar el viejo
        # seria peor que no tener ninguno, porque parece medido.
        if "metros" not in valores:
            corrida.metros = _metros_de_trazado(puntos)
    if "nombre" in valores and valores["nombre"]:
        corrida.nombre = valores["nombre"].strip()
    if "color" in valores and valores["color"]:
        corrida.color = valores["color"].strip()
    if "metros" in valores:
        corrida.metros = valores["metros"]

    db.commit()
    db.refresh(corrida)
    return _corrida_to_out(corrida)


@router.delete("/{mufa_id}/corridas/{corrida_id}")
def borrar_corrida(
    mufa_id: int,
    corrida_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    corrida = db.query(models.Corrida).filter(
        models.Corrida.id == corrida_id,
        models.Corrida.mufa_id == mufa_id,
    ).first()
    if not corrida:
        raise HTTPException(status_code=404, detail="Corrida no encontrada")
    db.delete(corrida)
    db.commit()
    return {"ok": True}
