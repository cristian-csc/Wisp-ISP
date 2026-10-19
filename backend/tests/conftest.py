"""
Configuración compartida para todos los tests.
Usa SQLite en memoria — no requiere PostgreSQL ni Docker.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import date

from app.database import Base, get_db
from app.routers.auth import get_current_user
from app.routers import pagos as pagos_router
from app.routers import gastos as gastos_router
from app import models

# ── Base de datos en memoria ──────────────────────────────────────────────────

SQLITE_URL = "sqlite:///:memory:"

engine_test = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Usuario falso — evita autenticación real en todos los endpoints
MOCK_USER = models.Usuario(
    id=99,
    nombre="Test Admin",
    email="test@tuxtell.test",
    hashed_password="x",
    rol="admin",
    activo=True,
)


def override_get_current_user():
    return MOCK_USER


# ── App minimalista solo con los routers que se testean ──────────────────────
# (evita el lifespan de main.py que intentaría conectarse a PostgreSQL)

def make_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(pagos_router.router, prefix="/pagos")
    app.include_router(gastos_router.router, prefix="/gastos")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_db():
    """Recrea las tablas antes de cada test y las elimina al terminar."""
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def db():
    """Sesión de BD directa para preparar datos de prueba."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    """TestClient de FastAPI con BD en memoria y auth desactivada."""
    app = make_test_app()
    with TestClient(app) as c:
        yield c


# ── Helpers de seed ───────────────────────────────────────────────────────────

def crear_zona(db) -> models.Zona:
    zona = models.Zona(
        nombre="Zona Test",
        ip_wireguard="10.10.0.99",
        activo=True,
    )
    db.add(zona)
    db.commit()
    db.refresh(zona)
    return zona


def crear_plan(db) -> models.Plan:
    plan = models.Plan(
        codigo="PLAN-T",
        nombre="Plan Test",
        bajada_mbps=20,
        subida_mbps=5,
        precio=50.0,
        activo=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def crear_cliente(
    db,
    zona: models.Zona,
    plan: models.Plan,
    estado: str = "activo",
    fecha_instalacion: date = date(2026, 1, 15),
    fecha_vencimiento: date | None = date(2026, 7, 15),
) -> models.Cliente:
    cliente = models.Cliente(
        nombre="Cliente Test",
        usuario_pppoe="test_user",
        password_pppoe="test_pass",
        zona_id=zona.id,
        plan_id=plan.id,
        fecha_instalacion=fecha_instalacion,
        fecha_vencimiento=fecha_vencimiento,
        estado=models.EstadoCliente(estado),
        tipo_conexion=models.TipoConexion.inalambrico,
        estado_equipo=models.EstadoEquipo.sin_equipo,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente
