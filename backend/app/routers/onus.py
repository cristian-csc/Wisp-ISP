"""Registro de ONUs: cada equipo por su número de serie, dónde está ahora y
todo su recorrido (onu_movimientos).

Las ONUs no son parte del stock de materiales: se siguen una por una porque
cada una termina en un cliente concreto y se configura en la OLT por su serie.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..onus_historial import anotar, fabricante_de, normalizar_mac, normalizar_serie
from .auth import get_current_user, require_roles

router = APIRouter()

Estado = models.EstadoOnu


def _con_relaciones(q):
    return q.options(
        joinedload(models.Onu.cliente).joinedload(models.Cliente.zona),
        joinedload(models.Onu.tecnico),
    )


def _buscar(db: Session, onu_id: int) -> models.Onu:
    onu = _con_relaciones(db.query(models.Onu)).filter(models.Onu.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
    return onu


def _repetidas(db: Session, serie: Optional[str], mac: Optional[str], propia: Optional[int] = None) -> dict:
    """Qué campo choca con otra ONU ya registrada, con un mensaje que dice cuál."""
    errores = {}
    if serie:
        otra = db.query(models.Onu).filter(models.Onu.numero_serie == serie).first()
        if otra and otra.id != propia:
            errores["numero_serie"] = f"Esa serie ya está registrada ({_donde(otra)})"
    if mac:
        otra = db.query(models.Onu).filter(func.upper(models.Onu.mac) == mac.upper()).first()
        if otra and otra.id != propia:
            errores["mac"] = f"Esa MAC ya la tiene la ONU {otra.numero_serie}"
    return errores


def _donde(onu: models.Onu) -> str:
    if onu.estado == Estado.instalado and onu.cliente:
        return f"instalada en {onu.cliente.nombre}"
    if onu.estado == Estado.asignado_tecnico and onu.tecnico:
        return f"la tiene {onu.tecnico.nombre}"
    return {
        Estado.en_almacen: "en el almacén",
        Estado.danado: "marcada como dañada",
        Estado.perdido: "marcada como perdida",
    }.get(onu.estado, onu.estado.value)


@router.get("", response_model=List[schemas.OnuOut])
def list_onus(
    estado: Optional[models.EstadoOnu] = Query(None),
    tecnico_id: Optional[int] = Query(None),
    cliente_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = _con_relaciones(db.query(models.Onu))
    if current_user.rol == models.RolUsuario.tecnico:
        query = query.filter(models.Onu.tecnico_id == current_user.id)
    elif tecnico_id:
        query = query.filter(models.Onu.tecnico_id == tecnico_id)
    if estado:
        query = query.filter(models.Onu.estado == estado)
    if cliente_id:
        query = query.filter(models.Onu.cliente_id == cliente_id)
    return query.order_by(models.Onu.numero_serie).all()


@router.get("/validar")
def validar_onu(
    numero_serie: Optional[str] = Query(None, max_length=100),
    mac: Optional[str] = Query(None, max_length=50),
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(get_current_user),
):
    """Revisa serie y MAC mientras se escriben o se escanean: las devuelve
    normalizadas, dice la marca y avisa si ya existen."""
    salida: dict = {"errores": {}}
    serie_ok = mac_ok = None
    if numero_serie is not None and numero_serie.strip():
        try:
            serie_ok = normalizar_serie(numero_serie)
            salida["numero_serie"] = serie_ok
            salida["marca"] = fabricante_de(serie_ok)
        except ValueError as e:
            salida["errores"]["numero_serie"] = str(e)
    if mac is not None and mac.strip():
        try:
            mac_ok = normalizar_mac(mac)
            salida["mac"] = mac_ok
        except ValueError as e:
            salida["errores"]["mac"] = str(e)
    salida["errores"].update({k: v for k, v in _repetidas(db, serie_ok, mac_ok).items() if k not in salida["errores"]})
    return salida


@router.post("", response_model=schemas.OnuOut, status_code=201)
def create_onu(
    data: schemas.OnuCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Ingresa una ONU al almacén (lo que capturó la lectora: serie/MAC/marca)."""
    errores = _repetidas(db, data.numero_serie, data.mac)
    if errores:
        raise HTTPException(status_code=400, detail=next(iter(errores.values())))
    datos = data.model_dump()
    datos["marca"] = datos["marca"] or fabricante_de(data.numero_serie)
    onu = models.Onu(**datos, estado=Estado.en_almacen)
    db.add(onu)
    db.flush()
    anotar(db, onu, "alta", current_user)
    db.commit()
    return _buscar(db, onu.id)


@router.post("/registrar-propio", response_model=schemas.OnuOut, status_code=201)
def registrar_onu_propio(
    data: schemas.OnuCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.tecnico)),
):
    """El técnico registra un equipo que el almacén le entregó sin pasar antes
    por el sistema (escaneando MAC/serie en campo) — queda asignado a él
    directamente, sin pasar por el stock general que administra el admin."""
    errores = _repetidas(db, data.numero_serie, data.mac)
    if errores:
        raise HTTPException(status_code=400, detail=next(iter(errores.values())))
    datos = data.model_dump()
    datos["marca"] = datos["marca"] or fabricante_de(data.numero_serie)
    onu = models.Onu(
        **datos,
        estado=Estado.asignado_tecnico,
        tecnico_id=current_user.id,
        fecha_asignacion_tecnico=date.today(),
    )
    db.add(onu)
    db.flush()
    anotar(db, onu, "alta", current_user, persona_id=current_user.id, nota="Registrada por el técnico en campo, ya en su poder")
    db.commit()
    return _buscar(db, onu.id)


@router.get("/{onu_id}", response_model=schemas.OnuOut)
def get_onu(
    onu_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    return _buscar(db, onu_id)


@router.get("/{onu_id}/historial", response_model=List[schemas.OnuMovimientoOut])
def historial_onu(
    onu_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """El recorrido de la ONU, lo más reciente primero."""
    onu = _buscar(db, onu_id)
    if current_user.rol == models.RolUsuario.tecnico and onu.tecnico_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta ONU no está asignada a usted")
    return (
        db.query(models.OnuMovimiento)
        .options(
            joinedload(models.OnuMovimiento.persona),
            joinedload(models.OnuMovimiento.registrado_por),
            joinedload(models.OnuMovimiento.cliente),
        )
        .filter(models.OnuMovimiento.onu_id == onu_id)
        .order_by(models.OnuMovimiento.creado_en.desc(), models.OnuMovimiento.id.desc())
        .all()
    )


@router.post("/{onu_id}/asignar", response_model=schemas.OnuOut)
def asignar_onu(
    onu_id: int,
    data: schemas.OnuAsignarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Entrega una ONU a un técnico. Si ya la tenía otro, es un traspaso:
    queda constancia de quién la tenía y a quién pasó."""
    onu = _buscar(db, onu_id)
    if onu.estado not in (Estado.en_almacen, Estado.asignado_tecnico):
        raise HTTPException(status_code=400, detail=f"No se puede entregar: está {_donde(onu)}")
    tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_id).first()
    if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
        raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")
    if not tecnico.activo:
        raise HTTPException(status_code=400, detail=f"{tecnico.nombre} está desactivado")
    if onu.tecnico_id == tecnico.id:
        raise HTTPException(status_code=400, detail=f"{tecnico.nombre} ya tiene esta ONU")

    antes = onu.estado
    anterior = onu.tecnico
    onu.estado = Estado.asignado_tecnico
    onu.tecnico_id = tecnico.id
    onu.fecha_asignacion_tecnico = date.today()
    if anterior:
        nota = f"Pasa de {anterior.nombre} a {tecnico.nombre}" + (f". {data.nota.strip()}" if data.nota and data.nota.strip() else "")
        anotar(db, onu, "traspaso", current_user, antes, persona_id=tecnico.id, nota=nota)
    else:
        anotar(db, onu, "asignacion", current_user, antes, persona_id=tecnico.id, nota=data.nota)
    db.commit()
    return _buscar(db, onu.id)


@router.put("/{onu_id}", response_model=schemas.OnuOut)
def editar_onu(
    onu_id: int,
    data: schemas.OnuEditar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Corrige MAC, marca o WiFi. Lo que cambió queda en el historial con el
    valor anterior, para que una corrección nunca borre lo que había."""
    onu = _buscar(db, onu_id)
    errores = _repetidas(db, None, data.mac, propia=onu.id)
    if errores:
        raise HTTPException(status_code=400, detail=next(iter(errores.values())))
    nombres = {"mac": "MAC", "marca": "marca", "wifi_version": "WiFi"}
    cambios = []
    for campo in ("mac", "marca", "wifi_version"):
        antes = getattr(onu, campo)
        despues = getattr(data, campo)
        a = antes.value if hasattr(antes, "value") else antes
        d = despues.value if hasattr(despues, "value") else despues
        if a != d:
            cambios.append(f"{nombres[campo]}: {a or 'vacía'} → {d or 'vacía'}")
            setattr(onu, campo, despues)
    if not cambios:
        raise HTTPException(status_code=400, detail="No cambiaste ningún dato")
    nota = "; ".join(cambios) + (f". {data.nota.strip()}" if data.nota and data.nota.strip() else "")
    anotar(db, onu, "correccion", current_user, onu.estado, nota=nota)
    db.commit()
    return _buscar(db, onu.id)


@router.delete("/{onu_id}")
def delete_onu(
    onu_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Borra una ONU registrada por error (duplicada, serie mal escrita). Solo
    si nunca salió del almacén: una que ya pasó por manos de alguien tiene
    historia, y esa no se borra; se marca dañada o perdida."""
    onu = _buscar(db, onu_id)
    if onu.estado == Estado.instalado:
        raise HTTPException(status_code=400, detail="No se puede eliminar: está instalada en un cliente")
    movimientos = db.query(models.OnuMovimiento).filter(
        models.OnuMovimiento.onu_id == onu.id, models.OnuMovimiento.tipo != "alta"
    ).count()
    if movimientos:
        raise HTTPException(
            status_code=400,
            detail="Esta ONU ya tiene movimientos: no se borra para no perder su rastro. Márcala como dañada o perdida.",
        )
    db.delete(onu)
    db.commit()
    return {"ok": True}


TIPO_MARCA = {Estado.danado: "danada", Estado.perdido: "perdida", Estado.en_almacen: "devolucion"}


@router.post("/{onu_id}/marcar", response_model=schemas.OnuOut)
def marcar_onu(
    onu_id: int,
    data: schemas.OnuMarcarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    """Marca una ONU dañada o perdida, o la regresa al almacén (devolución, o
    recuperada si estaba dañada o perdida)."""
    onu = _buscar(db, onu_id)
    if current_user.rol == models.RolUsuario.tecnico and onu.tecnico_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta ONU no está asignada a usted")
    if data.estado not in TIPO_MARCA:
        raise HTTPException(status_code=400, detail="Solo se puede marcar dañada, perdida o devolver al almacén")
    if onu.estado == Estado.instalado:
        raise HTTPException(
            status_code=400,
            detail="Está instalada en un cliente: se retira con una orden de retiro o un cambio de equipo por avería",
        )
    if onu.estado == data.estado:
        raise HTTPException(status_code=400, detail=f"Ya está {_donde(onu)}")

    antes = onu.estado
    quien = onu.tecnico_id
    tipo = TIPO_MARCA[data.estado]
    if tipo == "devolucion" and antes in (Estado.danado, Estado.perdido):
        tipo = "recuperada"
    onu.estado = data.estado
    if data.estado == Estado.en_almacen:
        onu.tecnico_id = None
        onu.cliente_id = None
    anotar(db, onu, tipo, current_user, antes, persona_id=quien, nota=data.nota)
    db.commit()
    return _buscar(db, onu.id)
