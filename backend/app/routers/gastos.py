from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas
from .auth import require_roles

router = APIRouter()

SOLO_GERENCIA = require_roles(models.RolUsuario.admin)  # admin ya incluye a super_admin


def _gastos_vigentes_del_mes(db: Session, anio: int, mes: int) -> List[models.Gasto]:
    """Gastos "vigentes" de un mes: los realmente registrados ese mes, más los
    recurrentes (fijos) de meses anteriores que no se volvieron a registrar —
    se arrastran tal cual hasta que se registre uno nuevo con la misma
    descripción + categoría + zona (ej. cambió el monto del proveedor)."""
    todos = db.query(models.Gasto).order_by(models.Gasto.fecha.asc(), models.Gasto.id.asc()).all()

    del_mes = [g for g in todos if g.fecha.year == anio and g.fecha.month == mes]
    claves_del_mes = {(g.descripcion, g.categoria, g.zona_id) for g in del_mes}

    ultimo_recurrente_por_clave: dict = {}
    for g in todos:
        if not g.es_recurrente:
            continue
        if (g.fecha.year, g.fecha.month) >= (anio, mes):
            continue
        ultimo_recurrente_por_clave[(g.descripcion, g.categoria, g.zona_id)] = g

    arrastrados = [
        g for clave, g in ultimo_recurrente_por_clave.items()
        if clave not in claves_del_mes
    ]

    return del_mes + arrastrados


@router.get("", response_model=dict)
def list_gastos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    mes: Optional[str] = None,
    categoria: Optional[str] = None,
    zona_id: Optional[int] = Query(None, description="0 = solo gastos generales (sin zona)"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    if mes:
        anio_int, m_int = map(int, mes.split("-"))
        gastos = _gastos_vigentes_del_mes(db, anio_int, m_int)
    else:
        gastos = db.query(models.Gasto).all()

    if categoria:
        gastos = [g for g in gastos if g.categoria == categoria]
    if zona_id is not None:
        objetivo = None if zona_id == 0 else zona_id
        gastos = [g for g in gastos if g.zona_id == objetivo]

    gastos.sort(key=lambda g: g.fecha, reverse=True)

    total = len(gastos)
    inicio = (page - 1) * per_page
    pagina = gastos[inicio:inicio + per_page]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": [schemas.GastoOut.model_validate(g) for g in pagina],
    }


@router.get("/resumen-por-zona")
def resumen_por_zona(
    mes: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    """Para la grilla de zonas: gastos fijos/variables y margen (ingresos -
    gastos) de cada zona en el mes, más un balde "general" (zona_id null)
    para gastos que no son de ninguna zona en particular."""
    anio_int, m_int = map(int, mes.split("-"))
    gastos = _gastos_vigentes_del_mes(db, anio_int, m_int)

    ingresos_por_zona = dict(
        db.query(models.Cliente.zona_id, func.sum(models.Pago.monto))
        .join(models.Pago, models.Pago.cliente_id == models.Cliente.id)
        .filter(
            models.Pago.mes_pagado == mes,
            models.Pago.estado == models.EstadoPago.pagado,
        )
        .group_by(models.Cliente.zona_id)
        .all()
    )

    por_zona: dict = {}
    for g in gastos:
        bucket = por_zona.setdefault(g.zona_id, {"fijo": 0.0, "variable": 0.0})
        if g.es_recurrente:
            bucket["fijo"] += g.monto
        else:
            bucket["variable"] += g.monto

    zona_ids = set(por_zona.keys()) | set(ingresos_por_zona.keys())
    result = []
    for zid in zona_ids:
        fijo = por_zona.get(zid, {}).get("fijo", 0.0)
        variable = por_zona.get(zid, {}).get("variable", 0.0)
        ingresos = float(ingresos_por_zona.get(zid) or 0)
        total_gastos = fijo + variable
        result.append({
            "zona_id": zid,
            "fijo": round(fijo, 2),
            "variable": round(variable, 2),
            "total_gastos": round(total_gastos, 2),
            "ingresos": round(ingresos, 2),
            "margen": round(ingresos - total_gastos, 2),
        })
    return result


@router.post("", response_model=schemas.GastoOut, status_code=201)
def create_gasto(
    data: schemas.GastoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    gasto = models.Gasto(**data.model_dump(), registrado_por=current_user.id)
    db.add(gasto)
    db.commit()
    db.refresh(gasto)
    return gasto


@router.put("/{gasto_id}", response_model=schemas.GastoOut)
def update_gasto(
    gasto_id: int,
    data: schemas.GastoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    gasto = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    for k, v in data.model_dump().items():
        setattr(gasto, k, v)
    db.commit()
    db.refresh(gasto)
    return gasto


@router.delete("/{gasto_id}")
def delete_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    gasto = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(gasto)
    db.commit()
    return {"ok": True}


@router.get("/categorias")
def get_categorias(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_GERENCIA),
):
    categorias = db.query(models.Gasto.categoria).distinct().filter(
        models.Gasto.categoria.isnot(None)
    ).all()
    return [c[0] for c in categorias]
