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
_MATERIALES = _delegar("panel.materiales")
_WHATSAPP = _usar(_m("panel.whatsapp"))

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

    # Vincular el WhatsApp de la empresa, y ver si esta vinculado. El modulo
    # esta en SOLO_ADMINISTRADOR, asi que una cuenta que no sea de
    # administrador no puede ni recibirlo (ver modulo_disponible()).
    ("GET", "/api/whatsapp/qr"): _WHATSAPP,
    ("GET", "/api/whatsapp/status"): _WHATSAPP,
    ("POST", "/api/whatsapp/aviso-cobro/{cliente_id}"): _PAGOS,

    ("GET", "/api/materiales"): _MATERIALES,
    ("GET", "/api/materiales/movimientos"): _MATERIALES,
    ("GET", "/api/materiales/por-tecnico"): _MATERIALES,
    ("POST", "/api/materiales/movimientos"): _MATERIALES,
    ("POST", "/api/materiales"): _MATERIALES,
    ("PUT", "/api/materiales/{material_id}"): _MATERIALES,
    ("POST", "/api/materiales/{material_id}/presentaciones"): _MATERIALES,
    ("DELETE", "/api/materiales/presentaciones/{presentacion_id}"): _MATERIALES,
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


# ── De donde sale la ruta que se esta decidiendo ─────────────────────────────
# Las reglas de arriba se indexan por la ruta COMPLETA (`/api/whatsapp/qr`).
# Hasta el 2026-11-26 esa ruta se leia del objeto interno de Starlette:
#
#     getattr(request.scope.get("route"), "path", "")
#
# `path` no es parte del contrato publico de Starlette, y en las versiones
# nuevas pasa a valer `/qr` en vez de `/api/whatsapp/qr`: include_router ya no
# aplana las rutas en app.routes, las envuelve. El fallo no se habria visto, y
# eso es lo peor que tiene: ninguna clave volveria a coincidir,
# permite_lectura() devolveria True por no encontrar regla, y la capa de
# modulos dejaria de aplicarse entera.
#
# Lo que se hace ahora: los prefijos se registran al montar cada router —son
# los que main.py ya escribe— y la ruta completa se arma con `request.url.path`,
# que si es publico. Funciona igual con `path` absoluto (fastapi viejo) y
# relativo (fastapi nuevo), que es el punto.

_PREFIJOS: list[str] = []
_RUTAS_CONOCIDAS: set[tuple[str, str]] = set()


def registrar_rutas(router, prefijo: str) -> None:
    """Apunta el prefijo de un router y las rutas completas que aporta.

    Se llama junto a cada include_router(). Las rutas conocidas solo se usan
    para comprobar en las pruebas que ninguna regla apunta al vacio; la
    decision en caliente la toma ruta_de().
    """
    if prefijo not in _PREFIJOS:
        _PREFIJOS.append(prefijo)
    for ruta in getattr(router, "routes", []):
        for metodo in (getattr(ruta, "methods", None) or []):
            _RUTAS_CONOCIDAS.add((metodo, prefijo + getattr(ruta, "path", "")))


def _bajo(camino: str, prefijo: str) -> bool:
    return camino == prefijo or camino.startswith(prefijo + "/")


def ruta_de(request) -> str:
    """La ruta completa con plantilla de la peticion, o "" si no se sabe.

    Devolver "" a proposito y no una ruta a medias: sin coincidencia el
    endpoint queda como lo diga require_roles(), que es el comportamiento
    documentado arriba para un endpoint sin regla. Una ruta a medias podria
    coincidir con la regla de otro endpoint, que es mucho peor.
    """
    ruta = request.scope.get("route") if hasattr(request, "scope") else None
    camino = getattr(ruta, "path", "") or ""
    if not camino:
        return ""

    # fastapi viejo: `path` ya viene completo.
    if any(_bajo(camino, p) for p in _PREFIJOS):
        return camino

    # fastapi nuevo: `path` es relativo al router, y el prefijo se deduce de la
    # URL que se pidio de verdad.
    url = getattr(getattr(request, "url", None), "path", "") or ""
    for prefijo in _PREFIJOS:
        if _bajo(url, prefijo):
            return prefijo + camino
    return ""


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
    "panel.materiales",
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
