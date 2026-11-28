"""Registro GPS enriquecido de las jornadas: precisión, hora real de captura,
compatibilidad con APK viejo, sincronización sin duplicados y orden por la hora
de captura (no la de recepción).

Lógica relacionada: app/routers/jornadas.py (ping_ubicacion, recorrido) y el
procesamiento del panel en frontend/src/lib/recorrido.ts.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.routers.auth import get_current_user
from app.routers import jornadas as jornadas_router
from app import models
from tests.conftest import override_get_db, crear_usuario


def _app(usuario: models.Usuario) -> TestClient:
    app = FastAPI()
    app.include_router(jornadas_router.router, prefix="/jornadas")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: usuario
    return TestClient(app)


def _vendedor(db) -> models.Usuario:
    return crear_usuario(db, "vend@wisp.test", models.RolUsuario.vendedor_campo)


def _admin(db) -> models.Usuario:
    return crear_usuario(db, "admin@wisp.test", models.RolUsuario.admin)


def _iniciar(cli: TestClient) -> int:
    r = cli.post("/jornadas/iniciar", json={"lat": -15.84, "lng": -70.02})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_ping_guarda_precision_y_captura(db):
    cli = _app(_vendedor(db))
    jid = _iniciar(cli)
    captura = "2026-11-28T14:30:00+00:00"
    r = cli.post("/jornadas/ping", json={
        "lat": -15.841, "lng": -70.021, "precision_m": 8.5, "capturado_en": captura,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["precision_m"] == 8.5
    assert body["capturado_en"] is not None

    # Se ve en el recorrido que lee el admin.
    admin_cli = _app(_admin(db))
    rec = admin_cli.get(f"/jornadas/{jid}/recorrido")
    assert rec.status_code == 200, rec.text
    puntos = rec.json()["puntos"]
    assert len(puntos) == 1
    assert puntos[0]["precision_m"] == 8.5


def test_ping_sin_campos_es_compatible(db):
    """Un APK viejo manda solo lat/lng: el punto se guarda igual, sin precisión
    ni hora de captura."""
    cli = _app(_vendedor(db))
    _iniciar(cli)
    r = cli.post("/jornadas/ping", json={"lat": -15.841, "lng": -70.021})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["precision_m"] is None
    assert body["capturado_en"] is None


def test_ping_dedupe_por_capturado_en(db):
    """Reenviar un punto ya guardado (misma hora real de captura) no lo
    duplica — es la sincronización tras recuperar la señal."""
    cli = _app(_vendedor(db))
    jid = _iniciar(cli)
    captura = "2026-11-28T15:00:00+00:00"
    p1 = {"lat": -15.842, "lng": -70.022, "precision_m": 10, "capturado_en": captura}
    cli.post("/jornadas/ping", json=p1)
    cli.post("/jornadas/ping", json=p1)  # reintento idéntico

    admin_cli = _app(_admin(db))
    puntos = admin_cli.get(f"/jornadas/{jid}/recorrido").json()["puntos"]
    assert len(puntos) == 1


def test_recorrido_ordena_por_hora_de_captura(db):
    """Los puntos que llegan desordenados (uno sincronizado tarde) se devuelven
    en el orden real de captura, no en el de recepción."""
    cli = _app(_vendedor(db))
    jid = _iniciar(cli)
    # Se envían a propósito fuera de orden: el del medio llega primero.
    cli.post("/jornadas/ping", json={"lat": -15.8420, "lng": -70.0220, "capturado_en": "2026-11-28T16:02:00+00:00"})
    cli.post("/jornadas/ping", json={"lat": -15.8410, "lng": -70.0210, "capturado_en": "2026-11-28T16:00:00+00:00"})
    cli.post("/jornadas/ping", json={"lat": -15.8430, "lng": -70.0230, "capturado_en": "2026-11-28T16:04:00+00:00"})

    admin_cli = _app(_admin(db))
    puntos = admin_cli.get(f"/jornadas/{jid}/recorrido").json()["puntos"]
    capturas = [p["capturado_en"] for p in puntos]
    assert capturas == sorted(capturas), capturas
    # El primero debe ser el de las 16:00 (lat -15.8410).
    assert abs(puntos[0]["lat"] - (-15.8410)) < 1e-9
