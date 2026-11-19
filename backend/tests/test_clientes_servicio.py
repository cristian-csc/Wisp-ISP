"""
Tests del ciclo de servicio de un cliente: cortar, reactivar, pausar, aprobar
e instalar.

El MikroTik y WhatsApp se reemplazan por dobles que anotan lo que se les pide:
así se comprueba qué comando se mandaría al router y en qué orden, sin tocar
ningún equipo real.
"""
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import models
from app.database import get_db
from app.facturacion import primer_vencimiento
from app.routers import clientes as clientes_router
from app.routers.auth import get_current_user
from tests.conftest import MOCK_USER, crear_cliente, crear_plan, crear_zona, override_get_current_user, override_get_db


@pytest.fixture
def externos(monkeypatch):
    """Lo que se le pidió al router y a WhatsApp, en orden."""
    llamadas = []
    monkeypatch.setattr(clientes_router, "_wa_send", lambda tel, msg: llamadas.append(("whatsapp", tel, msg)))
    monkeypatch.setattr(clientes_router, "_mikrotik_exec", lambda host, cmds: llamadas.append(("mikrotik", host, cmds)) or {"ok": True})
    monkeypatch.setattr(clientes_router, "_crear_secreto_pppoe", lambda db, c: llamadas.append(("secreto", c.usuario_pppoe, None)) or {"ok": True})
    return llamadas


@pytest.fixture
def api(externos):
    app = FastAPI()
    app.include_router(clientes_router.router, prefix="/clientes")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c


@pytest.fixture
def base(db):
    db.add(models.Usuario(id=MOCK_USER.id, nombre="Test Admin", email="admin@wisp.test", hashed_password="x", rol=models.RolUsuario.admin))
    db.commit()
    zona = crear_zona(db)
    plan = crear_plan(db)
    return db, zona, plan


def _historial(db, cliente_id):
    return db.query(models.Historial).filter(models.Historial.cliente_id == cliente_id).order_by(models.Historial.id).all()


# ── Cortar ───────────────────────────────────────────────────────────────────

def test_cortar_suspende_avisa_y_luego_corta_en_el_router(api, base, externos):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="activo")
    c.telefono = "951000111"
    db.commit()
    r = api.post(f"/clientes/{c.id}/cortar")
    assert r.status_code == 200 and r.json()["estado"] == "suspendido"
    db.refresh(c)
    assert c.estado == models.EstadoCliente.suspendido
    assert _historial(db, c.id)[-1].tipo == models.TipoHistorial.corte
    # WhatsApp primero (el cliente aún tiene internet para leerlo), router después.
    assert [l[0] for l in externos] == ["whatsapp", "mikrotik"]
    assert any('/ppp active remove [find name="test_user"]' in cmd for cmd in externos[1][2])


def test_cortar_con_ip_fija_la_mete_en_la_lista_de_corte(api, base, externos):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan)
    c.ip_estatica = "10.20.0.15"
    db.commit()
    api.post(f"/clientes/{c.id}/cortar")
    cmds = externos[-1][2]
    assert any("address-list add" in x and "address=10.20.0.15" in x for x in cmds)


def test_no_se_corta_un_cliente_satelital(api, base, externos):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan)
    c.tipo_conexion = models.TipoConexion.satelital
    db.commit()
    assert api.post(f"/clientes/{c.id}/cortar").status_code == 400
    db.refresh(c)
    assert c.estado == models.EstadoCliente.activo and externos == []


def test_cortar_un_cliente_que_no_existe(api, base):
    assert api.post("/clientes/99999/cortar").status_code == 404


# ── Reactivar ────────────────────────────────────────────────────────────────

def test_reactivar_no_perdona_la_deuda(api, base, externos):
    db, zona, plan = base
    vencida = date.today() - timedelta(days=10)
    c = crear_cliente(db, zona, plan, estado="suspendido", fecha_vencimiento=vencida)
    c.ip_estatica = "10.20.0.16"
    db.commit()
    r = api.post(f"/clientes/{c.id}/reactivar")
    assert r.status_code == 200
    db.refresh(c)
    assert c.estado == models.EstadoCliente.activo
    assert c.fecha_vencimiento == vencida, "Reactivar no debe mover la fecha de pago"
    assert "sigue con un mes pendiente" in _historial(db, c.id)[-1].descripcion
    assert any("address-list remove" in x and "10.20.0.16" in x for x in externos[0][2])


def test_reactivar_al_dia_no_anota_deuda(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="suspendido", fecha_vencimiento=date.today() + timedelta(days=20))
    api.post(f"/clientes/{c.id}/reactivar")
    assert "pendiente" not in _historial(db, c.id)[-1].descripcion


def test_reactivar_sin_vencimiento_le_pone_uno(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="suspendido", fecha_vencimiento=None)
    api.post(f"/clientes/{c.id}/reactivar")
    db.refresh(c)
    assert c.fecha_vencimiento == date.today() + timedelta(days=30)


# ── Pausar ───────────────────────────────────────────────────────────────────

def test_pausar_menos_de_un_mes_se_rechaza(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan)
    assert api.post(f"/clientes/{c.id}/pausar", json={"meses": 0}).status_code == 400


def test_pausar_y_reactivar_limpia_la_pausa(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan)
    r = api.post(f"/clientes/{c.id}/pausar", json={"meses": 2})
    assert r.status_code == 200 and r.json()["estado"] == "pausado"
    db.refresh(c)
    assert c.estado == models.EstadoCliente.pausado and c.pausa_hasta is not None
    api.post(f"/clientes/{c.id}/reactivar")
    db.refresh(c)
    assert c.estado == models.EstadoCliente.activo and c.pausa_hasta is None


# ── Aprobar ──────────────────────────────────────────────────────────────────

def test_aprobar_un_pendiente(api, base, externos):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="pendiente_aprobacion")
    r = api.post(f"/clientes/{c.id}/aprobar")
    assert r.status_code == 200, r.json()
    db.refresh(c)
    assert c.estado == models.EstadoCliente.aprobado and c.aprobado_por_id == MOCK_USER.id


def test_no_se_aprueba_dos_veces(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="activo")
    assert api.post(f"/clientes/{c.id}/aprobar").status_code == 400


# ── Instalar ─────────────────────────────────────────────────────────────────

def _aprobado(db, zona, plan, tipo=models.TipoConexion.inalambrico):
    c = crear_cliente(db, zona, plan, estado="aprobado", fecha_vencimiento=None)
    c.tipo_conexion = tipo
    db.commit()
    return c


def test_instalar_exige_que_este_aprobado(api, base):
    db, zona, plan = base
    c = crear_cliente(db, zona, plan, estado="pendiente_aprobacion")
    assert api.post(f"/clientes/{c.id}/instalar", json={}).status_code == 400


@pytest.mark.parametrize("dias,esperado", [(-1, 400), (8, 400), (7, 200), (0, 200)])
def test_fecha_de_activacion_limites(api, base, dias, esperado):
    db, zona, plan = base
    c = _aprobado(db, zona, plan)
    fecha = (date.today() - timedelta(days=dias)).isoformat()
    assert api.post(f"/clientes/{c.id}/instalar", json={"fecha_activacion": fecha}).status_code == esperado


def test_instalar_inalambrico_activa_y_fija_el_dia_de_pago(api, base):
    db, zona, plan = base
    c = _aprobado(db, zona, plan)
    assert api.post(f"/clientes/{c.id}/instalar", json={}).status_code == 200
    db.refresh(c)
    assert c.estado == models.EstadoCliente.activo
    assert c.fecha_vencimiento == primer_vencimiento(date.today())


def test_fibra_nueva_sin_planta_se_rechaza(api, base):
    db, zona, plan = base
    c = _aprobado(db, zona, plan, models.TipoConexion.fibra_optica)
    r = api.post(f"/clientes/{c.id}/instalar", json={})
    assert r.status_code == 400 and "caja NAP, borne y ONU" in r.json()["detail"]


def test_fibra_completa_ocupa_el_borne_e_instala_la_onu(api, base):
    db, zona, plan = base
    c = _aprobado(db, zona, plan, models.TipoConexion.fibra_optica)
    mufa = models.Mufa(codigo="MF-T", zona_id=zona.id)
    db.add(mufa)
    db.flush()
    caja = models.CajaNap(codigo="NAP-T", zona_id=zona.id, mufa_id=mufa.id, capacidad_bornes=8)
    db.add(caja)
    db.flush()
    borne = models.Borne(caja_nap_id=caja.id, numero=3, estado=models.EstadoBorne.libre)
    onu = models.Onu(numero_serie="ASKY10790001", estado=models.EstadoOnu.asignado_tecnico, tecnico_id=MOCK_USER.id)
    db.add_all([borne, onu])
    db.commit()
    r = api.post(f"/clientes/{c.id}/instalar", json={"caja_nap_id": caja.id, "numero_borne": 3, "onu_id": onu.id, "codigo_precinto": "PR-1"})
    assert r.status_code == 200, r.json()
    db.refresh(borne)
    db.refresh(onu)
    assert borne.estado == models.EstadoBorne.ocupado and borne.cliente_id == c.id and borne.codigo_precinto == "PR-1"
    assert onu.estado == models.EstadoOnu.instalado and onu.cliente_id == c.id
    mov = db.query(models.OnuMovimiento).filter(models.OnuMovimiento.onu_id == onu.id).all()
    assert [m.tipo for m in mov] == ["instalacion"] and mov[0].cliente_id == c.id
    # El mismo borne ya no se puede volver a usar.
    otro = models.Cliente(
        nombre="Otro Cliente", usuario_pppoe="otro_user", password_pppoe="x", zona_id=zona.id, plan_id=plan.id,
        estado=models.EstadoCliente.aprobado, tipo_conexion=models.TipoConexion.fibra_optica,
        estado_equipo=models.EstadoEquipo.sin_equipo,
    )
    db.add(otro)
    db.commit()
    r = api.post(f"/clientes/{otro.id}/instalar", json={"caja_nap_id": caja.id, "numero_borne": 3, "onu_id": onu.id})
    assert r.status_code == 400
