"""Pruebas de humo: que la aplicación se pueda importar y montar.

Por qué existe este archivo: durante un tiempo las 30 pruebas de la suite
fallaron a la vez por una sola línea de conftest.py, y nadie se enteró. El
problema era que todas pasaban por la autenticación simulada, así que un fallo
en ESA pieza las tumbaba todas y el error que salía (`'str' object has no
attribute 'value'`) no decía nada del dinero ni de los pagos.

Estas pruebas no tocan la base de datos ni la autenticación. Comprueban lo más
básico que puede romperse y que, cuando se rompe, lo rompe todo: que los
módulos se importan, que las rutas se registran y que las reglas de permisos
apuntan a rutas que existen de verdad.
"""
import importlib

import pytest


def test_la_app_se_importa():
    """app.main se importa sin tocar la base de datos.

    El lifespan (que sí conecta a PostgreSQL) solo corre al arrancar el
    servidor, no al importar, así que esto es seguro y rápido. Si algún día
    alguien mete una conexión a nivel de módulo, esta prueba lo caza.
    """
    main = importlib.import_module("app.main")
    assert main.app.title


def test_las_rutas_estan_registradas():
    """Las rutas del API existen y tienen la forma esperada.

    Un número exacto se rompería cada vez que se añade un endpoint, así que se
    comprueba un mínimo y que estén las de siempre.
    """
    from app.main import app

    rutas = {
        (metodo, getattr(r, "path", ""))
        for r in app.routes
        for metodo in (getattr(r, "methods", None) or [])
    }
    assert len(rutas) > 150, f"solo se registraron {len(rutas)} rutas"

    imprescindibles = [
        ("GET", "/api/health"),
        ("POST", "/api/auth/login"),
        ("POST", "/api/auth/cliente/login"),
        ("POST", "/api/auth/cliente/solicitar-codigo"),
        ("POST", "/api/auth/cliente/verificar-codigo"),
        ("GET", "/api/clientes"),
        ("POST", "/api/pagos"),
    ]
    faltan = [r for r in imprescindibles if r not in rutas]
    assert not faltan, f"rutas que deberían existir y no están: {faltan}"


def test_las_reglas_de_permisos_apuntan_a_rutas_reales():
    """Ninguna clave de acceso.py se refiere a una ruta que no existe.

    Esto importa más de lo que parece: REGLAS y LECTURAS se indexan por
    (método, ruta) exactos. Una ruta mal escrita —o renombrada sin actualizar
    el diccionario— no da ningún error: la regla simplemente deja de aplicarse
    y el endpoint queda más abierto de lo que su autor cree. Falla en silencio
    y hacia el lado peligroso, que es la peor combinación.
    """
    from app import acceso
    from app.main import app

    rutas = {
        (metodo, getattr(r, "path", ""))
        for r in app.routes
        for metodo in (getattr(r, "methods", None) or [])
    }

    huerfanas = [k for k in {**acceso.REGLAS, **acceso.LECTURAS} if k not in rutas]
    assert not huerfanas, (
        "estas reglas de permisos no corresponden a ninguna ruta real, "
        f"así que no protegen nada: {sorted(huerfanas)}"
    )


@pytest.mark.parametrize(
    "modulo",
    [
        "app.acceso", "app.billing", "app.config", "app.facturacion",
        "app.lineas", "app.mensajeria", "app.models", "app.recibos",
        "app.reportes", "app.schemas", "app.seed",
    ],
)
def test_cada_modulo_se_importa(modulo):
    """Un error de sintaxis o un import circular se ve aquí y no en producción."""
    assert importlib.import_module(modulo)
