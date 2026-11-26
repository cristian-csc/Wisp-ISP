"""El freno de fuerza bruta vive en la base, no en la memoria del proceso.

Hallazgo B-6 de AUDITORIA_SEGURIDAD.md. Los contadores eran dos diccionarios
de modulo (`_intentos` y `_bloqueados` en auth.py), con tres frenos colgando
de ellos: el de IP + usuario, el de cuenta sola, y el de solicitudes de codigo
de acceso. Eso tenia dos consecuencias:

1. Un reinicio del backend —o un despliegue— ponia todos los contadores a
   cero. El tercero es el unico freno de la via de recuperacion de cuenta, asi
   que un reinicio bien cronometrado dejaba pedir codigos en serie al WhatsApp
   de un cliente.
2. Con mas de un trabajador de uvicorn el conteo se reparte entre procesos y
   el tope real pasa a ser `tope x procesos`. Era una de las dos cosas que
   impedian subir --workers, que es lo que haria falta para que la API no
   dependa de un solo proceso (R-1 de la revision de produccion).

Lo que sigue fija que la unica fuente de verdad es la tabla `freno_login`.
"""
import time

import pytest
from passlib.context import CryptContext

from app import models
from app.routers import auth as auth_router
from tests.conftest import crear_cliente, crear_plan, crear_zona

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

DNI = "70333444"
TELEFONO = "951777888"
CLAVE_BUENA = "UnaClaveQueSirve2026"

LOGIN = "/api/auth/cliente/login"
SOLICITAR = "/api/auth/cliente/solicitar-codigo"


@pytest.fixture
def cliente(db):
    """Un cliente que YA eligio su contrasena.

    Tiene que tenerla: un cliente sin `pin_app` recibe 409 y eso no cuenta
    como intento fallido a proposito (no hay nada que adivinar todavia), asi
    que con un cliente sin contrasena el freno no se activa nunca y estas
    pruebas no medirian nada.
    """
    zona, plan = crear_zona(db), crear_plan(db)
    return crear_cliente(
        db, zona, plan, dni=DNI, telefono=TELEFONO, pin_app=pwd.hash(CLAVE_BUENA),
    )


def _agotar_intentos(client_auth) -> int:
    """Aporrea el login hasta que frena. Devuelve cuantos intentos hizo."""
    tope = auth_router.settings.LOGIN_MAX_INTENTOS
    for i in range(tope + 3):
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": f"mal-{i}"})
        if r.status_code == 429:
            return i + 1
    raise AssertionError("el freno nunca salto")


class TestLaBaseEsLaUnicaFuente:

    def test_los_fallos_quedan_anotados_en_la_tabla(self, client_auth, cliente, db):
        client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})

        filas = db.query(models.FrenoLogin).all()
        assert filas, "un fallo de login no dejo ninguna fila en freno_login"
        assert any(f.momentos for f in filas), "la fila no guardo el momento del fallo"

    def test_el_bloqueo_queda_anotado_en_la_tabla(self, client_auth, cliente, db):
        _agotar_intentos(client_auth)

        bloqueadas = [
            f for f in db.query(models.FrenoLogin).all()
            if f.bloqueado_hasta and f.bloqueado_hasta > time.time()
        ]
        assert bloqueadas, "se bloqueo el login pero no hay bloqueo en la base"

    def test_borrar_la_fila_levanta_el_bloqueo(self, client_auth, cliente, db):
        """La prueba que distingue memoria de base.

        Si el bloqueo siguiera viviendo en un diccionario del proceso, vaciar
        la tabla no cambiaria nada y esta prueba fallaria.
        """
        _agotar_intentos(client_auth)
        assert client_auth.post(
            LOGIN, json={"usuario": DNI, "pin": "mal"},
        ).status_code == 429

        db.query(models.FrenoLogin).delete()
        db.commit()

        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
        assert r.status_code == 401, (
            "la tabla esta vacia y el freno sigue bloqueando: queda estado en memoria"
        )

    def test_el_bloqueo_sobrevive_al_reinicio_del_proceso(
        self, client_auth, cliente, db,
    ):
        """Un reinicio no debe regalar intentos nuevos.

        Se simula de la forma mas dura que admite una prueba: se borra todo
        estado de modulo que pudiera quedar en auth.py. Si el freno dependiera
        de el, aqui volveria a dejar entrar.
        """
        _agotar_intentos(client_auth)

        for nombre in ("_intentos", "_bloqueados"):
            residuo = getattr(auth_router, nombre, None)
            if residuo is not None:
                residuo.clear()

        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
        assert r.status_code == 429, (
            "tras el reinicio el freno se olvido del bloqueo"
        )

    def test_el_bloqueo_caduca_cuando_toca(self, client_auth, cliente, db):
        _agotar_intentos(client_auth)

        # Mover el vencimiento al pasado es lo mismo que esperar el castigo,
        # sin tener que dormir 15 minutos en una prueba.
        for fila in db.query(models.FrenoLogin).all():
            if fila.bloqueado_hasta:
                fila.bloqueado_hasta = time.time() - 1
        db.commit()

        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
        assert r.status_code == 401, "el castigo no caduco"

    def test_entrar_bien_borra_la_fila(self, client_auth, cliente, db):
        for _ in range(3):
            client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
        assert db.query(models.FrenoLogin).count() > 0

        assert client_auth.post(
            LOGIN, json={"usuario": DNI, "pin": CLAVE_BUENA},
        ).status_code == 200
        assert db.query(models.FrenoLogin).count() == 0, (
            "entro bien y los fallos siguen contados"
        )


class TestElFrenoDeCodigosTambien:

    def test_las_solicitudes_de_codigo_se_cuentan_en_la_base(
        self, client_auth, bot, cliente, db,
    ):
        """El tercer freno, el que protege la via de recuperacion de cuenta."""
        client_auth.post(SOLICITAR, json={"usuario": DNI})

        assert db.query(models.FrenoLogin).count() > 0, (
            "pedir un codigo no dejo rastro en freno_login"
        )

    def test_un_reinicio_no_regala_solicitudes_de_codigo(
        self, client_auth, bot, cliente, db,
    ):
        tope = auth_router.settings.LOGIN_MAX_INTENTOS
        codigos = [
            client_auth.post(SOLICITAR, json={"usuario": DNI}).status_code
            for _ in range(tope + 3)
        ]
        assert 429 in codigos

        for nombre in ("_intentos", "_bloqueados"):
            residuo = getattr(auth_router, nombre, None)
            if residuo is not None:
                residuo.clear()

        r = client_auth.post(SOLICITAR, json={"usuario": DNI})
        assert r.status_code == 429, (
            "tras el reinicio se podian volver a pedir codigos al cliente"
        )


class TestLaPoda:
    """La tabla no debe crecer sin fin.

    Cada intento fallido deja una fila. En memoria el recorte lo hacia el
    propio diccionario al pasar de 5000 claves; aqui hace falta decirlo.
    """

    def test_la_poda_borra_lo_caducado_y_respeta_lo_vivo(self, monkeypatch, db):
        import asyncio

        from app import scheduler as sched
        from app.routers import auth as auth_router
        from app.scheduler import job_podar_freno_login

        # Mismo apano que el resto de las pruebas del planificador: el trabajo
        # abre su propia sesion con SessionLocal, que apunta a PostgreSQL.
        monkeypatch.setattr(sched, "SessionLocal", lambda: db)

        ahora = time.time()
        caducada = ahora - max(
            auth_router.settings.LOGIN_BLOQUEO_SEGUNDOS,
            auth_router.settings.LOGIN_VENTANA_SEGUNDOS,
        ) - 3600
        db.add(models.FrenoLogin(
            clave="1.2.3.4|viejo", momentos=[caducada], actualizado_en=caducada,
        ))
        db.add(models.FrenoLogin(
            clave="1.2.3.4|reciente", momentos=[ahora], actualizado_en=ahora,
        ))
        db.commit()

        resultado = asyncio.run(job_podar_freno_login())

        assert resultado["ok"] is True
        claves = {f.clave for f in db.query(models.FrenoLogin).all()}
        assert "1.2.3.4|viejo" not in claves, "la poda no borro la fila caducada"
        assert "1.2.3.4|reciente" in claves, "la poda se llevo un contador vivo"
