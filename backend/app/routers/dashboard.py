from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract
from datetime import date

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user

router = APIRouter()


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    hoy = date.today()
    mes_actual = f"{hoy.year}-{hoy.month:02d}"

    if hoy.month == 1:
        mes_ant = f"{hoy.year - 1}-12"
    else:
        mes_ant = f"{hoy.year}-{hoy.month - 1:02d}"

    total = db.query(models.Cliente).count()
    activos = db.query(models.Cliente).filter(models.Cliente.estado == models.EstadoCliente.activo).count()
    suspendidos = db.query(models.Cliente).filter(models.Cliente.estado == models.EstadoCliente.suspendido).count()

    ingresos_actual = db.query(func.sum(models.Pago.monto)).filter(
        models.Pago.mes_pagado == mes_actual,
        models.Pago.estado == models.EstadoPago.pagado,
    ).scalar() or 0

    ingresos_ant = db.query(func.sum(models.Pago.monto)).filter(
        models.Pago.mes_pagado == mes_ant,
        models.Pago.estado == models.EstadoPago.pagado,
    ).scalar() or 0

    gastos_actual = db.query(func.sum(models.Gasto.monto)).filter(
        extract("year", models.Gasto.fecha) == hoy.year,
        extract("month", models.Gasto.fecha) == hoy.month,
    ).scalar() or 0

    total_zonas = db.query(models.Zona).filter(models.Zona.activo == True).count()

    # Clientes activos sin pago este mes
    pagaron = db.query(models.Pago.cliente_id).filter(
        models.Pago.mes_pagado == mes_actual
    ).subquery()
    pendientes = db.query(models.Cliente).filter(
        models.Cliente.estado == models.EstadoCliente.activo,
        ~models.Cliente.id.in_(pagaron),
    ).count()

    return schemas.DashboardStats(
        total_clientes=total,
        clientes_activos=activos,
        clientes_suspendidos=suspendidos,
        ingresos_mes_actual=float(ingresos_actual),
        ingresos_mes_anterior=float(ingresos_ant),
        gastos_mes_actual=float(gastos_actual),
        total_zonas=total_zonas,
        pagos_pendientes=pendientes,
    )


@router.get("/ingresos-mensual")
def ingresos_mensual(
    anio: int = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not anio:
        anio = date.today().year

    result = []
    for mes in range(1, 13):
        mes_str = f"{anio}-{mes:02d}"
        ingresos = db.query(func.sum(models.Pago.monto)).filter(
            models.Pago.mes_pagado == mes_str,
            models.Pago.estado == models.EstadoPago.pagado,
        ).scalar() or 0

        gastos = db.query(func.sum(models.Gasto.monto)).filter(
            extract("year", models.Gasto.fecha) == anio,
            extract("month", models.Gasto.fecha) == mes,
        ).scalar() or 0

        result.append({
            "mes": mes_str,
            "nombre_mes": ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                           "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][mes - 1],
            "ingresos": float(ingresos),
            "gastos": float(gastos),
        })

    return result


@router.get("/ultimas-activaciones")
def ultimas_activaciones(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    activaciones = db.query(models.Historial).options(
        joinedload(models.Historial.cliente)
    ).filter(
        models.Historial.tipo.in_(["activacion", "corte", "pago"])
    ).order_by(models.Historial.creado_en.desc()).limit(limit).all()

    return [
        {
            "id": h.id,
            "tipo": h.tipo,
            "descripcion": h.descripcion,
            "cliente_nombre": h.cliente.nombre if h.cliente else "—",
            "creado_en": h.creado_en,
        }
        for h in activaciones
    ]
