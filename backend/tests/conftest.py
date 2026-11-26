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
from app.routers import auth as auth_router
from app.routers import pagos as pagos_router
from app.routers import gastos as gastos_router
from app.routers import whatsapp as whatsapp_router
from app.routers import clientes as clientes_router
from app.routers import cliente_app as cliente_app_router
from app import acceso, mensajeria, models

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
#
# `rol` tiene que ser el miembro del enum y NO la cadena "admin". Este objeto
# nunca pasa por un flush de SQLAlchemy, así que el atributo se queda tal como
# se escribe aquí: con una cadena, `usuario.rol.value` revienta con
#   AttributeError: 'str' object has no attribute 'value'
# Antes daba igual, porque nadie leía `.value`. Cuando se añadió el sistema de
# roles y módulos, require_roles() empezó a llamar a rol_de_la_cuenta(), que sí
# lo lee (auth.py), y las 30 pruebas de la suite pasaron a fallar de golpe —
# todas por esta línea, no por 30 problemas distintos.
MOCK_USER = models.Usuario(
    id=99,
    nombre="Test Admin",
    email="test@wisp.test",
    hashed_password="x",
    rol=models.RolUsuario.admin,
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


def make_clientes_app() -> FastAPI:
    """App con el router de clientes y la sesion simulada.

    Aqui si se sustituye get_current_user: lo que se mide no es el permiso,
    sino QUE datos salen en la respuesta.
    """
    app = FastAPI()
    app.include_router(clientes_router.router, prefix="/api/clientes")
    acceso.registrar_rutas(clientes_router.router, "/api/clientes")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return app


def make_cliente_app_app() -> FastAPI:
    """App con los endpoints de la app movil del cliente.

    No se sustituye get_current_cliente: lo que se prueba es quien conserva la
    sesion y quien la pierde.
    """
    app = FastAPI()
    app.include_router(cliente_app_router.router, prefix="/api/cliente")
    acceso.registrar_rutas(cliente_app_router.router, "/api/cliente")
    app.dependency_overrides[get_db] = override_get_db
    return app


def make_permisos_app() -> FastAPI:
    """App para probar quien puede llamar a que endpoint.

    Como en make_auth_app(), aqui NO se sustituye get_current_user: lo que se
    mide es justamente el permiso, asi que simular la sesion vaciaria la
    prueba. El prefijo es el de produccion porque acceso.py indexa las reglas
    por (metodo, ruta) y con otro prefijo no encontraria ninguna.
    """
    app = FastAPI()
    app.include_router(whatsapp_router.router, prefix="/api/whatsapp")
    # Igual que montar() en main.py. Sin esto, acceso.py no sabria que
    # /api/whatsapp/qr es esa ruta y la regla de modulo no se aplicaria: la
    # prueba de permisos pasaria por el motivo equivocado.
    acceso.registrar_rutas(whatsapp_router.router, "/api/whatsapp")
    app.dependency_overrides[get_db] = override_get_db
    return app


def make_auth_app() -> FastAPI:
    """App para probar la autenticación de verdad.

    Aquí NO se sustituye get_current_user: lo que se prueba es justamente
    quién entra y quién no, así que simular la sesión haría la prueba inútil.
    El prefijo es el de producción para que las rutas sean las mismas.
    """
    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api/auth")
    acceso.registrar_rutas(auth_router.router, "/api/auth")
    app.dependency_overrides[get_db] = override_get_db
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


@pytest.fixture
def client_auth():
    """TestClient con la autenticación REAL, para probar quién entra."""
    app = make_auth_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_clientes():
    """TestClient del router de clientes, con la sesion simulada."""
    app = make_clientes_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_cliente_app():
    """TestClient de la app movil del cliente, con la sesion REAL."""
    app = make_cliente_app_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_permisos():
    """TestClient con los permisos REALES, para probar quien entra."""
    app = make_permisos_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_freno():
    """Vacía el freno de fuerza bruta entre pruebas.

    Sin esto, una prueba que agota los intentos deja bloqueada a la siguiente
    y el fallo aparece en un sitio que no tiene nada que ver. Es autouse
    porque el día que alguien añada una prueba de login y no se acuerde de
    pedir la fixture, el error sería dificilísimo de entender.

    Desde el 2026-11-26 el freno vive en la tabla freno_login y no en dos
    diccionarios de módulo (hallazgo B-6), así que lo que hay que vaciar es la
    tabla. reset_db ya recrea el esquema entre pruebas; esto cubre además el
    caso de varias peticiones dentro de una misma prueba.
    """
    yield
    sesion = TestingSessionLocal()
    try:
        sesion.query(models.FrenoLogin).delete()
        sesion.commit()
    except Exception:
        # La tabla puede no existir todavía si la prueba fallo al montar el
        # esquema; no es trabajo de esta fixture quejarse de eso.
        sesion.rollback()
    finally:
        sesion.close()


class BotFalso:
    """Sustituye al bot de WhatsApp y se queda con lo que se le manda.

    Hace dos cosas a la vez: evita que las pruebas llamen por red a un bot
    que no existe, y deja leer el código que se envió — que es la única forma
    de probar el canje sin saltarse el camino real.
    """

    def __init__(self):
        self.enviados: list[tuple[str, str]] = []
        self.responder_ok = True

    def enviar_texto(self, phone, mensaje, timeout=15):
        self.enviados.append((phone, mensaje))
        return (True, "enviado") if self.responder_ok else (False, "bot caído")

    @property
    def ultimo_codigo(self) -> str:
        """Los 6 dígitos del último mensaje enviado."""
        import re
        assert self.enviados, "no se envió ningún mensaje"
        hallados = re.findall(r"\b(\d{6})\b", self.enviados[-1][1])
        assert hallados, f"no hay un código de 6 dígitos en: {self.enviados[-1][1]!r}"
        return hallados[-1]


@pytest.fixture
def bot(monkeypatch) -> BotFalso:
    falso = BotFalso()
    # Se parchea donde se USA (app.routers.auth lo llama como
    # mensajeria.enviar_texto), no donde se define.
    monkeypatch.setattr(mensajeria, "enviar_texto", falso.enviar_texto)
    return falso


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
    # Los cuatro de abajo son para las pruebas de autenticación del cliente.
    # Por defecto van vacíos, que es como estaba antes de añadirlos: así las
    # pruebas de pagos y gastos no cambian de comportamiento.
    dni: str | None = None,
    telefono: str | None = None,
    pin_app: str | None = None,
    usuario_pppoe: str = "test_user",
    linea: int = 1,
) -> models.Cliente:
    cliente = models.Cliente(
        nombre="Cliente Test",
        dni=dni,
        telefono=telefono,
        usuario_pppoe=usuario_pppoe,
        password_pppoe="test_pass",
        pin_app=pin_app,
        linea=linea,
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


# ── Helpers de seed: roles, modulos y usuarios del personal ───────────────────
# Sin filas en `roles`, rol_de_la_cuenta() devuelve None y require_roles() cae
# al camino antiguo (solo el tipo de cuenta), que es justo el que NO se quiere
# probar: la capa de modulos se saltaria sin que la prueba lo note.

def crear_rol(
    db,
    clave: str,
    perfil_base: str,
    es_superadmin: bool = False,
    modulos: tuple = (),
) -> models.Rol:
    rol = models.Rol(
        clave=clave,
        nombre=clave.title(),
        es_superadmin=es_superadmin,
        es_sistema=True,
        perfil_base=perfil_base,
    )
    db.add(rol)
    db.commit()
    db.refresh(rol)

    if modulos:
        padre = db.query(models.ModuloPadre).filter(
            models.ModuloPadre.nombre == "Pruebas",
            models.ModuloPadre.plataforma == "panel",
        ).first()
        if padre is None:
            padre = models.ModuloPadre(nombre="Pruebas", plataforma="panel")
            db.add(padre)
            db.commit()
            db.refresh(padre)

        for clave_modulo in modulos:
            modulo = db.query(models.Modulo).filter(
                models.Modulo.clave == clave_modulo
            ).first()
            if modulo is None:
                modulo = models.Modulo(
                    clave=clave_modulo,
                    nombre=clave_modulo,
                    modulo_padre_id=padre.id,
                    plataforma="panel",
                    activo=True,
                )
                db.add(modulo)
                db.commit()
                db.refresh(modulo)
            db.add(models.RolModulo(rol_id=rol.id, modulo_id=modulo.id))
        db.commit()

    return rol


def crear_usuario(db, email: str, rol: models.RolUsuario, rol_fila=None) -> models.Usuario:
    usuario = models.Usuario(
        nombre=email.split("@")[0],
        email=email,
        hashed_password="x",
        rol=rol,
        rol_id=rol_fila.id if rol_fila is not None else None,
        activo=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def cabecera_de(usuario: models.Usuario) -> dict:
    """La cabecera Authorization de una sesion real de ese usuario."""
    token = auth_router.create_access_token({"sub": usuario.email})
    return {"Authorization": f"Bearer {token}"}
