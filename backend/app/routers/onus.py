from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles

router = APIRouter()


@router.get("", response_model=List[schemas.OnuOut])
def list_onus(
    estado: Optional[models.EstadoOnu] = Query(None),
    tecnico_id: Optional[int] = Query(None),
    cliente_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Onu).options(
        joinedload(models.Onu.cliente).joinedload(models.Cliente.zona)
    )
    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.Onu.tecnico_id == current_user.id)
    elif tecnico_id:
        query = query.filter(models.Onu.tecnico_id == tecnico_id)
    if estado:
        query = query.filter(models.Onu.estado == estado)
    if cliente_id:
        query = query.filter(models.Onu.cliente_id == cliente_id)
    return query.order_by(models.Onu.numero_serie).all()


@router.post("", response_model=schemas.OnuOut, status_code=201)
def create_onu(
    data: schemas.OnuCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)),
):
    """Ingresa una ONU al almacén (lo que capturó la lectora: serie/MAC/marca)."""
    if db.query(models.Onu).filter(models.Onu.numero_serie == data.numero_serie).first():
        raise HTTPException(status_code=400, detail="Ya existe una ONU con ese número de serie")
    onu = models.Onu(**data.model_dump(), estado=models.EstadoOnu.en_almacen)
    db.add(onu)
    db.commit()
    db.refresh(onu)
    return onu


@router.post("/registrar-propio", response_model=schemas.OnuOut, status_code=201)
def registrar_onu_propio(
    data: schemas.OnuCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.tecnico)),
):
    """El técnico registra un equipo que el almacén le entregó sin pasar antes
    por el sistema (escaneando MAC/serie en campo) — queda asignado a él
    directamente, sin pasar por el stock general que administra el admin."""
    if db.query(models.Onu).filter(models.Onu.numero_serie == data.numero_serie).first():
        raise HTTPException(status_code=400, detail="Ya existe una ONU con ese número de serie")
    onu = models.Onu(
        **data.model_dump(),
        estado=models.EstadoOnu.asignado_tecnico,
        tecnico_id=current_user.id,
        fecha_asignacion_tecnico=date.today(),
    )
    db.add(onu)
    db.commit()
    db.refresh(onu)
    return onu


@router.get("/{onu_id}", response_model=schemas.OnuOut)
def get_onu(
    onu_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    onu = db.query(models.Onu).options(
        joinedload(models.Onu.cliente).joinedload(models.Cliente.zona)
    ).filter(models.Onu.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    return onu


@router.post("/{onu_id}/asignar", response_model=schemas.OnuOut)
def asignar_onu(
    onu_id: int,
    data: schemas.OnuAsignarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)),
):
    """Admin/subadmin le entrega una ONU a un técnico (sale del stock general)."""
    onu = db.query(models.Onu).filter(models.Onu.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    if onu.estado != models.EstadoOnu.en_almacen:
        raise HTTPException(status_code=400, detail="La ONU no está disponible en almacén")
    tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_id).first()
    if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
        raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")

    onu.estado = models.EstadoOnu.asignado_tecnico
    onu.tecnico_id = data.tecnico_id
    onu.fecha_asignacion_tecnico = date.today()
    db.commit()
    db.refresh(onu)
    return onu


@router.delete("/{onu_id}")
def delete_onu(
    onu_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)),
):
    """Borra una ONU del inventario (equipo registrado por error, duplicado,
    etc). Bloqueado si está instalada en un cliente — hay que retirarla
    primero para no perder ese rastro."""
    onu = db.query(models.Onu).filter(models.Onu.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    if onu.estado == models.EstadoOnu.instalado:
        raise HTTPException(status_code=400, detail="No se puede eliminar: está instalada en un cliente")
    db.delete(onu)
    db.commit()
    return {"ok": True}


@router.post("/{onu_id}/marcar", response_model=schemas.OnuOut)
def marcar_onu(
    onu_id: int,
    data: schemas.OnuMarcarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.tecnico)
    ),
):
    """Marca una ONU dañada/perdida, o la regresa al almacén (devolución)."""
    onu = db.query(models.Onu).filter(models.Onu.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    if current_user.rol == models.RolUsuario.tecnico and onu.tecnico_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta ONU no está asignada a usted")

    onu.estado = data.estado
    if data.estado == models.EstadoOnu.en_almacen:
        onu.tecnico_id = None
        onu.cliente_id = None
    db.commit()
    db.refresh(onu)
    return onu
