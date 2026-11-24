"""La configuración del registro (logging).

Sin configurar, el logger raíz de Python descarta todo lo que esté por debajo
de WARNING. Uvicorn configura sus PROPIOS loggers, no el raíz, así que cada
`logger.info(...)` del proyecto no se escribía en ninguna parte. Entre lo que
se perdía:

  * el registro de auditoría de los comandos RouterOS — zona, usuario y
    comando, escrito a propósito para dejar constancia de quién tocó un
    router de producción;
  * a qué cliente se le mandó un código de acceso, y quién estrenó contraseña;
  * cuántos recordatorios se enviaron y cuántos clientes se cortaron cada
    noche;
  * que el planificador llegó a arrancar.

Lo de la auditoría es lo peor: el rastro se escribía y se tiraba, que es peor
que no haberlo escrito, porque alguien confía en que está ahí.
"""
import logging

from app import registro


def test_configurar_pone_el_raiz_en_info():
    """Que el nivel efectivo baje de WARNING es TODO el arreglo: sin esto, el
    resto del archivo es decoración."""
    registro.configurar(nivel="INFO")
    assert logging.getLogger().isEnabledFor(logging.INFO)


def test_los_mensajes_de_la_aplicacion_llegan_a_la_salida(capsys):
    registro.configurar(nivel="INFO")
    logging.getLogger("app.pruebas").info("hola desde la prueba")
    salida = capsys.readouterr()
    assert "hola desde la prueba" in (salida.out + salida.err)


def test_va_a_stdout_que_es_donde_docker_lo_recoge(capsys):
    registro.configurar(nivel="INFO")
    logging.getLogger("app.pruebas").info("a la salida estandar")
    salida = capsys.readouterr()
    assert "a la salida estandar" in salida.out, (
        "el registro no salió por stdout; Docker no lo va a recoger"
    )


def test_el_nivel_se_puede_subir_para_depurar():
    registro.configurar(nivel="DEBUG")
    assert logging.getLogger().isEnabledFor(logging.DEBUG)
    registro.configurar(nivel="INFO")
    assert not logging.getLogger().isEnabledFor(logging.DEBUG)


def test_un_nivel_escrito_mal_no_tumba_el_arranque():
    """Una variable de entorno con una errata no puede impedir que el sistema
    arranque. Se avisa y se usa INFO."""
    registro.configurar(nivel="INFOO")
    assert logging.getLogger().isEnabledFor(logging.INFO)


def test_llamarlo_dos_veces_no_duplica_los_mensajes(capsys):
    """El arranque de uvicorn con --reload puede importar el módulo más de una
    vez. Sin esto, cada mensaje saldría dos o tres veces."""
    registro.configurar(nivel="INFO")
    registro.configurar(nivel="INFO")
    registro.configurar(nivel="INFO")
    logging.getLogger("app.pruebas").info("una sola vez")
    salida = capsys.readouterr().out + capsys.readouterr().err
    assert salida.count("una sola vez") == 1, (
        f"el mensaje salió {salida.count('una sola vez')} veces"
    )


def test_el_ruido_de_las_librerias_no_sube_a_info(capsys):
    """paramiko y httpx a nivel INFO llenan el registro de líneas por cada
    conexión. Se dejan en WARNING para que lo de la empresa se pueda leer."""
    registro.configurar(nivel="INFO")
    for ruidosa in ("paramiko", "httpx", "httpcore", "apscheduler"):
        assert not logging.getLogger(ruidosa).isEnabledFor(logging.INFO), (
            f"{ruidosa} sigue a INFO y va a tapar el registro de la aplicación"
        )


def test_el_arranque_de_la_app_configura_el_registro():
    """La prueba que importa de verdad: que alguien LLAME a configurar().
    Tenerlo escrito y no llamarlo es exactamente el fallo que había."""
    import importlib
    logging.getLogger().setLevel(logging.WARNING)
    importlib.reload(importlib.import_module("app.main"))
    assert logging.getLogger().isEnabledFor(logging.INFO), (
        "app.main no configura el registro al importarse"
    )
