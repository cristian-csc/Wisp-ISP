from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

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
