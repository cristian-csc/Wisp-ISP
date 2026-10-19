from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles

router = APIRouter()


def _ordenes_query(db: Session):
    return db.query(models.OrdenRetiro).options(
        joinedload(models.OrdenRetiro.cliente).joinedload(models.Cliente.zona),
        joinedload(models.OrdenRetiro.tecnico_asignado),
    )


def _con_onu_actual(db: Session, orden: models.OrdenRetiro) -> models.OrdenRetiro:
    """La ONU/router que hoy está instalado en el cliente — no es un campo de
    la tabla, se calcula para que el técnico sepa cuál retirar sin adivinar el ID."""
    onu_actual = None
    if orden.cliente_id:
        onu_actual = (
            db.query(models.Onu)
            .filter(models.Onu.cliente_id == orden.cliente_id, models.Onu.estado == models.EstadoOnu.instalado)
            .first()
        )
    orden.onu_actual = onu_actual
    return orden


@router.get("", response_model=List[schemas.OrdenRetiroOut])
def list_ordenes_retiro(
    estado: Optional[models.EstadoOrdenRetiro] = Query(None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = _ordenes_query(db)
    if estado:
        query = query.filter(models.OrdenRetiro.estado == estado)
    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.OrdenRetiro.tecnico_asignado_id == current_user.id)

    ordenes = query.order_by(models.OrdenRetiro.fecha_solicitud.desc()).all()

    if zona_id:
        ordenes = [o for o in ordenes if o.cliente and o.cliente.zona_id == zona_id]

    return [_con_onu_actual(db, o) for o in ordenes]


@router.post("", response_model=schemas.OrdenRetiroOut, status_code=201)
def create_orden_retiro(
    data: schemas.OrdenRetiroCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.vendedor_tienda)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == data.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado not in (
        models.EstadoCliente.activo, models.EstadoCliente.suspendido, models.EstadoCliente.pausado,
    ):
        raise HTTPException(status_code=400, detail="El cliente no tiene un servicio activo para retirar")

    ya_pendiente = db.query(models.OrdenRetiro).filter(
        models.OrdenRetiro.cliente_id == data.cliente_id,
        models.OrdenRetiro.estado == models.EstadoOrdenRetiro.pendiente,
    ).first()
    if ya_pendiente:
        raise HTTPException(status_code=400, detail="Este cliente ya tiene una orden de retiro pendiente")

    if data.tecnico_asignado_id:
        tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_asignado_id).first()
        if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
            raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")

    orden = models.OrdenRetiro(
        cliente_id=data.cliente_id,
        motivo=data.motivo,
        tecnico_asignado_id=data.tecnico_asignado_id,
    )
    db.add(orden)
    db.commit()
    orden = _ordenes_query(db).filter(models.OrdenRetiro.id == orden.id).first()
    return _con_onu_actual(db, orden)


@router.get("/{orden_id}", response_model=schemas.OrdenRetiroOut)
def get_orden_retiro(
    orden_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    orden = _ordenes_query(db).filter(models.OrdenRetiro.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de retiro no encontrada")
    if current_user.rol == models.RolUsuario.tecnico and orden.tecnico_asignado_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta orden no está asignada a usted")
    return _con_onu_actual(db, orden)


@router.post("/{orden_id}/asignar", response_model=schemas.OrdenRetiroOut)
def asignar_orden_retiro(
    orden_id: int,
    data: schemas.OrdenRetiroAsignar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.vendedor_tienda)
    ),
):
    orden = db.query(models.OrdenRetiro).filter(models.OrdenRetiro.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de retiro no encontrada")
    if orden.estado != models.EstadoOrdenRetiro.pendiente:
        raise HTTPException(status_code=400, detail="La orden ya fue completada")

    tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_asignado_id).first()
    if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
        raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")

    orden.tecnico_asignado_id = data.tecnico_asignado_id
    db.commit()
    orden = _ordenes_query(db).filter(models.OrdenRetiro.id == orden.id).first()
    return _con_onu_actual(db, orden)


@router.post("/{orden_id}/completar", response_model=schemas.OrdenRetiroOut)
def completar_orden_retiro(
    orden_id: int,
    data: schemas.OrdenRetiroCompletar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    """El técnico confirma que recogió el equipo. La ONU vuelve al almacén
    (disponible para reasignar), el borne se libera y el cliente pasa a
    anulado — no se borra nada de la base de datos."""
    orden = db.query(models.OrdenRetiro).filter(models.OrdenRetiro.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de retiro no encontrada")
    if orden.estado != models.EstadoOrdenRetiro.pendiente:
        raise HTTPException(status_code=400, detail="La orden ya fue completada")
    if current_user.rol == models.RolUsuario.tecnico and orden.tecnico_asignado_id not in (None, current_user.id):
        raise HTTPException(status_code=403, detail="Esta orden no está asignada a usted")

    cliente = db.query(models.Cliente).filter(models.Cliente.id == orden.cliente_id).first()

    if data.onu_retirada_id:
        onu = db.query(models.Onu).filter(models.Onu.id == data.onu_retirada_id).first()
        if onu:
            onu.estado = models.EstadoOnu.en_almacen
            onu.cliente_id = None
            onu.tecnico_id = None

    borne = db.query(models.Borne).filter(models.Borne.cliente_id == orden.cliente_id).first()
    if borne:
        borne.estado = models.EstadoBorne.libre
        borne.cliente_id = None
        borne.codigo_precinto = None
        borne.potencia_optica_dbm = None

    if cliente:
        cliente.estado = models.EstadoCliente.anulado
        historial = models.Historial(
            cliente_id=cliente.id,
            tipo=models.TipoHistorial.nota,
            descripcion=f"Servicio anulado — equipo retirado por {current_user.nombre}. Motivo: {orden.motivo}",
            usuario_id=current_user.id,
        )
        db.add(historial)

    orden.tecnico_asignado_id = orden.tecnico_asignado_id or current_user.id
    orden.onu_retirada_id = data.onu_retirada_id
    orden.retiro_roseta = data.retiro_roseta
    orden.retiro_patchcord = data.retiro_patchcord
    orden.observaciones = data.observaciones
    orden.estado = models.EstadoOrdenRetiro.completado
    orden.fecha_retiro = datetime.utcnow()
    db.commit()
    orden = _ordenes_query(db).filter(models.OrdenRetiro.id == orden.id).first()
    return _con_onu_actual(db, orden)
