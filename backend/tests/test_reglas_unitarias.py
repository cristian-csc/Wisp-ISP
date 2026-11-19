"""
Pruebas unitarias de caja blanca: funciones puras, sin base de datos ni HTTP.

Cada caso recorre una rama concreta del código, señalada en su nombre:
- facturacion.py: día de pago, meses de distinto largo y el límite del 25.
- billing.py: monto mensual y desglose con y sin TV adicionales.
- acceso.py: la decisión de permisos por tipo de cuenta, módulo y regla.
"""
from datetime import date
from types import SimpleNamespace

import pytest

from app import acceso
from app.billing import detalle_monto, monto_mensual
from app.facturacion import con_dia, dia_de_pago, primer_vencimiento, proximo_vencimiento, sumar_meses


# ── facturacion.py ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("activacion,dia", [
    (date(2026, 3, 1), 1),     # límite inferior
    (date(2026, 3, 25), 25),   # último día válido (rama day <= 25)
    (date(2026, 3, 26), 1),    # primer día que pasa al 1 (rama alternativa)
    (date(2026, 3, 31), 1),
])
def test_dia_de_pago_limites(activacion, dia):
    assert dia_de_pago(activacion) == dia


def test_con_dia_recorta_al_ultimo_dia_del_mes():
    assert con_dia(2026, 2, 31) == date(2026, 2, 28)
    assert con_dia(2028, 2, 31) == date(2028, 2, 29)   # año bisiesto
    assert con_dia(2026, 4, 30) == date(2026, 4, 30)


def test_sumar_meses_cruza_el_anio():
    assert sumar_meses(date(2026, 12, 8), 1, 8) == date(2027, 1, 8)
    assert sumar_meses(date(2026, 11, 8), 14, 8) == date(2028, 1, 8)


def test_primer_vencimiento_rama_normal_es_un_mes():
    assert primer_vencimiento(date(2026, 1, 15)) == date(2026, 2, 15)


def test_primer_vencimiento_desde_el_26_salta_al_1_del_mes_subsiguiente():
    # Activado el 28 de enero: paga el 1 de marzo, sin cobrar los días sueltos.
    assert primer_vencimiento(date(2026, 1, 28)) == date(2026, 3, 1)


def test_el_dia_no_se_mueve_en_vencimientos_sucesivos():
    v = primer_vencimiento(date(2026, 1, 25))
    fechas = []
    for _ in range(4):
        fechas.append(v)
        v = proximo_vencimiento(v, 25)
    assert [f.day for f in fechas] == [25, 25, 25, 25]


# ── billing.py ───────────────────────────────────────────────────────────────

def _plan(precio=50.0, tv_incluidas=1, precio_tv=None):
    return SimpleNamespace(nombre="Fibra 100", precio=precio, tv_incluidas=tv_incluidas, precio_tv_adicional=precio_tv)


def test_monto_sin_plan_es_cero():
    assert monto_mensual(SimpleNamespace(cantidad_tv=3), None) == 0.0
    assert detalle_monto(SimpleNamespace(cantidad_tv=3), None) == []


def test_monto_sin_tv_extra():
    assert monto_mensual(SimpleNamespace(cantidad_tv=1), _plan()) == 50.0
    assert len(detalle_monto(SimpleNamespace(cantidad_tv=1), _plan())) == 1


def test_monto_con_tv_extra_usa_la_tarifa_del_plan():
    cliente = SimpleNamespace(cantidad_tv=3)
    assert monto_mensual(cliente, _plan(precio_tv=8.0)) == 50.0 + 2 * 8.0
    detalle = detalle_monto(cliente, _plan(precio_tv=8.0))
    assert detalle[1]["concepto"] == "2 TVs adicionales" and detalle[1]["monto"] == 16.0


def test_cantidad_tv_nula_no_rompe():
    assert monto_mensual(SimpleNamespace(cantidad_tv=None), _plan()) == 50.0


# ── acceso.py ────────────────────────────────────────────────────────────────

C = acceso.permite_con_roles
L = acceso.permite_lectura


def test_ruta_sin_regla_decide_solo_el_tipo_de_cuenta():
    assert C("admin", False, set(), {"admin"}, "GET", "/api/ruta-sin-regla")
    assert not C("tecnico", False, set(), {"admin"}, "GET", "/api/ruta-sin-regla")


def test_superadmin_ignora_los_modulos():
    assert C("admin", True, set(), {"admin"}, "POST", "/api/cajas-nap")


def test_regla_amplia_basta_con_el_modulo():
    assert C("atencion_cliente", False, {"panel.inventario_cajas"}, {"admin"}, "POST", "/api/cajas-nap")


def test_regla_usar_pide_modulo_y_tipo_de_cuenta():
    ruta = "/api/clientes/{cliente_id}/cortar"
    assert C("atencion_cliente", False, {"panel.pagos"}, {"admin", "atencion_cliente"}, "POST", ruta)
    assert not C("atencion_cliente", False, set(), {"admin", "atencion_cliente"}, "POST", ruta)
    assert not C("tecnico", False, {"panel.pagos"}, {"admin", "atencion_cliente"}, "POST", ruta)


def test_modulos_de_red_no_abren_escrituras():
    assert not C("atencion_cliente", False, {"panel.cajas_nap"}, {"admin"}, "POST", "/api/cajas-nap")
    assert not C("atencion_cliente", False, {"panel.onus"}, {"admin"}, "POST", "/api/onus")


def test_lectura_con_y_sin_modulo():
    assert L(False, {"panel.inventario"}, "GET", "/api/inventario/articulos")
    assert not L(False, {"movil.ordenes"}, "GET", "/api/inventario/articulos")
    assert L(False, set(), "GET", "/api/inventario/mio")          # sin regla: abierta
    assert L(True, set(), "GET", "/api/inventario/articulos")      # superadmin


@pytest.mark.parametrize("clave,perfil,esperado", [
    ("movil.inicio", None, True),                 # app del cliente
    ("panel.dashboard", None, False),
    ("movil.inicio", "admin", False),
    ("panel.usuarios", "admin", True),
    ("panel.usuarios", "atencion_cliente", False),  # solo administrador
    ("movil.ordenes", "tecnico", True),
    ("movil.jornada", "tecnico", False),            # es de vendedora
    ("panel.inventario", "tecnico", True),          # delegable
    ("panel.zonas", "tecnico", False),
    ("panel.zonas", "atencion_cliente", True),
])
def test_modulo_disponible_por_tipo_de_cuenta(clave, perfil, esperado):
    assert acceso.modulo_disponible(clave, perfil) is esperado
