"""Cifrado y envío de los respaldos fuera del servidor.

Los siete respaldos que se guardan viven en el mismo disco que PostgreSQL. Un
fallo de disco, un cifrado por ransomware o un `rm` desafortunado se lleva la
base y todas sus copias a la vez. El trabajo nocturno protege de los borrados
por error, no de perder la máquina.

Lo que se prueba aquí es lo que tiene que ser verdad para que esa copia sirva:

  * que se puede descifrar (un respaldo cifrado que no se abre no es un
    respaldo, es un archivo inútil con una falsa sensación de seguridad);
  * que una clave equivocada o un archivo manipulado NO se abren en silencio;
  * que el comando de envío no pasa por un shell.
"""
import os
import subprocess
import sys

import pytest

from app import respaldos

CLAVE = "una-clave-larga-de-respaldo-2026"


@pytest.fixture
def archivo(tmp_path):
    p = tmp_path / "wisp_prueba.sql.gz"
    p.write_bytes(b"-- PostgreSQL database dump\n" + os.urandom(5000))
    return p


class TestCifrado:

    def test_ida_y_vuelta(self, archivo, tmp_path):
        original = archivo.read_bytes()
        cifrado = respaldos.cifrar_archivo(archivo, CLAVE)
        assert cifrado.exists() and cifrado != archivo

        # Lo cifrado no se parece a lo original.
        assert original not in cifrado.read_bytes()
        assert b"PostgreSQL database dump" not in cifrado.read_bytes()

        vuelta = tmp_path / "vuelta.sql.gz"
        respaldos.descifrar_archivo(cifrado, CLAVE, vuelta)
        assert vuelta.read_bytes() == original, "lo descifrado no es lo original"

    def test_un_archivo_grande_tambien(self, tmp_path):
        """Más de un bloque, para que el troceado quede ejercitado y no solo
        el camino fácil de un archivo pequeño."""
        grande = tmp_path / "grande.sql.gz"
        datos = os.urandom(respaldos.BLOQUE * 2 + 1234)
        grande.write_bytes(datos)

        cifrado = respaldos.cifrar_archivo(grande, CLAVE)
        vuelta = tmp_path / "vuelta.bin"
        respaldos.descifrar_archivo(cifrado, CLAVE, vuelta)
        assert vuelta.read_bytes() == datos

    def test_la_clave_equivocada_no_abre(self, archivo, tmp_path):
        cifrado = respaldos.cifrar_archivo(archivo, CLAVE)
        with pytest.raises(respaldos.RespaldoIlegible):
            respaldos.descifrar_archivo(cifrado, "otra-clave-distinta", tmp_path / "x")

    def test_un_archivo_manipulado_no_abre(self, archivo, tmp_path):
        """AES-GCM autentica: cambiar un byte tiene que fallar, no devolver
        basura. Un respaldo corrupto que se descifra "bien" es peor que uno
        que no se descifra."""
        cifrado = respaldos.cifrar_archivo(archivo, CLAVE)
        crudo = bytearray(cifrado.read_bytes())
        crudo[-20] ^= 0x01          # un solo bit, en el último bloque
        cifrado.write_bytes(bytes(crudo))
        with pytest.raises(respaldos.RespaldoIlegible):
            respaldos.descifrar_archivo(cifrado, CLAVE, tmp_path / "x")

    def test_un_archivo_que_no_es_nuestro_no_abre(self, tmp_path):
        ajeno = tmp_path / "cualquiera.bin"
        ajeno.write_bytes(b"esto no es un respaldo cifrado")
        with pytest.raises(respaldos.RespaldoIlegible):
            respaldos.descifrar_archivo(ajeno, CLAVE, tmp_path / "x")

    def test_sin_clave_no_cifra_y_lo_dice(self, archivo):
        with pytest.raises(ValueError):
            respaldos.cifrar_archivo(archivo, "")

    def test_el_script_de_rescate_descifra_lo_mismo(self, archivo, tmp_path):
        """El script suelto tiene que abrir lo que cifró la aplicación.

        Importa de verdad: el día que haga falta el respaldo, puede que no
        haya un contenedor en pie. Si solo se puede descifrar desde dentro de
        la aplicación, el respaldo depende de lo que se perdió.
        """
        original = archivo.read_bytes()
        cifrado = respaldos.cifrar_archivo(archivo, CLAVE)
        salida = tmp_path / "rescatado.sql.gz"

        script = (
            os.path.dirname(os.path.dirname(os.path.abspath(respaldos.__file__)))
            + "/../scripts/descifrar-respaldo.py"
        )
        script = os.path.normpath(script)
        assert os.path.exists(script), f"no existe {script}"

        r = subprocess.run(
            [sys.executable, script, str(cifrado), str(salida)],
            env={**os.environ, "BACKUP_CIFRADO_CLAVE": CLAVE},
            capture_output=True, text=True,
        )
        assert r.returncode == 0, f"el script falló: {r.stderr}"
        assert salida.read_bytes() == original


class TestEnvio:

    def test_sin_comando_configurado_no_falla_pero_lo_dice(self, archivo, monkeypatch):
        monkeypatch.setattr(respaldos.settings, "BACKUP_REMOTO_CMD", "")
        ok, detalle = respaldos.enviar_fuera(archivo)
        assert ok is False
        assert "no está configurado" in detalle

    def test_el_archivo_entra_como_argumento_suelto(self, archivo, monkeypatch):
        """{archivo} se sustituye como UN argumento del argv, no pegado en una
        línea de shell."""
        visto = {}

        def falso_run(cmd, **kw):
            visto["cmd"] = cmd
            visto["shell"] = kw.get("shell", False)
            class R: returncode = 0; stderr = b""; stdout = b""
            return R()

        monkeypatch.setattr(respaldos.subprocess, "run", falso_run)
        monkeypatch.setattr(
            respaldos.settings, "BACKUP_REMOTO_CMD",
            "scp -i /root/.ssh/k {archivo} usuario@host:/respaldos/",
        )
        ok, _ = respaldos.enviar_fuera(archivo)
        assert ok is True
        assert visto["shell"] is False, "se ejecutó con shell: inyectable"
        assert str(archivo) in visto["cmd"]
        assert visto["cmd"][0] == "scp"

    def test_no_se_interpreta_nada_de_shell(self, archivo, monkeypatch):
        """Si alguien pone un `;` en la configuración, no se ejecutan dos
        comandos: se le pasa como texto al programa, que se queja."""
        visto = {}

        def falso_run(cmd, **kw):
            visto["cmd"] = cmd
            visto["shell"] = kw.get("shell", False)
            class R: returncode = 0; stderr = b""; stdout = b""
            return R()

        monkeypatch.setattr(respaldos.subprocess, "run", falso_run)
        monkeypatch.setattr(
            respaldos.settings, "BACKUP_REMOTO_CMD",
            "scp {archivo} host:/x; rm -rf /",
        )
        respaldos.enviar_fuera(archivo)
        assert visto["shell"] is False
        # El `;` y lo que sigue viajan como argumentos, no como otro comando.
        assert ";" in " ".join(visto["cmd"])

    def test_un_comando_que_falla_se_reporta(self, archivo, monkeypatch):
        def falso_run(cmd, **kw):
            class R:
                returncode = 1
                stderr = b"Permission denied (publickey)"
                stdout = b""
            return R()

        monkeypatch.setattr(respaldos.subprocess, "run", falso_run)
        monkeypatch.setattr(respaldos.settings, "BACKUP_REMOTO_CMD", "scp {archivo} host:/x")
        ok, detalle = respaldos.enviar_fuera(archivo)
        assert ok is False
        assert "publickey" in detalle

    def test_sin_el_hueco_del_archivo_se_rechaza(self, archivo, monkeypatch):
        """Un comando sin {archivo} enviaría cualquier cosa menos el respaldo.
        Mejor negarse que fingir que se envió algo."""
        monkeypatch.setattr(respaldos.settings, "BACKUP_REMOTO_CMD", "scp /otra/cosa host:/x")
        ok, detalle = respaldos.enviar_fuera(archivo)
        assert ok is False
        assert "{archivo}" in detalle
