import logging
import os
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles, zonas_asignadas
from .whatsapp import wa_request
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


async def _notificar_averia(cliente: Optional[models.Cliente], mensaje: str) -> None:
    """Avisa al cliente por WhatsApp — si falla o no tiene número, no debe
    impedir que la acción sobre la avería se guarde."""
    if not cliente:
        return
    phone = cliente.telefono_whatsapp or cliente.telefono
    if not phone:
        return
    try:
        await wa_request("POST", "/send", {"phone": phone, "message": mensaje})
    except Exception as e:
        logger.warning("No se pudo notificar avería al cliente %s: %s", cliente.nombre, e)


def _zona_de_averia(db: Session, averia: models.Averia) -> Optional[int]:
    if averia.cliente_id:
        cliente = db.query(models.Cliente).filter(models.Cliente.id == averia.cliente_id).first()
        return cliente.zona_id if cliente else None
    if averia.caja_nap_id:
        caja = db.query(models.CajaNap).filter(models.CajaNap.id == averia.caja_nap_id).first()
        return caja.zona_id if caja else None
    return None


def _averias_query(db: Session):
    return db.query(models.Averia).options(
        joinedload(models.Averia.cliente).joinedload(models.Cliente.zona),
        joinedload(models.Averia.caja_nap).joinedload(models.CajaNap.zona),
    )


@router.get("", response_model=List[schemas.AveriaOut])
def list_averias(
    estado: Optional[models.EstadoAveria] = Query(None),
    cliente_id: Optional[int] = Query(None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = _averias_query(db)
    if estado:
        query = query.filter(models.Averia.estado == estado)
    if cliente_id:
        query = query.filter(models.Averia.cliente_id == cliente_id)

    resultado = query.order_by(models.Averia.fecha_reporte.desc()).all()

    if current_user.rol == models.RolUsuario.tecnico:
        asignadas = set(zonas_asignadas(db, current_user))
        resultado = [a for a in resultado
                     if a.tecnico_asignado_id == current_user.id
                     or (_zona_de_averia(db, a) in asignadas)]

    if zona_id:
        resultado = [a for a in resultado if _zona_de_averia(db, a) == zona_id]

    return resultado


@router.post("", response_model=schemas.AveriaOut, status_code=201)
def create_averia(
    data: schemas.AveriaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(
            models.RolUsuario.admin, models.RolUsuario.subadmin,
            models.RolUsuario.tecnico, models.RolUsuario.vendedor_tienda,
        )
    ),
):
    if not data.cliente_id and not data.caja_nap_id:
        raise HTTPException(status_code=400, detail="Debe indicar un cliente o una caja NAP")
    if data.caja_nap_id and current_user.rol == models.RolUsuario.vendedor_tienda:
        raise HTTPException(status_code=403, detail="Atención al cliente solo puede reportar averías de clientes")

    averia = models.Averia(
        cliente_id=data.cliente_id,
        caja_nap_id=data.caja_nap_id,
        borne_id=data.borne_id,
        motivo_reportado=data.motivo_reportado,
        tecnico_asignado_id=data.tecnico_asignado_id,
        estado=models.EstadoAveria.asignada if data.tecnico_asignado_id else models.EstadoAveria.pendiente,
    )
    db.add(averia)
    db.commit()
    db.refresh(averia)
    return averia


@router.get("/{averia_id}", response_model=schemas.AveriaOut)
def get_averia(
    averia_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    averia = _averias_query(db).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")
    return averia


@router.put("/{averia_id}", response_model=schemas.AveriaOut)
def editar_averia(
    averia_id: int,
    data: schemas.AveriaEditar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    """Corrige el motivo reportado — ej. un error de tipeo al registrarla.
    Una vez resuelta ya no se edita: el diagnóstico queda aparte y es lo que
    manda sobre qué pasó realmente."""
    averia = db.query(models.Averia).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")
    if averia.estado == models.EstadoAveria.resuelta:
        raise HTTPException(status_code=400, detail="No se puede editar una avería ya resuelta")

    averia.motivo_reportado = data.motivo_reportado
    db.commit()
    db.refresh(averia)
    return averia


@router.delete("/{averia_id}", status_code=204)
def eliminar_averia(
    averia_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Borra una avería creada por error (cliente equivocado, duplicada, etc.)
    junto con sus evidencias — tanto el registro como el archivo en disco."""
    averia = db.query(models.Averia).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")

    for ev in db.query(models.Evidencia).filter(models.Evidencia.averia_id == averia_id).all():
        if os.path.isfile(ev.ruta_archivo):
            try:
                os.remove(ev.ruta_archivo)
            except OSError:
                pass
        db.delete(ev)

    db.delete(averia)
    db.commit()


@router.post("/{averia_id}/asignar", response_model=schemas.AveriaOut)
async def asignar_averia(
    averia_id: int,
    data: schemas.AveriaAsignarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    averia = db.query(models.Averia).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")
    if averia.estado not in (models.EstadoAveria.pendiente, models.EstadoAveria.asignada):
        raise HTTPException(status_code=400, detail="La avería ya fue atendida")

    tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_asignado_id).first()
    if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
        raise HTTPException(status_code=400, detail="El usuario no tiene rol de técnico")

    averia.tecnico_asignado_id = data.tecnico_asignado_id
    averia.estado = models.EstadoAveria.asignada
    db.commit()
    db.refresh(averia)

    if averia.cliente_id:
        cliente = db.query(models.Cliente).filter(models.Cliente.id == averia.cliente_id).first()
        nombre = cliente.nombre.split()[0] if cliente else ""
        mensaje = (
            f"🛠️ *WISP* — Avería en atención\n\n"
            f"Hola *{nombre}* 👋, le informamos que ya se asignó un técnico a su reporte:\n\n"
            f"📝 _{averia.motivo_reportado}_\n\n"
            f"Pronto se comunicarán con usted o se acercarán a su domicilio.\n\n"
            f"_WISP — Internet para todos_"
        )
        await _notificar_averia(cliente, mensaje)

    return averia


@router.post("/{averia_id}/iniciar", response_model=schemas.AveriaOut)
def iniciar_averia(
    averia_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    """El técnico marca que ya está en atención (en camino / trabajando)."""
    averia = db.query(models.Averia).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")
    if averia.estado != models.EstadoAveria.asignada:
        raise HTTPException(status_code=400, detail="La avería no está asignada")
    if current_user.rol == models.RolUsuario.tecnico and averia.tecnico_asignado_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta avería no está asignada a usted")

    averia.estado = models.EstadoAveria.en_proceso
    db.commit()
    db.refresh(averia)
    return averia


@router.post("/{averia_id}/resolver", response_model=schemas.AveriaOut)
async def resolver_averia(
    averia_id: int,
    data: schemas.AveriaResolverRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    """Cierra la avería. `diagnostico_solucion` es lo que REALMENTE se hizo —
    puede ser distinto de `motivo_reportado` — y queda registrado aparte para
    no perder esa diferencia. Si se cambió el equipo, se actualiza el
    inventario de ONUs (la vieja queda dañada, la nueva queda instalada)."""
    averia = db.query(models.Averia).filter(models.Averia.id == averia_id).first()
    if not averia:
        raise HTTPException(status_code=404, detail="Avería no encontrada")
    if averia.estado not in (models.EstadoAveria.asignada, models.EstadoAveria.en_proceso):
        raise HTTPException(status_code=400, detail="La avería no está en atención")
    if current_user.rol == models.RolUsuario.tecnico and averia.tecnico_asignado_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta avería no está asignada a usted")

    onu_vieja = None
    onu_nueva = None

    if data.onu_reemplazada_id:
        onu_vieja = db.query(models.Onu).filter(models.Onu.id == data.onu_reemplazada_id).first()
        if not onu_vieja:
            raise HTTPException(status_code=404, detail="ONU a retirar no encontrada")
        onu_vieja.estado = models.EstadoOnu.danado
        onu_vieja.cliente_id = None

    if data.onu_nueva_id:
        onu_nueva = db.query(models.Onu).filter(models.Onu.id == data.onu_nueva_id).first()
        if not onu_nueva:
            raise HTTPException(status_code=404, detail="ONU nueva no encontrada")
        if onu_nueva.estado != models.EstadoOnu.asignado_tecnico:
            raise HTTPException(status_code=400, detail="La ONU nueva no está disponible en el inventario del técnico")
        onu_nueva.estado = models.EstadoOnu.instalado
        onu_nueva.cliente_id = averia.cliente_id
        onu_nueva.fecha_instalacion = date.today()

    if data.onu_reemplazada_id:
        averia.onu_reemplazada_id = data.onu_reemplazada_id
    if data.onu_nueva_id:
        averia.onu_nueva_id = data.onu_nueva_id
    averia.diagnostico_solucion = data.diagnostico_solucion
    averia.potencia_optica_dbm = data.potencia_optica_dbm
    averia.estado = models.EstadoAveria.resuelta
    averia.fecha_atencion = datetime.utcnow()

    if averia.cliente_id and (onu_vieja or onu_nueva):
        partes = []
        if onu_vieja:
            partes.append(f"se retiró la ONU {onu_vieja.numero_serie} (quedó dañada)")
        if onu_nueva:
            partes.append(f"se instaló la ONU {onu_nueva.numero_serie}")
        descripcion = f"Cambio de equipo por avería: {', '.join(partes)}. Motivo: {data.diagnostico_solucion}"
        db.add(models.Historial(
            cliente_id=averia.cliente_id,
            tipo=models.TipoHistorial.cambio_onu,
            descripcion=descripcion,
            usuario_id=current_user.id,
        ))

    db.commit()
    db.refresh(averia)

    if averia.cliente_id:
        cliente = db.query(models.Cliente).filter(models.Cliente.id == averia.cliente_id).first()
        nombre = cliente.nombre.split()[0] if cliente else ""
        mensaje = (
            f"✅ *WISP* — Avería resuelta\n\n"
            f"Hola *{nombre}* 👋, su avería ya fue resuelta:\n\n"
            f"🔧 _{averia.diagnostico_solucion}_\n\n"
            f"Si el problema persiste, contáctenos: {settings.PHONE_CONTACTO}\n\n"
            f"¡Gracias por su paciencia! 🙏 — *WISP*"
        )
        await _notificar_averia(cliente, mensaje)

    return averia
