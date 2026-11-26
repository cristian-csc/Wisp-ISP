"""De donde saca la capa de permisos la ruta que esta decidiendo.

`acceso.py` indexa sus reglas por `(metodo, ruta)`, con rutas completas como
`/api/whatsapp/qr`. Hasta el 2026-11-26 esa ruta se leia asi:

    getattr(request.scope.get("route"), "path", "")

`route` es un objeto interno de Starlette y `path` no es parte de su contrato
publico. Al preparar la subida de fastapi que cierra A-4 resulto que en las
versiones nuevas ese atributo pasa a valer `/qr` en vez de
`/api/whatsapp/qr`, porque include_router ya no aplana las rutas en
`app.routes`: las envuelve en un `_IncludedRouter`.

La consecuencia no habria sido un error visible, y eso es lo peor: ninguna
clave de REGLAS ni de LECTURAS vuelve a coincidir, `permite_lectura()`
devuelve True porque no encuentra regla, y la capa de modulos deja de
aplicarse entera. Cualquier cuenta del personal podria leer la lista completa
de clientes.

Estas pruebas fijan que la resolucion funciona con las dos formas del
atributo, para que la subida de version sea un cambio de version y no una
loteria.
"""
import pytest
from fastapi import APIRouter, FastAPI, Request
from fastapi.testclient import TestClient

from app import acceso


@pytest.fixture
def app_montada():
    """Una app con dos routers, montada como lo hace main.py."""
    r1 = APIRouter()

    @r1.get("/qr")
    def qr(request: Request):
        return {"ruta": acceso.ruta_de(request)}

    r2 = APIRouter()

    @r2.get("/{cliente_id}/historial")
    def historial(cliente_id: int, request: Request):
        return {"ruta": acceso.ruta_de(request)}

    app = FastAPI()
    app.include_router(r1, prefix="/api/whatsapp")
    acceso.registrar_rutas(r1, "/api/whatsapp")
    app.include_router(r2, prefix="/api/clientes")
    acceso.registrar_rutas(r2, "/api/clientes")
    return app


def test_devuelve_la_ruta_completa(app_montada):
    c = TestClient(app_montada)
    assert c.get("/api/whatsapp/qr").json()["ruta"] == "/api/whatsapp/qr"


def test_conserva_la_plantilla_del_parametro(app_montada):
    """La clave de REGLAS es la plantilla, no la ruta con el 7 dentro."""
    c = TestClient(app_montada)
    assert c.get("/api/clientes/7/historial").json()["ruta"] == (
        "/api/clientes/{cliente_id}/historial"
    )


def test_funciona_con_el_path_relativo_de_fastapi_nuevo(app_montada):
    """La prueba del hallazgo.

    Se simula la version nueva poniendo `path` relativo, que es como queda
    cuando include_router envuelve las rutas en vez de aplanarlas. La ruta
    completa debe seguir saliendo.
    """
    for ruta in app_montada.routes:
        if getattr(ruta, "path", "") == "/api/whatsapp/qr":
            ruta.path = "/qr"
            break
    else:
        pytest.skip("esta version de fastapi ya no aplana las rutas")

    c = TestClient(app_montada)
    assert c.get("/api/whatsapp/qr").json()["ruta"] == "/api/whatsapp/qr", (
        "la ruta se seguia deduciendo de route.path"
    )


def test_una_ruta_fuera_de_todo_prefijo_no_se_confunde_con_otra():
    """Mejor no encontrar regla que encontrar la equivocada."""
    app = FastAPI()

    @app.get("/suelta")
    def suelta(request: Request):
        return {"ruta": acceso.ruta_de(request)}

    assert TestClient(app).get("/suelta").json()["ruta"] == ""


def test_las_reglas_apuntan_a_rutas_que_existen():
    """Ninguna regla al vacio.

    Es la misma comprobacion que hacia test_humo, ahora contra el registro
    explicito: si alguien escribe una regla con la ruta mal, o monta un router
    sin registrarlo, se ve aqui.
    """
    import app.main  # noqa: F401  — montar() llena el registro al importarse

    declaradas = set(acceso.REGLAS) | {
        (metodo, ruta) for metodo, ruta in acceso.LECTURAS
    }
    fantasma = sorted(declaradas - acceso._RUTAS_CONOCIDAS)
    assert not fantasma, f"reglas que no corresponden a ninguna ruta: {fantasma}"
