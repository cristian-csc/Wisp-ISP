from typing import Optional

from . import models
from .config import settings


def _precio_tv_adicional(plan: models.Plan) -> float:
    """El plan puede fijar su propia tarifa por TV extra (editable en el
    módulo de Planes); si no la fija, se usa la tarifa global por defecto."""
    return plan.precio_tv_adicional if plan.precio_tv_adicional is not None else settings.PRECIO_TV_ADICIONAL


def monto_mensual(cliente: models.Cliente, plan: Optional[models.Plan]) -> float:
    """Monto que debe pagar el cliente cada mes: precio del plan + S/ por cada
    TV que exceda las TV incluidas en el plan (ver Plan.tv_incluidas)."""
    if not plan:
        return 0.0
    tv_adicionales = max(0, (cliente.cantidad_tv or 0) - (plan.tv_incluidas or 0))
    return plan.precio + tv_adicionales * _precio_tv_adicional(plan)


def detalle_monto(cliente: models.Cliente, plan: Optional[models.Plan]) -> list[dict]:
    """Desglose de por qué se le cobra ese monto — para mostrar en la UI
    (ej. "Internet 39: S/39.00" + "1 TV adicional: S/10.00")."""
    if not plan:
        return []
    detalle = [{"concepto": plan.nombre, "monto": plan.precio}]
    tv_adicionales = max(0, (cliente.cantidad_tv or 0) - (plan.tv_incluidas or 0))
    if tv_adicionales > 0:
        etiqueta = "TV adicional" if tv_adicionales == 1 else "TVs adicionales"
        detalle.append({
            "concepto": f"{tv_adicionales} {etiqueta}",
            "monto": tv_adicionales * _precio_tv_adicional(plan),
        })
    return detalle
