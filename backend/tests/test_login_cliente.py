"""El login del cliente: el DNI ya no es una contraseña.

Hasta el 2026-11-23 la contraseña de la app del cliente era su propio DNI
mientras no la cambiara. Ocho dígitos que están en su recibo, en su contrato y
en cualquier foto del documento: quien los tuviera entraba a su cuenta y veía
su dirección, su teléfono y su historial de pagos.

Ahora el documento por sí solo no abre nada. Para estrenar la cuenta —o si
olvidó la contraseña— el cliente pide un código de un solo uso que llega al
WhatsApp que ya tiene registrado en su ficha. Hacen falta las dos cosas.

Estas pruebas cubren los casos que se comprobaron a mano al implementarlo,
para que no haya que volver a comprobarlos a mano nunca más.
"""
from datetime import datetime, timedelta, timezone

import pytest
from passlib.context import CryptContext

from app import models
from app.routers import auth as auth_router
from tests.conftest import crear_cliente, crear_plan, crear_zona

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

DNI = "70111222"
TELEFONO = "951234567"
CLAVE_BUENA = "MiClaveSegura2026"

LOGIN = "/api/auth/cliente/login"
SOLICITAR = "/api/auth/cliente/solicitar-codigo"
VERIFICAR = "/api/auth/cliente/verificar-codigo"


@pytest.fixture
def cliente_sin_clave(db):
    """Un cliente como los que hay hoy en la base: con DNI y sin pin_app."""
    zona, plan = crear_zona(db), crear_plan(db)
    return crear_cliente(db, zona, plan, dni=DNI, telefono=TELEFONO)


@pytest.fixture
def cliente_con_clave(db):
    """Un cliente que ya eligió su contraseña."""
    zona, plan = crear_zona(db), crear_plan(db)
    return crear_cliente(
        db, zona, plan, dni=DNI, telefono=TELEFONO, pin_app=pwd.hash(CLAVE_BUENA),
    )


def pedir_codigo(client_auth, bot, usuario=DNI) -> str:
    """Pide un código y devuelve el que de verdad se envió por WhatsApp."""
    r = client_auth.post(SOLICITAR, json={"usuario": usuario})
    assert r.status_code == 200, r.text
    return bot.ultimo_codigo


# ── Lo que ya no se puede hacer ───────────────────────────────────────────────

class TestElDniNoEsContrasena:

    def test_el_dni_no_sirve_como_contrasena(self, client_auth, cliente_sin_clave):
        """El agujero que se cerró. Si esta prueba se pone verde con un 200,
        es que volvió."""
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": DNI})
        assert r.status_code == 409, (
            f"el DNI volvió a servir como contraseña (HTTP {r.status_code})"
        )

    def test_el_409_no_es_un_fallo_de_credenciales(self, client_auth, cliente_sin_clave):
        """409 y no 401 a propósito: la app lo usa para distinguir «cuenta sin
        estrenar» de «te equivocaste», y llevar a la persona a crear su
        contraseña en vez de decirle que falló."""
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": "cualquier-cosa"})
        assert r.status_code == 409

    def test_pedir_el_codigo_no_cuenta_como_intento_fallido(
        self, client_auth, cliente_sin_clave,
    ):
        """Un cliente sin contraseña que insiste en el login no debe quedarse
        bloqueado: no está adivinando nada, le falta la cuenta por estrenar."""
        for _ in range(12):
            r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": DNI})
            assert r.status_code == 409, f"se bloqueó solo: HTTP {r.status_code}"

    def test_el_cliente_con_clave_entra_con_la_suya(self, client_auth, cliente_con_clave):
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": CLAVE_BUENA})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "cliente"

    def test_y_su_dni_sigue_sin_servir(self, client_auth, cliente_con_clave):
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": DNI})
        assert r.status_code == 401


# ── El código de un solo uso ──────────────────────────────────────────────────

class TestCodigoDeUnSoloUso:

    def test_el_codigo_llega_al_whatsapp_registrado(
        self, client_auth, bot, cliente_sin_clave,
    ):
        r = client_auth.post(SOLICITAR, json={"usuario": DNI})
        assert r.status_code == 200
        assert len(bot.enviados) == 1
        destino, mensaje = bot.enviados[0]
        assert destino == TELEFONO
        assert bot.ultimo_codigo.isdigit() and len(bot.ultimo_codigo) == 6
        # El número vuelve tapado para que la persona sepa dónde mirar, sin
        # imprimirlo entero en una respuesta HTTP.
        assert r.json()["telefono"] == "9****4567"

    def test_el_codigo_canjeado_deja_entrar(self, client_auth, bot, cliente_sin_clave):
        codigo = pedir_codigo(client_auth, bot)
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert r.status_code == 200, r.text
        cuerpo = r.json()
        assert cuerpo["role"] == "cliente"
        assert cuerpo["access_token"]
        assert cuerpo["debe_cambiar_pin"] is False

    def test_despues_de_canjear_entra_con_su_clave(
        self, client_auth, bot, cliente_sin_clave,
    ):
        codigo = pedir_codigo(client_auth, bot)
        client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": CLAVE_BUENA})
        assert r.status_code == 200, r.text

    def test_el_mismo_codigo_no_vale_dos_veces(
        self, client_auth, bot, cliente_sin_clave,
    ):
        codigo = pedir_codigo(client_auth, bot)
        primera = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert primera.status_code == 200
        segunda = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": "OtraClave2026",
        })
        assert segunda.status_code == 400, "el código se pudo reutilizar"

    def test_pedir_otro_codigo_invalida_el_anterior(
        self, client_auth, bot, cliente_sin_clave,
    ):
        viejo = pedir_codigo(client_auth, bot)
        nuevo = pedir_codigo(client_auth, bot)
        assert viejo != nuevo
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": viejo, "pin_nuevo": CLAVE_BUENA,
        })
        assert r.status_code == 400, "el código viejo siguió sirviendo"

    def test_un_codigo_vencido_no_vale(self, client_auth, bot, db, cliente_sin_clave):
        codigo = pedir_codigo(client_auth, bot)
        fila = db.query(models.CodigoAccesoCliente).filter(
            models.CodigoAccesoCliente.cliente_id == cliente_sin_clave.id,
        ).first()
        fila.expira_en = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert r.status_code == 400

    def test_el_mensaje_de_error_no_distingue_los_motivos(
        self, client_auth, bot, cliente_sin_clave,
    ):
        """«No existe», «venció» y «no es el código» dan el mismo texto: cada
        distinción sería una pista para quien está probando."""
        pedir_codigo(client_auth, bot)
        malo = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": "000000", "pin_nuevo": CLAVE_BUENA,
        })
        sin_pedir = client_auth.post(VERIFICAR, json={
            "usuario": "99999999", "codigo": "000000", "pin_nuevo": CLAVE_BUENA,
        })
        assert malo.status_code == sin_pedir.status_code == 400
        assert malo.json()["detail"] == sin_pedir.json()["detail"]


# ── El tope de intentos por código ────────────────────────────────────────────

class TestMaximoCincoIntentos:

    def test_al_sexto_intento_el_codigo_muere(
        self, client_auth, bot, db, cliente_sin_clave,
    ):
        """Seis dígitos se adivinan probando, así que el código no puede
        admitir intentos infinitos."""
        codigo = pedir_codigo(client_auth, bot)
        for i in range(5):
            r = client_auth.post(VERIFICAR, json={
                "usuario": DNI, "codigo": "000000", "pin_nuevo": CLAVE_BUENA,
            })
            assert r.status_code == 400, f"intento {i + 1}"

        # Gastados los 5, ni siquiera el código bueno sirve: hay que pedir otro.
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert r.status_code == 400, "el código sobrevivió a 5 intentos fallidos"

    def test_los_intentos_se_cuentan_en_la_base(
        self, client_auth, bot, db, cliente_sin_clave,
    ):
        pedir_codigo(client_auth, bot)
        for _ in range(3):
            client_auth.post(VERIFICAR, json={
                "usuario": DNI, "codigo": "000000", "pin_nuevo": CLAVE_BUENA,
            })
        db.expire_all()
        fila = db.query(models.CodigoAccesoCliente).filter(
            models.CodigoAccesoCliente.cliente_id == cliente_sin_clave.id,
        ).first()
        assert fila.intentos == 3

    def test_el_codigo_agotado_se_borra_de_la_base(
        self, client_auth, bot, db, cliente_sin_clave,
    ):
        codigo = pedir_codigo(client_auth, bot)
        for _ in range(5):
            client_auth.post(VERIFICAR, json={
                "usuario": DNI, "codigo": "000000", "pin_nuevo": CLAVE_BUENA,
            })
        client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        db.expire_all()
        assert db.query(models.CodigoAccesoCliente).count() == 0


# ── El freno de solicitudes ───────────────────────────────────────────────────

class TestLimiteDeSolicitudes:

    def test_no_se_pueden_pedir_codigos_en_bucle(
        self, client_auth, bot, cliente_sin_clave,
    ):
        """Sin esto se le puede llenar el WhatsApp a un cliente a base de
        pedirle códigos, y gastar el número de la empresa de paso."""
        tope = auth_router.settings.LOGIN_MAX_INTENTOS
        codigos = [
            client_auth.post(SOLICITAR, json={"usuario": DNI}).status_code
            for _ in range(tope + 3)
        ]
        assert 429 in codigos, f"nunca frenó en {len(codigos)} solicitudes"
        assert codigos.index(429) <= tope, (
            f"frenó tarde: primer 429 en la solicitud {codigos.index(429) + 1}"
        )

    def test_el_freno_no_se_salta_falsificando_la_cabecera(
        self, client_auth, bot, cliente_sin_clave,
    ):
        """El agujero de C-2: el contador se indexa por IP, y la IP salía de
        una cabecera que escribe quien quiera. Cambiándola en cada petición se
        estrenaba contador siempre."""
        tope = auth_router.settings.LOGIN_MAX_INTENTOS
        codigos = [
            client_auth.post(
                SOLICITAR,
                json={"usuario": DNI},
                headers={"CF-Connecting-IP": f"198.51.100.{i}",
                         "X-Forwarded-For": f"203.0.113.{i}"},
            ).status_code
            for i in range(1, tope + 4)
        ]
        assert 429 in codigos, "la cabecera falsificada volvió a saltarse el freno"

    def test_el_login_tambien_frena_con_la_cabecera_rotando(
        self, client_auth, cliente_con_clave,
    ):
        tope = auth_router.settings.LOGIN_MAX_INTENTOS
        codigos = [
            client_auth.post(
                LOGIN,
                json={"usuario": DNI, "pin": f"equivocada-{i}"},
                headers={"CF-Connecting-IP": f"198.51.100.{i}"},
            ).status_code
            for i in range(1, tope + 4)
        ]
        assert 429 in codigos, "el login se podía aporrear sin límite"

    def test_entrar_bien_limpia_el_contador(self, client_auth, cliente_con_clave):
        tope = auth_router.settings.LOGIN_MAX_INTENTOS
        for i in range(tope - 1):
            client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
        assert client_auth.post(
            LOGIN, json={"usuario": DNI, "pin": CLAVE_BUENA},
        ).status_code == 200
        # Tras acertar, vuelve a tener todos los intentos disponibles.
        for i in range(tope - 1):
            r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": "mal"})
            assert r.status_code == 401, f"quedó contador viejo (intento {i + 1})"


# ── Qué contraseñas no se aceptan ─────────────────────────────────────────────

class TestContrasenasQueNoProtegenNada:

    @pytest.mark.parametrize("campo", ["dni", "telefono"])
    def test_no_puede_ser_un_dato_de_su_recibo(
        self, client_auth, bot, cliente_sin_clave, campo,
    ):
        """El DNI y el teléfono están en el recibo y en el contrato. Dejar que
        sean la contraseña es volver al punto de partida."""
        codigo = pedir_codigo(client_auth, bot)
        valor = {"dni": DNI, "telefono": TELEFONO}[campo]
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": valor,
        })
        assert r.status_code == 400, f"aceptó el {campo} como contraseña"
        assert "recibos" in r.json()["detail"]

    def test_tiene_que_tener_ocho_caracteres(
        self, client_auth, bot, cliente_sin_clave,
    ):
        codigo = pedir_codigo(client_auth, bot)
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": "corta12",
        })
        assert r.status_code == 400
        assert "8 caracteres" in r.json()["detail"]

    def test_la_clave_rechazada_no_gasta_el_codigo(
        self, client_auth, bot, cliente_sin_clave,
    ):
        """Equivocarse eligiendo la contraseña no debe costarle el código:
        no es un intento de adivinar nada."""
        codigo = pedir_codigo(client_auth, bot)
        client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": DNI,
        })
        r = client_auth.post(VERIFICAR, json={
            "usuario": DNI, "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert r.status_code == 200, r.text


# ── El caso heredado ──────────────────────────────────────────────────────────

class TestClienteConClaveQueEsSuDni:
    """Hasta el 2026-11-23 cambiar-pin aceptaba que la contraseña nueva fuera
    el propio DNI. Esos clientes SÍ pueden entrar —tienen pin_app— así que no
    los caza nada excepto mirar la contraseña en claro al entrar."""

    def test_se_marca_para_que_la_cambie(self, client_auth, db):
        zona, plan = crear_zona(db), crear_plan(db)
        crear_cliente(db, zona, plan, dni=DNI, telefono=TELEFONO,
                      pin_app=pwd.hash(DNI))
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": DNI})
        assert r.status_code == 200, r.text
        assert r.json()["debe_cambiar_pin"] is True

    def test_una_clave_de_verdad_no_se_marca(self, client_auth, cliente_con_clave):
        r = client_auth.post(LOGIN, json={"usuario": DNI, "pin": CLAVE_BUENA})
        assert r.json()["debe_cambiar_pin"] is False


# ── Casos de borde del envío ──────────────────────────────────────────────────

class TestBordesDelEnvio:

    def test_un_dni_que_no_es_cliente_no_se_delata(self, client_auth, bot):
        """La respuesta no confirma si el documento está registrado."""
        r = client_auth.post(SOLICITAR, json={"usuario": "99999999"})
        assert r.status_code == 200
        assert r.json()["telefono"] is None
        assert bot.enviados == [], "se mandó un mensaje a un cliente inexistente"

    def test_sin_whatsapp_registrado_se_dice_claramente(self, client_auth, bot, db):
        """Aquí callar no protege nada: dejaría a la persona esperando un
        mensaje que no va a llegar."""
        zona, plan = crear_zona(db), crear_plan(db)
        crear_cliente(db, zona, plan, dni=DNI, telefono=None)
        r = client_auth.post(SOLICITAR, json={"usuario": DNI})
        assert r.json()["enviado"] is False
        assert "oficina" in r.json()["mensaje"]

    def test_un_cliente_anulado_no_recibe_codigo(self, client_auth, bot, db):
        zona, plan = crear_zona(db), crear_plan(db)
        crear_cliente(db, zona, plan, estado="anulado", dni=DNI, telefono=TELEFONO)
        r = client_auth.post(SOLICITAR, json={"usuario": DNI})
        assert r.json()["telefono"] is None
        assert bot.enviados == []

    def test_si_el_bot_falla_no_se_miente(self, client_auth, bot, cliente_sin_clave):
        bot.responder_ok = False
        r = client_auth.post(SOLICITAR, json={"usuario": DNI})
        assert r.json()["enviado"] is False
        assert "intentar" in r.json()["mensaje"]

    def test_el_codigo_no_se_guarda_en_claro(
        self, client_auth, bot, db, cliente_sin_clave,
    ):
        """Si alguien llega a leer la tabla, no debe poder usar lo que ve."""
        codigo = pedir_codigo(client_auth, bot)
        fila = db.query(models.CodigoAccesoCliente).first()
        assert fila.codigo_hash != codigo
        assert codigo not in fila.codigo_hash
        assert pwd.verify(codigo, fila.codigo_hash)

    def test_quien_tiene_dos_lineas_entra_por_el_usuario_completo(
        self, client_auth, bot, db,
    ):
        """Con el DNI pelado entra a la primera línea; con el usuario
        completo, a la que pida."""
        zona, plan = crear_zona(db), crear_plan(db)
        crear_cliente(db, zona, plan, dni=DNI, telefono=TELEFONO,
                      usuario_pppoe=DNI, linea=1)
        segunda = crear_cliente(db, zona, plan, dni=DNI, telefono=TELEFONO,
                                usuario_pppoe=f"{DNI}b", linea=2)
        r = client_auth.post(SOLICITAR, json={"usuario": f"{DNI}b"})
        assert r.status_code == 200
        codigo = bot.ultimo_codigo
        canje = client_auth.post(VERIFICAR, json={
            "usuario": f"{DNI}b", "codigo": codigo, "pin_nuevo": CLAVE_BUENA,
        })
        assert canje.status_code == 200, canje.text
        assert canje.json()["cliente_id"] == segunda.id
