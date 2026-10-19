import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles, zonas_asignadas
from .clientes import _mikrotik_exec, _get_wg_ip, _ros_str

router = APIRouter()


def _caja_con_bornes(query):
    return query.options(
        joinedload(models.CajaNap.bornes)
        .joinedload(models.Borne.cliente)
        .joinedload(models.Cliente.plan)
    )


def _scope_zonas(query, db: Session, current_user: models.Usuario):
    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.CajaNap.zona_id.in_(zonas_asignadas(db, current_user) or [-1]))
    return query


@router.get("", response_model=List[schemas.CajaNapOut])
def list_cajas_nap(
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = _caja_con_bornes(db.query(models.CajaNap)).filter(
        models.CajaNap.activo == True
    )
    query = _scope_zonas(query, db, current_user)
    if zona_id:
        query = query.filter(models.CajaNap.zona_id == zona_id)
    return query.all()


@router.post("", response_model=schemas.CajaNapOut, status_code=201)
def create_caja_nap(
    data: schemas.CajaNapCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Registro previo de la caja NAP por el admin (catálogo de infraestructura) —
    el técnico solo elige entre las ya registradas al instalar."""
    if db.query(models.CajaNap).filter(models.CajaNap.codigo == data.codigo).first():
        raise HTTPException(status_code=400, detail="Ya existe una caja NAP con ese código")

    mufa = db.query(models.Mufa).filter(models.Mufa.id == data.mufa_id).first()
    if not mufa:
        raise HTTPException(status_code=404, detail="Mufa no encontrada")
    if mufa.zona_id != data.zona_id:
        raise HTTPException(status_code=400, detail="La mufa no pertenece a la zona indicada")

    caja = models.CajaNap(**data.model_dump())
    db.add(caja)
    db.commit()
    db.refresh(caja)

    for numero in range(1, caja.capacidad_bornes + 1):
        db.add(models.Borne(caja_nap_id=caja.id, numero=numero, estado=models.EstadoBorne.libre))
    db.commit()
    db.refresh(caja)
    return caja


@router.get("/{caja_id}", response_model=schemas.CajaNapOut)
def get_caja_nap(
    caja_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    caja = _caja_con_bornes(db.query(models.CajaNap)).filter(
        models.CajaNap.id == caja_id
    ).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    if current_user.rol == models.RolUsuario.tecnico and caja.zona_id not in zonas_asignadas(db, current_user):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta zona")
    return caja


@router.put("/{caja_id}", response_model=schemas.CajaNapOut)
def update_caja_nap(
    caja_id: int,
    data: schemas.CajaNapUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Corrige datos de una caja mal ingresada (código, descripción, ubicación)
    — no permite reasignar mufa/zona, eso implica retirar y volver a instalar."""
    caja = db.query(models.CajaNap).filter(models.CajaNap.id == caja_id).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    update_data = data.model_dump(exclude_unset=True)
    if "codigo" in update_data and update_data["codigo"] != caja.codigo:
        if db.query(models.CajaNap).filter(models.CajaNap.codigo == update_data["codigo"]).first():
            raise HTTPException(status_code=400, detail="Ya existe una caja NAP con ese código")
    for k, v in update_data.items():
        setattr(caja, k, v)
    db.commit()
    db.refresh(caja)
    return caja


@router.delete("/{caja_id}")
def delete_caja_nap(
    caja_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Borra una caja registrada por error — bloqueado si algún borne ya tiene
    un cliente conectado (hay que retirarlo primero, nunca se pierde ese rastro)."""
    caja = db.query(models.CajaNap).options(joinedload(models.CajaNap.bornes)).filter(
        models.CajaNap.id == caja_id
    ).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    ocupados = [b for b in caja.bornes if b.estado == models.EstadoBorne.ocupado]
    if ocupados:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {len(ocupados)} borne(s) con cliente conectado")

    db.query(models.Averia).filter(models.Averia.caja_nap_id == caja_id).update({"caja_nap_id": None})
    db.query(models.Borne).filter(models.Borne.caja_nap_id == caja_id).delete()
    db.delete(caja)
    db.commit()
    return {"ok": True}


@router.post("/{caja_id}/ampliar", response_model=schemas.CajaNapOut)
def ampliar_caja_nap(
    caja_id: int,
    capacidad_nueva: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Agranda la caja (ej. de 8 a 16 bornes) cuando se llenó — agrega los
    bornes faltantes como libres, nunca reduce ni toca los existentes."""
    caja = db.query(models.CajaNap).options(joinedload(models.CajaNap.bornes)).filter(
        models.CajaNap.id == caja_id
    ).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    if capacidad_nueva <= caja.capacidad_bornes:
        raise HTTPException(status_code=400, detail="La nueva capacidad debe ser mayor a la actual")

    for numero in range(caja.capacidad_bornes + 1, capacidad_nueva + 1):
        db.add(models.Borne(caja_nap_id=caja.id, numero=numero, estado=models.EstadoBorne.libre))
    caja.capacidad_bornes = capacidad_nueva
    db.commit()
    db.refresh(caja)
    return caja


@router.post("/bornes/{borne_id}/marcar", response_model=schemas.BorneOut)
def marcar_borne(
    borne_id: int,
    data: schemas.BorneDanarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.tecnico)
    ),
):
    """Un técnico reporta un borne dañado (o el admin lo vuelve a marcar libre
    una vez reparado). Si el borne tiene un cliente conectado no se puede
    marcar dañado sin antes liberar al cliente (retiro)."""
    borne = db.query(models.Borne).filter(models.Borne.id == borne_id).first()
    if not borne:
        raise HTTPException(status_code=404, detail="Borne no encontrado")

    if data.danado:
        if borne.cliente_id:
            raise HTTPException(status_code=400, detail="El borne tiene un cliente conectado — retírelo primero")
        borne.estado = models.EstadoBorne.danado
    else:
        borne.estado = models.EstadoBorne.libre if not borne.cliente_id else models.EstadoBorne.ocupado

    db.commit()
    db.refresh(borne)
    return borne


@router.put("/bornes/{borne_id}/precinto", response_model=schemas.BorneOut)
def actualizar_precinto(
    borne_id: int,
    data: schemas.BornePrecintoUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.tecnico)
    ),
):
    """Registra o corrige el código del precinto físico amarrado al cable drop
    de un borne ocupado — sirve para verificar en campo que el cable no fue
    cambiado. Solo aplica a bornes con cliente conectado."""
    borne = db.query(models.Borne).filter(models.Borne.id == borne_id).first()
    if not borne:
        raise HTTPException(status_code=404, detail="Borne no encontrado")
    if not borne.cliente_id:
        raise HTTPException(status_code=400, detail="El borne no tiene un cliente conectado")

    borne.codigo_precinto = data.codigo_precinto
    db.commit()
    db.refresh(borne)
    return borne


@router.get("/{caja_id}/estado-pppoe", response_model=List[schemas.BorneEstadoPppoe])
def estado_pppoe_caja(
    caja_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin, models.RolUsuario.tecnico)
    ),
):
    """Consulta en una sola sesión SSH si cada abonado ocupando un borne de
    esta caja está conectado ahora mismo al MikroTik de su zona — mucho más
    liviano que una consulta por cliente (que abriría una conexión SSH por
    cada una)."""
    caja = db.query(models.CajaNap).options(
        joinedload(models.CajaNap.bornes).joinedload(models.Borne.cliente)
    ).filter(models.CajaNap.id == caja_id).first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
    if current_user.rol == models.RolUsuario.tecnico and caja.zona_id not in zonas_asignadas(db, current_user):
        raise HTTPException(status_code=403, detail="No tiene acceso a esta zona")

    ocupados = [b for b in caja.bornes if b.estado == models.EstadoBorne.ocupado and b.cliente]
    if not ocupados:
        return []

    wg_ip = _get_wg_ip(db, caja.zona_id)
    if not wg_ip:
        return [
            schemas.BorneEstadoPppoe(borne_id=b.id, cliente_id=b.cliente_id, conectado=False, error="Zona sin WireGuard")
            for b in ocupados
        ]

    cmds = [f'/ppp active print detail where name="{_ros_str(b.cliente.usuario_pppoe)}"' for b in ocupados]
    result = _mikrotik_exec(wg_ip, cmds)

    if not result["ok"]:
        return [
            schemas.BorneEstadoPppoe(borne_id=b.id, cliente_id=b.cliente_id, conectado=False, error="Sin conexión al MikroTik")
            for b in ocupados
        ]

    salida = []
    for b, res in zip(ocupados, result["results"]):
        texto = res.get("out", "")
        conectado = bool(texto.strip())
        uptime = None
        ip_remota = None
        if conectado:
            m = re.search(r'uptime=(\S+)', texto)
            if m:
                uptime = m.group(1)
            m = re.search(r'\baddress=(\S+)', texto)
            if m:
                ip_remota = m.group(1)
        salida.append(schemas.BorneEstadoPppoe(
            borne_id=b.id, cliente_id=b.cliente_id, conectado=conectado, uptime=uptime, ip_remota=ip_remota,
        ))
    return salida
