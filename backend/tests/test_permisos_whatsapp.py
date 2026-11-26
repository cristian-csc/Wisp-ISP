"""Quién puede vincular el WhatsApp de la empresa.

Hasta el 2026-11-26, `GET /api/whatsapp/qr` solo pedía una sesión válida:
`Depends(get_current_user)` y nada más. Ese endpoint devuelve el código QR de
vinculación de WhatsApp Web, así que cualquier cuenta del personal —un
técnico, una vendedora de campo— podía escanearlo con su teléfono y quedarse
con la sesión de WhatsApp de la empresa: escribir a cualquier cliente como la
empresa, y leer todo lo que contestan.

Es el hallazgo A-1 de AUDITORIA_SEGURIDAD.md. Lo que sigue fija las dos capas
de permiso que lo cierran: el tipo de cuenta (`require_roles`) y el módulo
(`panel.whatsapp`, en `acceso.py`). Las dos hacen falta, y se prueban por
separado porque se rompen por separado.
"""
from app import models
from tests.conftest import cabecera_de, crear_rol, crear_usuario

QR = "/api/whatsapp/qr"
STATUS = "/api/whatsapp/status"


def test_un_tecnico_no_obtiene_el_qr(client_permisos, db):
    """El caso del hallazgo: una cuenta de campo pedía el QR y lo recibía."""
    rol = crear_rol(db, "tecnico", "tecnico", modulos=("movil.ordenes",))
    tecnico = crear_usuario(db, "tecnico@wisp.test", models.RolUsuario.tecnico, rol)

    r = client_permisos.get(QR, headers=cabecera_de(tecnico))

    assert r.status_code == 403, (
        "un tecnico recibio el QR de vinculacion de WhatsApp: %s" % r.text
    )


def test_atencion_al_cliente_no_obtiene_el_qr(client_permisos, db):
    """Atención al cliente llega a casi todo el panel, pero no a esto."""
    rol = crear_rol(db, "atencion_cliente", "atencion_cliente", modulos=("panel.pagos",))
    cajera = crear_usuario(db, "caja@wisp.test", models.RolUsuario.atencion_cliente, rol)

    r = client_permisos.get(QR, headers=cabecera_de(cajera))

    assert r.status_code == 403


def test_un_admin_sin_el_modulo_whatsapp_no_obtiene_el_qr(client_permisos, db):
    """La segunda capa, la que `require_roles` sola no cubre.

    Un rol hecho a medida con perfil de administrador pero sin el módulo
    `panel.whatsapp` no entra. Sin esta prueba, quitar la regla de acceso.py
    pasaría desapercibido: el rol seguiría siendo admin y el endpoint
    respondería 200.
    """
    rol = crear_rol(db, "admin_limitado", "admin", modulos=("panel.pagos",))
    admin = crear_usuario(db, "limitado@wisp.test", models.RolUsuario.admin, rol)

    r = client_permisos.get(QR, headers=cabecera_de(admin))

    assert r.status_code == 403


def test_un_admin_con_el_modulo_whatsapp_si_entra(client_permisos, db):
    """El permiso no debe estorbar a quien sí le toca.

    No hay bot de WhatsApp levantado en las pruebas, así que el endpoint
    responde 200 con `error`: eso es exactamente lo que se quiere ver, porque
    prueba que la petición pasó las dos capas de permiso y murió más adelante,
    al salir a la red.
    """
    rol = crear_rol(db, "admin", "admin", modulos=("panel.whatsapp",))
    admin = crear_usuario(db, "jefe@wisp.test", models.RolUsuario.admin, rol)

    r = client_permisos.get(QR, headers=cabecera_de(admin))

    assert r.status_code == 200, r.text
    assert "qr" in r.json()


def test_el_superadmin_entra_sin_el_modulo(client_permisos, db):
    """El rol `admin` de serie es superadmin y se salta las reglas de módulo.

    Está documentado así en `acceso.py:184` y es lo que evita que una
    instalación existente se quede sin acceso al vincular WhatsApp. Se prueba
    para que el día que alguien cambie esa semántica lo note aquí.
    """
    rol = crear_rol(db, "admin", "admin", es_superadmin=True)
    admin = crear_usuario(db, "root@wisp.test", models.RolUsuario.admin, rol)

    r = client_permisos.get(QR, headers=cabecera_de(admin))

    assert r.status_code == 200, r.text


def test_un_tecnico_tampoco_ve_si_el_whatsapp_esta_vinculado(client_permisos, db):
    """`/status` dice si la empresa tiene WhatsApp vinculado y con qué número.

    Solo lo consume la página de configuración de WhatsApp, que ya es de
    administrador, así que cerrarlo no le quita nada a nadie y deja de
    filtrar el estado del canal a cualquier cuenta del personal.
    """
    rol = crear_rol(db, "tecnico", "tecnico", modulos=("movil.ordenes",))
    tecnico = crear_usuario(db, "tecnico2@wisp.test", models.RolUsuario.tecnico, rol)

    r = client_permisos.get(STATUS, headers=cabecera_de(tecnico))

    assert r.status_code == 403


def test_sin_sesion_no_se_llega_al_qr(client_permisos):
    """Lo de siempre, pero escrito: sin token no se entra."""
    assert client_permisos.get(QR).status_code == 401
