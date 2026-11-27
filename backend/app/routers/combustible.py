"""Recargas de combustible. El personal de campo registra desde la app: elige
la unidad, pone el monto y sube foto del surtidor y de la boleta/factura. Entra
directo (sin aprobación). Gerencia ve el detalle y el reporte mensual por unidad,
y puede borrar una recarga equivocada (se borran también sus fotos)."""
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..almacen_fotos import guardar_imagen, borrar_imagen

router = APIRouter()

SOLO_GERENCIA = require_roles(models.RolUsuario.admin)
# Quién puede registrar una carga: los técnicos (y el admin). Las vendedoras de
# campo NO cargan combustible.
PUEDEN_CARGAR = require_roles(
    models.RolUsuario.admin,
    models.RolUsuario.tecnico,
)

_TZ_LIMA = ZoneInfo("America/Lima")


def _rango_mes(mes: str) -> tuple[date, date]:
    """'YYYY-MM' -> (primer día del mes, primer día del mes siguiente)."""
    anio, m = map(int, mes.split("-"))
    inicio = date(anio, m, 1)
    fin = date(anio + 1, 1, 1) if m == 12 else date(anio, m + 1, 1)
    return inicio, fin


def _out(r: models.RecargaCombustible, placa: Optional[str] = None,
         nombre: Optional[str] = None) -> dict:
    return {
        "id": r.id,
        "unidad_id": r.unidad_id,
        "monto": r.monto,
        "fecha": r.fecha,
        "nota": r.nota,
        "tiene_foto_surtidor": bool(r.foto_surtidor_ruta),
        "tiene_foto_boleta": bool(r.foto_boleta_ruta),
        "registrado_por": r.registrado_por,
        "creado_en": r.creado_en,
        "unidad_placa": placa,
        "registrado_por_nombre": nombre,
    }


@router.post("", response_model=schemas.RecargaCombustibleOut, status_code=201)
def registrar_recarga(
    unidad_id: int = Form(...),
    monto: float = Form(...),
    foto_surtidor: UploadFile = File(...),
    foto_boleta: UploadFile = File(...),
    nota: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(PUEDEN_CARGAR),
):
    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    unidad = db.query(models.Unidad).filter(models.Unidad.id == unidad_id).first()
    if not unidad:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    if not unidad.activo:
        raise HTTPException(status_code=400, detail="Esa unidad está desactivada")

    # Se guardan las dos fotos; si la segunda falla, se borra la primera para no
    # dejar un archivo huérfano en disco.
    ruta_surtidor = guardar_imagen(foto_surtidor, "combustible")
    try:
        ruta_boleta = guardar_imagen(foto_boleta, "combustible")
    except Exception:
        borrar_imagen(ruta_surtidor)
        raise

    recarga = models.RecargaCombustible(
        unidad_id=unidad_id,
        monto=round(monto, 2),
        fecha=datetime.now(_TZ_LIMA).date(),
        foto_surtidor_ruta=ruta_surtidor,
        foto_boleta_ruta=ruta_boleta,
        nota=(nota or "").strip() or None,
        registrado_por=current_user.id,
    )
    db.add(recarga)
    db.commit()
    db.refresh(recarga)
    return _out(recarga, placa=unidad.placa, nombre=current_user.nombre)


@router.get("", response_model=dict)
def list_recargas(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    mes: Optional[str] = Query(None, description="YYYY-MM"),
    unidad_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    q = db.query(models.RecargaCombustible)
    if mes:
        inicio, fin = _rango_mes(mes)
        q = q.filter(models.RecargaCombustible.fecha >= inicio,
                     models.RecargaCombustible.fecha < fin)
    if unidad_id:
        q = q.filter(models.RecargaCombustible.unidad_id == unidad_id)

    total = q.count()
    filas = (q.order_by(models.RecargaCombustible.fecha.desc(),
                        models.RecargaCombustible.id.desc())
             .offset((page - 1) * per_page).limit(per_page).all())

    # Placas y nombres en lote, para no consultar uno por uno.
    unidad_ids = {r.unidad_id for r in filas}
    user_ids = {r.registrado_por for r in filas if r.registrado_por}
    placas = dict(db.query(models.Unidad.id, models.Unidad.placa)
                  .filter(models.Unidad.id.in_(unidad_ids)).all()) if unidad_ids else {}
    nombres = dict(db.query(models.Usuario.id, models.Usuario.nombre)
                   .filter(models.Usuario.id.in_(user_ids)).all()) if user_ids else {}

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": [_out(r, placas.get(r.unidad_id), nombres.get(r.registrado_por)) for r in filas],
    }


@router.get("/reporte", response_model=List[schemas.ReporteUnidadMes])
def reporte_mensual(
    mes: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    """Cuánto gastó cada unidad en combustible en el mes."""
    inicio, fin = _rango_mes(mes)
    filas = (
        db.query(
            models.Unidad.id,
            models.Unidad.placa,
            models.Unidad.marca,
            models.Unidad.modelo,
            func.coalesce(func.sum(models.RecargaCombustible.monto), 0.0),
            func.count(models.RecargaCombustible.id),
        )
        .join(models.RecargaCombustible,
              models.RecargaCombustible.unidad_id == models.Unidad.id)
        .filter(models.RecargaCombustible.fecha >= inicio,
                models.RecargaCombustible.fecha < fin)
        .group_by(models.Unidad.id, models.Unidad.placa,
                  models.Unidad.marca, models.Unidad.modelo)
        .order_by(func.sum(models.RecargaCombustible.monto).desc())
        .all()
    )
    return [
        {"unidad_id": uid, "placa": placa, "marca": marca, "modelo": modelo,
         "total": round(float(total), 2), "recargas": int(cuenta)}
        for uid, placa, marca, modelo, total, cuenta in filas
    ]


def _servir(db: Session, recarga_id: int, cual: str):
    recarga = db.query(models.RecargaCombustible).filter(
        models.RecargaCombustible.id == recarga_id).first()
    ruta = getattr(recarga, cual, None) if recarga else None
    if not ruta or not os.path.isfile(ruta):
        raise HTTPException(status_code=404, detail="Sin foto")
    return FileResponse(ruta)


@router.get("/{recarga_id}/foto-surtidor")
def foto_surtidor(recarga_id: int, db: Session = Depends(get_db),
                  current_user: models.Usuario = Depends(SOLO_GERENCIA)):
    return _servir(db, recarga_id, "foto_surtidor_ruta")


@router.get("/{recarga_id}/foto-boleta")
def foto_boleta(recarga_id: int, db: Session = Depends(get_db),
                current_user: models.Usuario = Depends(SOLO_GERENCIA)):
    return _servir(db, recarga_id, "foto_boleta_ruta")


@router.delete("/{recarga_id}", status_code=204)
def eliminar_recarga(
    recarga_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    recarga = db.query(models.RecargaCombustible).filter(
        models.RecargaCombustible.id == recarga_id).first()
    if not recarga:
        raise HTTPException(status_code=404, detail="Recarga no encontrada")
    borrar_imagen(recarga.foto_surtidor_ruta)
    borrar_imagen(recarga.foto_boleta_ruta)
    db.delete(recarga)
    db.commit()
