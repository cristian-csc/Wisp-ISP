"""Credenciales que no deben salir del servidor.

Hallazgo A-3 de AUDITORIA_SEGURIDAD.md. `ClienteOut` llevaba dos campos que
no tenia por que llevar:

- `password_pppoe`, la contrasena PPPoE del cliente, en claro.
- `pin_app`, el hash bcrypt de la contrasena de su app movil.

Y `GET /api/clientes` esta en LECTURAS con el conjunto `_LEER_CLIENTES`, que
incluye los modulos moviles de tecnicos y vendedoras (acceso.py:156). Es
decir: todo tecnico y toda vendedora recibia, en la lista de clientes de su
zona, la contrasena PPPoE en claro y el hash del PIN de cada cliente.

Con usuario y contrasena PPPoE, un tecnico que ya no trabaja en la empresa
puede conectarse como ese cliente. Y el hash bcrypt se puede romper fuera de
linea con calma.

La prueba se hace en dos niveles a proposito: sobre el esquema, para que
volver a anadir el campo falle aqui mismo, y sobre la respuesta real de los
endpoints, porque el esquema no es el unico camino —hay sitios que hacen
model_dump() y luego anaden claves a mano.
"""
import pytest

from app import models, schemas
from tests.conftest import crear_cliente, crear_plan, crear_zona

PROHIBIDOS = ("password_pppoe", "pin_app")


@pytest.fixture
def cliente(db):
    zona, plan = crear_zona(db), crear_plan(db)
    return crear_cliente(
        db, zona, plan, dni="70999888", telefono="951000111",
        pin_app="$2b$12$unhashfalsoperoconpinta",
    )


class TestElEsquema:

    @pytest.mark.parametrize("campo", PROHIBIDOS)
    def test_cliente_out_no_declara_el_campo(self, campo):
        assert campo not in schemas.ClienteOut.model_fields, (
            f"ClienteOut volvio a exponer {campo}"
        )

    def test_el_modelo_si_lo_sigue_teniendo(self):
        """El dato no desaparece: deja de salir por el API, nada mas.

        El backend lo necesita para configurar el router del cliente
        (clientes.py arma los comandos de /ppp secret con el).
        """
        assert hasattr(models.Cliente, "password_pppoe")
        assert hasattr(models.Cliente, "pin_app")


class TestLasRespuestas:

    @pytest.mark.parametrize("campo", PROHIBIDOS)
    def test_la_lista_de_clientes_no_los_trae(self, client_clientes, cliente, campo):
        r = client_clientes.get("/api/clientes")
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert items, "la lista vino vacia: la prueba no esta midiendo nada"
        for item in items:
            assert campo not in item, f"GET /api/clientes sigue devolviendo {campo}"

    @pytest.mark.parametrize("campo", PROHIBIDOS)
    def test_la_ficha_del_cliente_no_los_trae(self, client_clientes, cliente, campo):
        r = client_clientes.get(f"/api/clientes/{cliente.id}")
        assert r.status_code == 200, r.text
        assert campo not in r.json(), (
            f"GET /api/clientes/{{id}} sigue devolviendo {campo}"
        )

    def test_el_hash_del_pin_no_aparece_en_ninguna_parte_de_la_ficha(
        self, client_clientes, cliente,
    ):
        """No basta con que no este la clave: el valor tampoco debe colarse
        bajo otro nombre."""
        r = client_clientes.get(f"/api/clientes/{cliente.id}")
        assert "$2b$12$unhashfalsoperoconpinta" not in r.text
