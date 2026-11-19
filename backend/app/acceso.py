"""Qué módulo abre cada endpoint de la API.

Lo marcado en Roles y módulos es el permiso real. require_roles() sigue
diciendo qué tipo de cuenta puede hacer cada cosa y este archivo agrega el
módulo que además hay que tener:

- `usar`: hace falta uno de estos módulos, y el tipo de cuenta debe estar
  permitido en require_roles().
- `amplia`: el módulo basta por sí solo. Se usa únicamente en módulos que se
  pueden delegar enteros, como Gastos o Planes.

Un endpoint que no aparece aquí queda como lo dice require_roles(). Así siguen
siendo solo del administrador los usuarios, las copias de seguridad, la
terminal del router, la red de las zonas y borrar pagos o clientes.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Regla:
    usar: frozenset = field(default_factory=frozenset)
    amplia: frozenset = field(default_factory=frozenset)


def _m(*claves: str) -> frozenset:
    return frozenset(claves)


CLIENTES_PANEL = _m(
    "panel.clientes_fibra", "panel.clientes_inalambricos",
    "panel.clientes_satelital", "panel.clientes_pendientes",
)
PAGOS = _m("panel.pagos")
AVERIAS = _m("panel.averias")
RETIROS = _m("panel.ordenes_retiro")
TECNICO_APP = _m("movil.ordenes", "movil.averias", "movil.retiros", "movil.inventario", "movil.registrar")
VENDEDOR_APP = _m("movil.registrar", "movil.jornada", "movil.mis_clientes")
CAMPO = TECNICO_APP | VENDEDOR_APP


def _usar(*grupos: frozenset) -> Regla:
    return Regla(usar=frozenset().union(*grupos))


def _delegar(clave: str) -> Regla:
    return Regla(amplia=_m(clave))


_FICHA = _usar(CLIENTES_PANEL, PAGOS)
_PAGOS = _usar(PAGOS, CLIENTES_PANEL)
_SOLO_PAGOS = _usar(PAGOS)
_INSTALAR = _usar(_m("movil.ordenes"))
_PLANTA = _usar(_m("movil.ordenes", "movil.averias"))
_ATENDER_AVERIA = _usar(AVERIAS, _m("movil.averias"))
_GASTOS = _delegar("panel.gastos")
_PLANES = _delegar("panel.planes")
_CAJAS = _delegar("panel.cajas_nap")
_JORNADAS = _delegar("panel.jornadas")
_JORNADA_PROPIA = _usar(_m("movil.jornada"))
_APROBAR = _delegar("panel.clientes_pendientes")
_CAJA = _delegar("panel.reporte_caja")

# Endpoints protegidos con require_roles().
REGLAS: dict[tuple[str, str], Regla] = {
    ("POST", "/api/averias"): _usar(AVERIAS, CLIENTES_PANEL, _m("movil.averias")),
    ("POST", "/api/averias/{averia_id}/iniciar"): _ATENDER_AVERIA,
    ("POST", "/api/averias/{averia_id}/resolver"): _ATENDER_AVERIA,

    ("POST", "/api/cajas-nap"): _CAJAS,
    ("PUT", "/api/cajas-nap/{caja_id}"): _CAJAS,
    ("DELETE", "/api/cajas-nap/{caja_id}"): _CAJAS,
    ("POST", "/api/cajas-nap/{caja_id}/ampliar"): _CAJAS,
    ("POST", "/api/cajas-nap/bornes/{borne_id}/marcar"): _PLANTA,
    ("PUT", "/api/cajas-nap/bornes/{borne_id}/precinto"): _PLANTA,
    ("GET", "/api/cajas-nap/{caja_id}/estado-pppoe"): _PLANTA,

    ("POST", "/api/clientes"): _usar(CLIENTES_PANEL, _m("movil.registrar")),
    ("GET", "/api/clientes/notificaciones"): _FICHA,
    ("PUT", "/api/clientes/{cliente_id}"): _usar(CLIENTES_PANEL),
    ("POST", "/api/clientes/{cliente_id}/compromiso-pago"): _FICHA,
    ("POST", "/api/clientes/{cliente_id}/cortar"): _FICHA,
    ("POST", "/api/clientes/{cliente_id}/pausar"): _FICHA,
    ("POST", "/api/clientes/{cliente_id}/reactivar"): _FICHA,
    ("PUT", "/api/clientes/{cliente_id}/datos-de-instalacion"): _INSTALAR,
    ("POST", "/api/clientes/{cliente_id}/instalar"): _INSTALAR,
    ("POST", "/api/clientes/{cliente_id}/no-instalar"): _INSTALAR,
    ("POST", "/api/clientes/{cliente_id}/aprobar"): _APROBAR,
    ("POST", "/api/clientes/{cliente_id}/rechazar"): _APROBAR,
    ("GET", "/api/clientes/{cliente_id}/ips-disponibles"): _APROBAR,

    ("GET", "/api/dashboard/stats"): _usar(_m("panel.dashboard")),
    ("GET", "/api/dashboard/ultimas-activaciones"): _usar(_m("panel.dashboard")),

    ("POST", "/api/evidencias"): _usar(CLIENTES_PANEL, AVERIAS, RETIROS, CAMPO),

    ("GET", "/api/gastos"): _GASTOS,
    ("POST", "/api/gastos"): _GASTOS,
    ("GET", "/api/gastos/categorias"): _GASTOS,
    ("GET", "/api/gastos/resumen-por-zona"): _GASTOS,
    ("PUT", "/api/gastos/{gasto_id}"): _GASTOS,
    ("DELETE", "/api/gastos/{gasto_id}"): _GASTOS,

    ("GET", "/api/jornadas"): _JORNADAS,
    ("GET", "/api/jornadas/activas"): _JORNADAS,
    ("GET", "/api/jornadas/resumen-pasajes"): _JORNADAS,
    ("PUT", "/api/jornadas/{jornada_id}/pasaje"): _JORNADAS,
    ("PUT", "/api/jornadas/{jornada_id}/reclamo-pasaje/reintegrar"): _JORNADAS,
    ("GET", "/api/jornadas/{jornada_id}/recorrido"): _JORNADAS,
    ("POST", "/api/jornadas/iniciar"): _JORNADA_PROPIA,
    ("POST", "/api/jornadas/finalizar"): _JORNADA_PROPIA,
    ("GET", "/api/jornadas/mi-jornada-activa"): _JORNADA_PROPIA,
    ("POST", "/api/jornadas/ping"): _JORNADA_PROPIA,
    ("PUT", "/api/jornadas/{jornada_id}/reclamo-pasaje"): _JORNADA_PROPIA,

    ("POST", "/api/onus/registrar-propio"): _usar(_m("movil.inventario", "movil.ordenes")),
    ("POST", "/api/onus/{onu_id}/marcar"): _usar(_m("movil.inventario", "movil.ordenes", "movil.averias", "movil.retiros")),

    ("POST", "/api/ordenes-retiro"): _usar(RETIROS, CLIENTES_PANEL),
    ("POST", "/api/ordenes-retiro/{orden_id}/asignar"): _usar(RETIROS),
    ("POST", "/api/ordenes-retiro/{orden_id}/completar"): _usar(RETIROS, _m("movil.retiros")),

    ("GET", "/api/pagos"): _PAGOS,
    ("POST", "/api/pagos"): _PAGOS,
    ("GET", "/api/pagos/{pago_id}"): _PAGOS,
    ("GET", "/api/pagos/{pago_id}/comprobante"): _PAGOS,
    ("POST", "/api/pagos/{pago_id}/comprobante"): _PAGOS,
    ("GET", "/api/pagos/{pago_id}/recibo-pdf"): _PAGOS,
    ("POST", "/api/pagos/{pago_id}/reenviar-whatsapp"): _PAGOS,
    ("GET", "/api/pagos/clientes-cortados"): _SOLO_PAGOS,
    ("GET", "/api/pagos/clientes-sin-pago"): _SOLO_PAGOS,
    ("GET", "/api/pagos/exportar"): _SOLO_PAGOS,
    ("GET", "/api/pagos/pausas-por-vencer"): _SOLO_PAGOS,
    ("GET", "/api/pagos/reporte-caja"): _CAJA,
    ("GET", "/api/pagos/reporte-caja/exportar"): _CAJA,

    ("POST", "/api/planes"): _PLANES,
    ("PUT", "/api/planes/{plan_id}"): _PLANES,
    ("DELETE", "/api/planes/{plan_id}"): _PLANES,
    ("GET", "/api/planes/verificacion"): _PLANES,
    ("GET", "/api/planes/perfiles-de-zona/{zona_id}"): _PLANES,

    ("POST", "/api/whatsapp/aviso-cobro/{cliente_id}"): _PAGOS,
}

_LEER_CLIENTES = CLIENTES_PANEL | PAGOS | AVERIAS | RETIROS | CAMPO
_LEER_AVERIAS = AVERIAS | CLIENTES_PANEL | CAMPO
_LEER_RETIROS = RETIROS | CLIENTES_PANEL | CAMPO
_LEER_ONUS = _m("panel.onus") | AVERIAS | RETIROS | CLIENTES_PANEL | CAMPO

# Consultas abiertas a cualquier sesión que también dependen del módulo. Zonas,
# planes y cajas quedan fuera: son catálogos que usan los formularios de todos.
LECTURAS: dict[tuple[str, str], frozenset] = {
    ("GET", "/api/clientes"): _LEER_CLIENTES,
    ("GET", "/api/clientes/resumen-estados"): _LEER_CLIENTES,
    ("GET", "/api/clientes/{cliente_id}"): _LEER_CLIENTES,
    ("GET", "/api/clientes/{cliente_id}/calendario-pagos"): _LEER_CLIENTES,
    ("GET", "/api/clientes/{cliente_id}/historial"): _LEER_CLIENTES,
    ("GET", "/api/clientes/{cliente_id}/pppoe-status"): _LEER_CLIENTES,
    ("GET", "/api/averias"): _LEER_AVERIAS,
    ("GET", "/api/averias/{averia_id}"): _LEER_AVERIAS,
    ("GET", "/api/ordenes-retiro"): _LEER_RETIROS,
    ("GET", "/api/ordenes-retiro/{orden_id}"): _LEER_RETIROS,
    ("GET", "/api/onus"): _LEER_ONUS,
    ("GET", "/api/onus/{onu_id}"): _LEER_ONUS,
}


def permite_con_roles(
    perfil: str, es_superadmin: bool, modulos: set, permitidos: set, metodo: str, ruta: str,
) -> bool:
    """La decisión para un endpoint protegido con require_roles()."""
    regla = REGLAS.get((metodo, ruta))
    if regla is None or es_superadmin:
        return perfil in permitidos
    if modulos & regla.amplia:
        return True
    return perfil in permitidos and bool(modulos & regla.usar)


def permite_lectura(es_superadmin: bool, modulos: set, metodo: str, ruta: str) -> bool:
    """La decisión para una consulta abierta a cualquier sesión."""
    necesarios = LECTURAS.get((metodo, ruta))
    return necesarios is None or es_superadmin or bool(modulos & necesarios)


# ── Qué módulos puede recibir cada tipo de cuenta ────────────────────────────

SOLO_ADMINISTRADOR = _m("panel.usuarios", "panel.whatsapp", "panel.roles", "panel.modulos_padre")
DELEGABLES = _m(
    "panel.dashboard", "panel.gastos", "panel.planes", "panel.cajas_nap",
    "panel.jornadas", "panel.reporte_caja", "panel.clientes_pendientes",
)
APP_CLIENTE = _m("movil.inicio", "movil.pagos", "movil.perfil")


def modulo_disponible(clave: str, perfil: Optional[str]) -> bool:
    """¿Una cuenta de este tipo puede recibir este módulo y usarlo de verdad?"""
    if perfil is None:
        return clave in APP_CLIENTE
    if clave in APP_CLIENTE:
        return False
    if perfil == "admin":
        return clave.startswith("panel.")
    if clave in SOLO_ADMINISTRADOR:
        return False
    if clave.startswith("movil."):
        return clave in {"tecnico": TECNICO_APP, "vendedor_campo": VENDEDOR_APP}.get(perfil, frozenset())
    return clave in DELEGABLES or perfil == "atencion_cliente"
