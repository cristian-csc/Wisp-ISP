"""Foto de presentación en Materiales.

Cubre que un material nuevo nace sin foto, que se puede subir y servir, que el
flag `tiene_foto` queda en True, y que pedir la foto de un material sin foto da
404. No toca stock ni movimientos: la foto es solo presentación.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import almacen_fotos
from app.database import get_db
from app.routers.auth import get_current_user
from app.routers import materiales as materiales_router
from tests.conftest import override_get_db, override_get_current_user


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Las fotos van a un directorio temporal, no al /media real.
    monkeypatch.setattr(almacen_fotos.settings, "MEDIA_DIR", str(tmp_path))
    app = FastAPI()
    app.include_router(materiales_router.router, prefix="/materiales")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c


_IMG = ("foto.jpg", b"\xff\xd8\xff\xe0contenido-falso-de-imagen", "image/jpeg")


def _crear_material(client, nombre="Conector", unidad="unidad"):
    resp = client.post(
        "/materiales",
        json={"nombre": nombre, "unidad": unidad, "se_recupera": False},
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()


def test_material_nace_sin_foto(client):
    m = _crear_material(client)
    assert m["tiene_foto"] is False


def test_subir_y_servir_foto(client):
    m = _crear_material(client, nombre="Roseta")
    resp = client.post(f"/materiales/{m['id']}/foto", files={"archivo": _IMG})
    assert resp.status_code == 200, resp.json()
    assert resp.json()["tiene_foto"] is True

    # Y se vuelve a listar con la foto puesta.
    lista = client.get("/materiales").json()
    roseta = next(x for x in lista if x["id"] == m["id"])
    assert roseta["tiene_foto"] is True

    # La foto se sirve.
    foto = client.get(f"/materiales/{m['id']}/foto")
    assert foto.status_code == 200


def test_foto_formato_invalido_rechazada(client):
    m = _crear_material(client, nombre="Tensador")
    resp = client.post(
        f"/materiales/{m['id']}/foto",
        files={"archivo": ("doc.pdf", b"%PDF-1.4 falso", "application/pdf")},
    )
    assert resp.status_code == 400


def test_material_sin_foto_da_404(client):
    m = _crear_material(client, nombre="Patch cord")
    resp = client.get(f"/materiales/{m['id']}/foto")
    assert resp.status_code == 404


def test_foto_de_material_inexistente(client):
    resp = client.post("/materiales/99999/foto", files={"archivo": _IMG})
    assert resp.status_code == 404
