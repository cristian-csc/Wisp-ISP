"""Tests del módulo Flota: unidades vehiculares y recargas de combustible.

Cubre:
- CRUD de unidades (placa normalizada en mayúsculas, placa duplicada rechazada)
- Foto de la unidad (subir y servir)
- Registrar recarga con sus dos fotos obligatorias (surtidor + boleta)
- Validaciones (monto > 0, unidad existente y activa)
- Reporte mensual por unidad
- No se borra una unidad con recargas; sí se borra una recarga suelta
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import almacen_fotos
from app.database import get_db
from app.routers.auth import get_current_user
from app.routers import unidades as unidades_router
from app.routers import combustible as combustible_router
from tests.conftest import override_get_db, override_get_current_user


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Las fotos se guardan en un directorio temporal, no en /media real.
    monkeypatch.setattr(almacen_fotos.settings, "MEDIA_DIR", str(tmp_path))
    app = FastAPI()
    app.include_router(unidades_router.router, prefix="/unidades")
    app.include_router(combustible_router.router, prefix="/combustible")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c


_IMG = ("foto.jpg", b"\xff\xd8\xff\xe0contenido-falso-de-imagen", "image/jpeg")


def _crear_unidad(client, placa="abc-123", marca="Toyota", modelo="Yaris"):
    resp = client.post("/unidades", json={"placa": placa, "marca": marca, "modelo": modelo})
    assert resp.status_code == 201, resp.json()
    return resp.json()


def _registrar_recarga(client, unidad_id, monto=50.0):
    return client.post(
        "/combustible",
        data={"unidad_id": unidad_id, "monto": monto},
        files={"foto_surtidor": _IMG, "foto_boleta": _IMG},
    )


# ── Unidades ──────────────────────────────────────────────────────────────────

def test_crear_unidad_normaliza_placa(client):
    u = _crear_unidad(client, placa="abc-123")
    assert u["placa"] == "ABC-123"  # se guarda en mayúsculas
    assert u["marca"] == "Toyota"
    assert u["tiene_foto"] is False
    assert u["activo"] is True


def test_placa_duplicada_rechazada(client):
    _crear_unidad(client, placa="XYZ-999")
    resp = client.post("/unidades", json={"placa": "xyz-999"})
    assert resp.status_code == 400


def test_listar_unidades(client):
    _crear_unidad(client, placa="AAA-111")
    _crear_unidad(client, placa="BBB-222")
    resp = client.get("/unidades")
    assert resp.status_code == 200
    placas = {u["placa"] for u in resp.json()}
    assert {"AAA-111", "BBB-222"} <= placas


def test_foto_de_unidad(client):
    u = _crear_unidad(client)
    resp = client.post(f"/unidades/{u['id']}/foto", files={"archivo": _IMG})
    assert resp.status_code == 200, resp.json()
    assert resp.json()["tiene_foto"] is True
    # Se puede servir la foto guardada.
    ver = client.get(f"/unidades/{u['id']}/foto")
    assert ver.status_code == 200
    assert ver.content  # trae bytes


def test_foto_rechaza_extension_invalida(client):
    u = _crear_unidad(client)
    resp = client.post(
        f"/unidades/{u['id']}/foto",
        files={"archivo": ("virus.exe", b"MZ", "application/octet-stream")},
    )
    assert resp.status_code == 400


# ── Combustible ───────────────────────────────────────────────────────────────

def test_registrar_recarga(client):
    u = _crear_unidad(client)
    resp = _registrar_recarga(client, u["id"], monto=73.5)
    assert resp.status_code == 201, resp.json()
    r = resp.json()
    assert r["monto"] == 73.5
    assert r["unidad_id"] == u["id"]
    assert r["tiene_foto_surtidor"] is True
    assert r["tiene_foto_boleta"] is True


def test_recarga_monto_invalido(client):
    u = _crear_unidad(client)
    resp = _registrar_recarga(client, u["id"], monto=0)
    assert resp.status_code == 400


def test_recarga_unidad_inexistente(client):
    resp = _registrar_recarga(client, 9999, monto=10)
    assert resp.status_code == 404


def test_recarga_exige_las_dos_fotos(client):
    u = _crear_unidad(client)
    # Falta la foto de la boleta.
    resp = client.post(
        "/combustible",
        data={"unidad_id": u["id"], "monto": 20},
        files={"foto_surtidor": _IMG},
    )
    assert resp.status_code == 422  # campo requerido ausente


def test_reporte_mensual_por_unidad(client):
    u = _crear_unidad(client, placa="REP-001")
    r1 = _registrar_recarga(client, u["id"], monto=40).json()
    _registrar_recarga(client, u["id"], monto=60)
    mes = r1["fecha"][:7]  # YYYY-MM de la carga
    resp = client.get("/combustible/reporte", params={"mes": mes})
    assert resp.status_code == 200, resp.json()
    fila = next(f for f in resp.json() if f["unidad_id"] == u["id"])
    assert fila["total"] == 100.0
    assert fila["recargas"] == 2
    assert fila["placa"] == "REP-001"


def test_no_borrar_unidad_con_recargas(client):
    u = _crear_unidad(client)
    _registrar_recarga(client, u["id"], monto=30)
    resp = client.delete(f"/unidades/{u['id']}")
    assert resp.status_code == 400  # tiene historial, hay que desactivar


def test_borrar_recarga(client):
    u = _crear_unidad(client)
    r = _registrar_recarga(client, u["id"], monto=30).json()
    resp = client.delete(f"/combustible/{r['id']}")
    assert resp.status_code == 204
    # Ya se puede borrar la unidad (sin recargas).
    assert client.delete(f"/unidades/{u['id']}").status_code == 204
