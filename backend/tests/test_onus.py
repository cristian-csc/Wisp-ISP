"""
Tests del registro de ONUs.

Cubre:
- Validación y normalización de serie GPON y MAC
- Series o MAC repetidas
- Historial: alta, entrega, traspaso, devolución, daño y recuperación
- No se borra una ONU que ya tuvo movimientos
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import models
from app.database import get_db
from app.onus_historial import normalizar_mac, normalizar_serie
from app.routers import onus as onus_router
from app.routers.auth import get_current_user
from tests.conftest import MOCK_USER, override_get_current_user, override_get_db


@pytest.fixture
def api():
    app = FastAPI()
    app.include_router(onus_router.router, prefix="/onus")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c


@pytest.fixture
def tecnicos(db):
    db.add(models.Usuario(id=MOCK_USER.id, nombre="Test Admin", email="admin@wisp.test", hashed_password="x", rol=models.RolUsuario.admin))
    a = models.Usuario(nombre="Rosa", email="rosa@wisp.test", hashed_password="x", rol=models.RolUsuario.tecnico)
    b = models.Usuario(nombre="Luis", email="luis@wisp.test", hashed_password="x", rol=models.RolUsuario.tecnico)
    db.add_all([a, b])
    db.commit()
    return a.id, b.id


@pytest.mark.parametrize("entrada,esperado", [
    ("asky10790001", "ASKY10790001"),
    (" ASKY-1079 0001 ", "ASKY10790001"),
    ("41534B5910790001", "ASKY10790001"),
    ("HWTC1F2E3D4C", "HWTC1F2E3D4C"),
])
def test_serie_valida(entrada, esperado):
    assert normalizar_serie(entrada) == esperado


@pytest.mark.parametrize("entrada", ["", "ASKY1079", "AS1210790001", "ASKY1079000Z", "12345"])
def test_serie_invalida(entrada):
    with pytest.raises(ValueError):
        normalizar_serie(entrada)


@pytest.mark.parametrize("entrada,esperado", [
    ("a4b1c23d4e5f", "A4:B1:C2:3D:4E:5F"),
    ("A4-B1-C2-3D-4E-5F", "A4:B1:C2:3D:4E:5F"),
    ("a4b1.c23d.4e5f", "A4:B1:C2:3D:4E:5F"),
    ("", None),
])
def test_mac_valida(entrada, esperado):
    assert normalizar_mac(entrada) == esperado


@pytest.mark.parametrize("entrada", ["A4:B1:C2", "ZZ:B1:C2:3D:4E:5F", "00:00:00:00:00:00", "01:00:5E:00:00:01"])
def test_mac_invalida(entrada):
    with pytest.raises(ValueError):
        normalizar_mac(entrada)


def test_alta_normaliza_detecta_marca_y_anota(api, tecnicos):
    r = api.post("/onus", json={"numero_serie": "asky10790001", "mac": "a4b1c23d4e5f"})
    assert r.status_code == 201, r.json()
    onu = r.json()
    assert onu["numero_serie"] == "ASKY10790001" and onu["mac"] == "A4:B1:C2:3D:4E:5F" and onu["marca"] == "Askey"
    hist = api.get(f"/onus/{onu['id']}/historial").json()
    assert [h["tipo"] for h in hist] == ["alta"]
    assert hist[0]["registrado_por"]["nombre"] == "Test Admin"


def test_no_repite_serie_ni_mac(api, tecnicos):
    api.post("/onus", json={"numero_serie": "ASKY10790001", "mac": "A4:B1:C2:3D:4E:5F"})
    assert api.post("/onus", json={"numero_serie": "asky10790001"}).status_code == 400
    r = api.post("/onus", json={"numero_serie": "ASKY10790002", "mac": "a4-b1-c2-3d-4e-5f"})
    assert r.status_code == 400 and "ASKY10790001" in r.json()["detail"]
    assert api.post("/onus", json={"numero_serie": "nada"}).status_code == 422


def test_validar_en_vivo(api, tecnicos):
    api.post("/onus", json={"numero_serie": "ASKY10790001"})
    r = api.get("/onus/validar", params={"numero_serie": "asky10790001", "mac": "123"}).json()
    assert "ya está registrada" in r["errores"]["numero_serie"]
    assert "12 caracteres" in r["errores"]["mac"]
    r = api.get("/onus/validar", params={"numero_serie": "zteg0000abcd", "mac": "a4b1c23d4e5f"}).json()
    assert r["errores"] == {} and r["numero_serie"] == "ZTEG0000ABCD" and r["marca"] == "ZTE" and r["mac"] == "A4:B1:C2:3D:4E:5F"


def test_recorrido_completo_queda_en_el_historial(api, tecnicos):
    rosa, luis = tecnicos
    onu = api.post("/onus", json={"numero_serie": "ASKY10790001"}).json()
    assert api.post(f"/onus/{onu['id']}/asignar", json={"tecnico_id": rosa}).json()["tecnico"]["nombre"] == "Rosa"
    r = api.post(f"/onus/{onu['id']}/asignar", json={"tecnico_id": luis})
    assert r.status_code == 200 and r.json()["tecnico"]["nombre"] == "Luis"
    assert api.post(f"/onus/{onu['id']}/asignar", json={"tecnico_id": luis}).status_code == 400
    assert api.post(f"/onus/{onu['id']}/marcar", json={"estado": "danado", "nota": "No enciende"}).status_code == 200
    assert api.post(f"/onus/{onu['id']}/marcar", json={"estado": "en_almacen"}).json()["tecnico"] is None
    hist = api.get(f"/onus/{onu['id']}/historial").json()
    assert [h["tipo"] for h in hist] == ["recuperada", "danada", "traspaso", "asignacion", "alta"]
    assert "Rosa a Luis" in hist[2]["nota"]
    assert hist[1]["nota"] == "No enciende" and hist[1]["persona"]["nombre"] == "Luis"


def test_corregir_mac_queda_en_el_historial(api, tecnicos):
    a = api.post("/onus", json={"numero_serie": "ASKY10790001", "mac": "A4:B1:C2:3D:4E:5F"}).json()
    b = api.post("/onus", json={"numero_serie": "ASKY10790002"}).json()
    # La MAC de otra ONU no se puede repetir.
    assert api.put(f"/onus/{b['id']}", json={"mac": "a4b1c23d4e5f"}).status_code == 400
    assert api.put(f"/onus/{b['id']}", json={"mac": "123"}).status_code == 422
    r = api.put(f"/onus/{b['id']}", json={"mac": "a4b1c23d4e60", "marca": "Askey", "nota": "Etiqueta de la caja"})
    assert r.status_code == 200 and r.json()["mac"] == "A4:B1:C2:3D:4E:60"
    hist = api.get(f"/onus/{b['id']}/historial").json()
    assert hist[0]["tipo"] == "correccion"
    assert "MAC: vacía → A4:B1:C2:3D:4E:60" in hist[0]["nota"] and "Etiqueta de la caja" in hist[0]["nota"]
    # Sin cambios no se anota nada.
    assert api.put(f"/onus/{b['id']}", json={"mac": "A4:B1:C2:3D:4E:60", "marca": "Askey"}).status_code == 400
    # La propia MAC no cuenta como repetida.
    assert api.put(f"/onus/{a['id']}", json={"mac": "A4:B1:C2:3D:4E:5F", "marca": "Otra"}).status_code == 200


def test_no_se_borra_con_movimientos(api, tecnicos):
    rosa, _ = tecnicos
    limpia = api.post("/onus", json={"numero_serie": "ASKY10790001"}).json()
    usada = api.post("/onus", json={"numero_serie": "ASKY10790002"}).json()
    api.post(f"/onus/{usada['id']}/asignar", json={"tecnico_id": rosa})
    assert api.delete(f"/onus/{limpia['id']}").status_code == 200
    assert api.delete(f"/onus/{usada['id']}").status_code == 400
