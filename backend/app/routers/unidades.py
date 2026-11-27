"""Unidades vehiculares (carros/motos de la empresa). CRUD solo para gerencia;
el listado también lo usan técnicos y vendedoras para elegir qué unidad cargaron
de combustible. La foto del vehículo se guarda y se sirve solo con sesión."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..almacen_fotos import guardar_imagen, borrar_imagen

router = APIRouter()

SOLO_GERENCIA = require_roles(models.RolUsuario.admin)
# Quién puede ver la lista de unidades (para elegir una al cargar combustible).
PUEDEN_VER = require_roles(
    models.RolUsuario.admin,
    models.RolUsuario.tecnico,
    models.RolUsuario.vendedor_campo,
)


def _out(u: models.Unidad) -> dict:
    return {
        "id": u.id,
        "placa": u.placa,
        "marca": u.marca,
        "modelo": u.modelo,
        "activo": u.activo,
        "tiene_foto": bool(u.foto_ruta),
        "creado_en": u.creado_en,
    }


@router.get("", response_model=List[schemas.UnidadOut])
def list_unidades(
    solo_activas: bool = Query(False, description="true = solo unidades activas (para elegir en campo)"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(PUEDEN_VER),
):
    q = db.query(models.Unidad)
    if solo_activas:
        q = q.filter(models.Unidad.activo.is_(True))
    unidades = q.order_by(models.Unidad.activo.desc(), models.Unidad.placa.asc()).all()
    return [_out(u) for u in unidades]


@router.post("", response_model=schemas.UnidadOut, status_code=201)
def create_unidad(
    data: schemas.UnidadCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    if db.query(models.Unidad).filter(models.Unidad.placa == data.placa).first():
        raise HTTPException(status_code=400, detail="Ya existe una unidad con esa placa")
    unidad = models.Unidad(
        placa=data.placa,
        marca=data.marca,
        modelo=data.modelo,
        activo=data.activo,
        registrado_por=current_user.id,
    )
    db.add(unidad)
    db.commit()
    db.refresh(unidad)
    return _out(unidad)


@router.put("/{unidad_id}", response_model=schemas.UnidadOut)
def update_unidad(
    unidad_id: int,
    data: schemas.UnidadUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    unidad = db.query(models.Unidad).filter(models.Unidad.id == unidad_id).first()
    if not unidad:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    cambios = data.model_dump(exclude_unset=True)
    if "placa" in cambios and cambios["placa"] != unidad.placa:
        if db.query(models.Unidad).filter(models.Unidad.placa == cambios["placa"]).first():
            raise HTTPException(status_code=400, detail="Ya existe una unidad con esa placa")
    for k, v in cambios.items():
        setattr(unidad, k, v)
    db.commit()
    db.refresh(unidad)
    return _out(unidad)


@router.delete("/{unidad_id}", status_code=204)
def delete_unidad(
    unidad_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    unidad = db.query(models.Unidad).filter(models.Unidad.id == unidad_id).first()
    if not unidad:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    # No se borra una unidad con historial de combustible: se perdería el gasto
    # ya reportado. En ese caso se desactiva (deja de aparecer para cargar).
    tiene_recargas = db.query(models.RecargaCombustible).filter(
        models.RecargaCombustible.unidad_id == unidad_id
    ).first()
    if tiene_recargas:
        raise HTTPException(
            status_code=400,
            detail="La unidad tiene recargas registradas. Desactívala en vez de borrarla.",
        )
    borrar_imagen(unidad.foto_ruta)
    db.delete(unidad)
    db.commit()


@router.post("/{unidad_id}/foto", response_model=schemas.UnidadOut)
def subir_foto(
    unidad_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    unidad = db.query(models.Unidad).filter(models.Unidad.id == unidad_id).first()
    if not unidad:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    nueva = guardar_imagen(archivo, "unidades")
    anterior = unidad.foto_ruta
    unidad.foto_ruta = nueva
    db.commit()
    db.refresh(unidad)
    borrar_imagen(anterior)  # recién al confirmar, para no perder la vieja si falla
    return _out(unidad)


@router.get("/{unidad_id}/foto")
def ver_foto(
    unidad_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    import os
    unidad = db.query(models.Unidad).filter(models.Unidad.id == unidad_id).first()
    if not unidad or not unidad.foto_ruta or not os.path.isfile(unidad.foto_ruta):
        raise HTTPException(status_code=404, detail="Sin foto")
    return FileResponse(unidad.foto_ruta)
