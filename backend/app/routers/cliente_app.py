"""
Endpoints exclusivos para la app móvil del cliente.
No requieren rol de admin — solo un token de cliente válido.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from ..database import get_db
from .. import models, schemas
from .auth import get_current_cliente

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()


@router.get("/me", response_model=schemas.MiCuentaOut)
def mi_cuenta(cliente: models.Cliente = Depends(get_current_cliente)):
    return cliente


@router.post("/cambiar-pin")
def cambiar_pin(
    data: schemas.CambiarPinRequest,
    db: Session = Depends(get_db),
    cliente: models.Cliente = Depends(get_current_cliente),
):
    """Cambia la contraseña del cliente en la app móvil."""
    # Verificar contraseña actual (personalizada, o el DNI por defecto)
    if cliente.pin_app:
        valido = _pwd.verify(data.pin_actual, cliente.pin_app)
    else:
        valido = bool(cliente.dni) and data.pin_actual == cliente.dni

    if not valido:
        raise HTTPException(400, "Contraseña actual incorrecta")

    if len(data.pin_nuevo.strip()) < 8:
        raise HTTPException(400, "La contraseña nueva debe tener al menos 8 caracteres")

    cliente.pin_app = _pwd.hash(data.pin_nuevo.strip())
    db.commit()
    return {"ok": True}


@router.get("/mis-pagos", response_model=dict)
def mis_pagos(
    page: int = Query(1, ge=1),
    per_page: int = Query(12, ge=1, le=50),
    db: Session = Depends(get_db),
    cliente: models.Cliente = Depends(get_current_cliente),
):
    query = db.query(models.Pago).filter(
        models.Pago.cliente_id == cliente.id,
        models.Pago.estado == models.EstadoPago.pagado,
    ).order_by(models.Pago.mes_pagado.desc())

    total = query.count()
    pagos = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
        "items": [schemas.PagoOut.model_validate(p) for p in pagos],
    }
