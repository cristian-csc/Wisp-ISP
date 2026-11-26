"""Un cliente anulado no sigue entrando a la app con el token que ya tenia.

Hallazgo B-2 de AUDITORIA_SEGURIDAD.md. El login del cliente si rechaza a un
cliente `anulado` (auth.py:438), pero `get_current_cliente` —la dependencia
que valida la sesion en cada peticion de la app movil— solo comprobaba que el
token fuera valido y que el cliente existiera.

Con ACCESS_TOKEN_EXPIRE_MINUTES en 480, un cliente al que se le da de baja
sigue viendo su ficha, su direccion, su telefono y su historial de pagos
durante ocho horas mas. Y si la baja fue por un conflicto —un impago, una
suplantacion, un retiro de equipo—, ocho horas es justo el rato que importa.
"""
import pytest
from passlib.context import CryptContext

from app import models
from app.routers import auth as auth_router
from tests.conftest import crear_cliente, crear_plan, crear_zona

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

DNI = "70555666"
CLAVE = "LaClaveDelCliente2026"


def cabecera_de(cliente) -> dict:
    token = auth_router.create_access_token(
        {"sub": DNI, "role": "cliente", "cliente_id": cliente.id}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cliente(db):
    zona, plan = crear_zona(db), crear_plan(db)
    return crear_cliente(
        db, zona, plan, dni=DNI, telefono="951222333", pin_app=pwd.hash(CLAVE),
    )


RUTAS = ["/api/cliente/me", "/api/cliente/mis-pagos"]


@pytest.mark.parametrize("ruta", RUTAS)
def test_un_cliente_activo_entra(client_cliente_app, cliente, ruta):
    """Que el arreglo no deje fuera a quien si debe entrar."""
    r = client_cliente_app.get(ruta, headers=cabecera_de(cliente))
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("ruta", RUTAS)
def test_un_cliente_anulado_no_entra_con_el_token_viejo(
    client_cliente_app, cliente, db, ruta,
):
    """El caso del hallazgo: el token sigue siendo valido, la cuenta no."""
    cabecera = cabecera_de(cliente)
    assert client_cliente_app.get(ruta, headers=cabecera).status_code == 200

    cliente.estado = models.EstadoCliente.anulado
    db.commit()

    r = client_cliente_app.get(ruta, headers=cabecera)
    assert r.status_code == 403, (
        f"un cliente anulado sigue entrando a {ruta}: {r.status_code}"
    )


def test_un_cliente_anulado_tampoco_cambia_su_contrasena(
    client_cliente_app, cliente, db,
):
    cabecera = cabecera_de(cliente)
    cliente.estado = models.EstadoCliente.anulado
    db.commit()

    r = client_cliente_app.post(
        "/api/cliente/cambiar-pin",
        json={"pin_actual": CLAVE, "pin_nuevo": "OtraClaveDistinta2026"},
        headers=cabecera,
    )
    assert r.status_code == 403


@pytest.mark.parametrize("estado", ["suspendido", "pausado"])
def test_un_cliente_suspendido_o_pausado_si_entra(
    client_cliente_app, cliente, db, estado,
):
    """Solo cierra `anulado`, y es a proposito.

    Un cliente cortado por impago o en pausa tiene que poder entrar: es
    justamente cuando necesita ver lo que debe y como pagarlo. El login de
    auth.py hace la misma distincion.
    """
    cliente.estado = models.EstadoCliente(estado)
    db.commit()

    r = client_cliente_app.get("/api/cliente/me", headers=cabecera_de(cliente))
    assert r.status_code == 200, r.text
