from datetime import datetime, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func

from ..database import get_db
from .. import models, schemas
from .auth import require_roles

router = APIRouter()

# Si una jornada quedó "activa" más de esto (p.ej. el vendedor olvidó cerrarla
# el día anterior), se cierra sola al intentar iniciar una nueva — no tiene
# sentido bloquearlo para siempre por un olvido.
HORAS_AUTOCIERRE = 12


def _jornada_activa(db: Session, vendedor_id: int) -> Optional[models.JornadaVendedor]:
    return db.query(models.JornadaVendedor).filter(
        models.JornadaVendedor.vendedor_id == vendedor_id,
        models.JornadaVendedor.estado == models.EstadoJornada.activa,
    ).first()


def _ultima_ubicacion(db: Session, jornada_id: int) -> Optional[models.UbicacionVendedor]:
    return db.query(models.UbicacionVendedor).filter(
        models.UbicacionVendedor.jornada_id == jornada_id,
    ).order_by(models.UbicacionVendedor.registrado_en.desc()).first()


def _jornada_a_out(db: Session, j: models.JornadaVendedor) -> schemas.JornadaOut:
    ultima = _ultima_ubicacion(db, j.id)
    return schemas.JornadaOut(
        id=j.id,
        vendedor=schemas.UsuarioNombre.model_validate(j.vendedor) if j.vendedor else None,
        zona=schemas.ZonaNombre.model_validate(j.zona) if j.zona else None,
        estado=j.estado.value,
        lat_inicio=j.lat_inicio,
        lng_inicio=j.lng_inicio,
        monto_pasaje=j.monto_pasaje,
        monto_reclamado=j.monto_reclamado,
        nota_reclamo=j.nota_reclamo,
        reclamo_reintegrado=j.reclamo_reintegrado,
        lat_fin=j.lat_fin,
        lng_fin=j.lng_fin,
        iniciado_en=j.iniciado_en,
        finalizado_en=j.finalizado_en,
        ultima_ubicacion=schemas.UbicacionVendedorOut.model_validate(ultima) if ultima else None,
    )


@router.post("/iniciar", response_model=schemas.JornadaOut)
def iniciar_jornada(
    data: schemas.JornadaIniciarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.vendedor_campo)),
):
    activa = _jornada_activa(db, current_user.id)
    if activa:
        if activa.iniciado_en and activa.iniciado_en.replace(tzinfo=None) < datetime.utcnow() - timedelta(hours=HORAS_AUTOCIERRE):
            ultima = _ultima_ubicacion(db, activa.id)
            activa.estado = models.EstadoJornada.finalizada
            activa.finalizado_en = activa.iniciado_en
            activa.lat_fin = ultima.lat if ultima else activa.lat_inicio
            activa.lng_fin = ultima.lng if ultima else activa.lng_inicio
            db.commit()
        else:
            raise HTTPException(400, "Ya tienes una jornada activa. Finalízala antes de iniciar una nueva.")

    jornada = models.JornadaVendedor(
        vendedor_id=current_user.id,
        zona_id=data.zona_id,
        lat_inicio=data.lat,
        lng_inicio=data.lng,
    )
    db.add(jornada)
    db.commit()
    db.refresh(jornada)
    return _jornada_a_out(db, jornada)


@router.post("/ping", response_model=schemas.UbicacionVendedorOut)
def ping_ubicacion(
    data: schemas.JornadaPingRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.vendedor_campo)),
):
    jornada = _jornada_activa(db, current_user.id)
    if not jornada:
        raise HTTPException(400, "No tienes una jornada activa.")

    ubicacion = models.UbicacionVendedor(jornada_id=jornada.id, lat=data.lat, lng=data.lng)
    db.add(ubicacion)
    db.commit()
    db.refresh(ubicacion)
    return ubicacion


@router.post("/finalizar", response_model=schemas.JornadaOut)
def finalizar_jornada(
    data: schemas.JornadaPingRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.vendedor_campo)),
):
    jornada = _jornada_activa(db, current_user.id)
    if not jornada:
        raise HTTPException(400, "No tienes una jornada activa.")

    jornada.estado = models.EstadoJornada.finalizada
    jornada.finalizado_en = datetime.utcnow()
    jornada.lat_fin = data.lat
    jornada.lng_fin = data.lng
    db.commit()
    db.refresh(jornada)
    return _jornada_a_out(db, jornada)


@router.put("/{jornada_id}/reclamo-pasaje", response_model=schemas.JornadaOut)
def reportar_reclamo_pasaje(
    jornada_id: int,
    data: schemas.ReclamoPasajeRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.vendedor_campo)),
):
    """El vendedor reporta que la tienda no le dio pasaje y pagó de su
    bolsillo — queda pendiente hasta que el admin lo reintegre."""
    jornada = db.query(models.JornadaVendedor).filter(
        models.JornadaVendedor.id == jornada_id,
        models.JornadaVendedor.vendedor_id == current_user.id,
    ).first()
    if not jornada:
        raise HTTPException(404, "Jornada no encontrada")

    jornada.monto_reclamado = data.monto_reclamado
    jornada.nota_reclamo = data.nota
    jornada.reclamo_reintegrado = False
    db.commit()
    db.refresh(jornada)
    return _jornada_a_out(db, jornada)


@router.put("/{jornada_id}/reclamo-pasaje/reintegrar", response_model=schemas.JornadaOut)
def reintegrar_reclamo_pasaje(
    jornada_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    """El admin confirma que ya le pagó al vendedor lo que reclamó — ese
    monto pasa a ser el pasaje oficial del día, así el resumen mensual no
    necesita sumar dos campos distintos."""
    jornada = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    ).filter(models.JornadaVendedor.id == jornada_id).first()
    if not jornada:
        raise HTTPException(404, "Jornada no encontrada")
    if jornada.monto_reclamado is None:
        raise HTTPException(400, "Esta jornada no tiene un reclamo de pasaje pendiente.")

    jornada.monto_pasaje = jornada.monto_reclamado
    jornada.reclamo_reintegrado = True
    db.commit()
    db.refresh(jornada)
    return _jornada_a_out(db, jornada)


@router.get("/mi-jornada-activa", response_model=Optional[schemas.JornadaOut])
def mi_jornada_activa(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.vendedor_campo)),
):
    jornada = _jornada_activa(db, current_user.id)
    return _jornada_a_out(db, jornada) if jornada else None


@router.get("/activas", response_model=list[schemas.JornadaOut])
def listar_jornadas_activas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    jornadas = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    ).filter(models.JornadaVendedor.estado == models.EstadoJornada.activa).all()
    return [_jornada_a_out(db, j) for j in jornadas]


@router.get("", response_model=dict)
def listar_jornadas(
    vendedor_id: Optional[int] = None,
    fecha: Optional[date] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    query = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    )
    if vendedor_id:
        query = query.filter(models.JornadaVendedor.vendedor_id == vendedor_id)
    if fecha:
        query = query.filter(sa_func.date(models.JornadaVendedor.iniciado_en) == fecha)

    query = query.order_by(models.JornadaVendedor.iniciado_en.desc())
    total = query.count()
    jornadas = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
        "items": [_jornada_a_out(db, j) for j in jornadas],
    }


@router.put("/{jornada_id}/pasaje", response_model=schemas.JornadaOut)
def actualizar_pasaje(
    jornada_id: int,
    data: schemas.JornadaPasajeUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    jornada = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    ).filter(models.JornadaVendedor.id == jornada_id).first()
    if not jornada:
        raise HTTPException(404, "Jornada no encontrada")

    jornada.monto_pasaje = data.monto_pasaje
    db.commit()
    db.refresh(jornada)
    return _jornada_a_out(db, jornada)


@router.get("/resumen-pasajes", response_model=list[schemas.ResumenPasajeVendedor])
def resumen_pasajes(
    mes: Optional[str] = None,  # "YYYY-MM" — por defecto, el mes actual
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    hoy = date.today()
    if mes:
        anio, mes_num = (int(p) for p in mes.split("-"))
    else:
        anio, mes_num = hoy.year, hoy.month

    desde = date(anio, mes_num, 1)
    hasta = date(anio + 1, 1, 1) if mes_num == 12 else date(anio, mes_num + 1, 1)

    filas = db.query(
        models.Usuario.id,
        models.Usuario.nombre,
        sa_func.count(models.JornadaVendedor.id),
        sa_func.coalesce(sa_func.sum(models.JornadaVendedor.monto_pasaje), 0.0),
    ).join(
        models.JornadaVendedor, models.JornadaVendedor.vendedor_id == models.Usuario.id,
    ).filter(
        sa_func.date(models.JornadaVendedor.iniciado_en) >= desde,
        sa_func.date(models.JornadaVendedor.iniciado_en) < hasta,
    ).group_by(models.Usuario.id, models.Usuario.nombre).all()

    return [
        schemas.ResumenPasajeVendedor(vendedor_id=f[0], nombre=f[1], total_jornadas=f[2], total_pasajes=f[3])
        for f in filas
    ]


@router.get("/{jornada_id}/recorrido", response_model=schemas.JornadaRecorridoOut)
def recorrido_jornada(
    jornada_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.subadmin)
    ),
):
    jornada = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    ).filter(models.JornadaVendedor.id == jornada_id).first()
    if not jornada:
        raise HTTPException(404, "Jornada no encontrada")

    puntos = db.query(models.UbicacionVendedor).filter(
        models.UbicacionVendedor.jornada_id == jornada_id,
    ).order_by(models.UbicacionVendedor.registrado_en.asc()).all()

    return schemas.JornadaRecorridoOut(
        jornada=_jornada_a_out(db, jornada),
        puntos=[schemas.UbicacionVendedorOut.model_validate(p) for p in puntos],
    )
