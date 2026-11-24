"""Sacar los respaldos del servidor, cifrados.

El problema que resuelve: los siete respaldos que se guardan viven en el mismo
disco que PostgreSQL. Un fallo de disco, un cifrado por ransomware o un `rm`
desafortunado se lleva la base y todas sus copias a la vez. El trabajo
nocturno protege de los borrados por error; esto protege de perder la máquina.

Dos piezas, las dos opcionales y apagadas si no se configuran:

  * `cifrar_archivo` — AES-256-GCM con la clave derivada de
    BACKUP_CIFRADO_CLAVE. Hace falta porque el respaldo lleva los datos
    personales de todos los clientes y su historial de pagos, y va a parar a
    una máquina que ya no es ésta.
  * `enviar_fuera` — ejecuta BACKUP_REMOTO_CMD, que es el comando que cada
    instalación quiera (`scp`, `rclone`, `rsync`…), con {archivo} donde va la
    ruta. SIN shell: el comando se parte con shlex y la ruta entra como un
    argumento suelto.

## Qué poner en BACKUP_REMOTO_CMD

A otra máquina por SSH (`scp` y `ssh` ya están en la imagen):

    BACKUP_REMOTO_CMD=scp -i /root/.ssh/respaldos -o StrictHostKeyChecking=accept-new {archivo} respaldos@otra-maquina:/srv/respaldos-wisp/

A un almacén en la nube con rclone (hay que añadirlo al Dockerfile):

    BACKUP_REMOTO_CMD=rclone copy {archivo} b2:mi-bucket/wisp/

## Cómo se abre un respaldo cifrado

    python scripts/descifrar-respaldo.py wisp_AAAAMMDD.sql.gz.enc salida.sql.gz

Ese script no necesita la aplicación ni el contenedor, y es a propósito: el
día que haga falta el respaldo puede que no quede nada en pie. Un respaldo que
solo se puede abrir desde dentro de lo que se perdió no sirve de nada.

GUARDA LA CLAVE FUERA DE AQUÍ. Si se pierde BACKUP_CIFRADO_CLAVE, los
respaldos cifrados no se recuperan: no hay puerta de atrás, es el objetivo.
"""
from __future__ import annotations

import logging
import os
import shlex
import struct
import subprocess
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from .config import settings

logger = logging.getLogger(__name__)


class RespaldoIlegible(Exception):
    """El archivo no se pudo descifrar: clave equivocada, manipulado, o no es
    uno de los nuestros."""


# Cabecera del formato. La versión va dentro para que un cambio futuro pueda
# seguir abriendo los archivos viejos en vez de romperlos.
MAGIA = b"WISPBK01"
SAL = 16
NONCE = 12
# Se cifra por bloques en vez de de una sola vez: un respaldo entero en memoria
# es justo lo que se quitó del volcado, y crece con los clientes.
BLOQUE = 1024 * 1024
# Parámetros de scrypt. n=2^15 tarda décimas de segundo, que para algo que
# corre una vez por noche no se nota, y encarece mucho probar claves a lo bruto.
_N, _R, _P = 2 ** 15, 8, 1


def _clave(passphrase: str, sal: bytes) -> bytes:
    return Scrypt(salt=sal, length=32, n=_N, r=_R, p=_P).derive(passphrase.encode())


def cifrar_archivo(origen: Path, passphrase: str) -> Path:
    """Cifra `origen` a `origen.enc` y devuelve la ruta nueva.

    El original NO se borra: de eso decide quien llama, que es el único que
    sabe si ya se envió la copia.
    """
    if not passphrase:
        raise ValueError("Hace falta una clave para cifrar el respaldo")

    origen = Path(origen)
    destino = origen.with_suffix(origen.suffix + ".enc")
    sal = os.urandom(SAL)
    nonce_base = os.urandom(NONCE - 4)
    aes = AESGCM(_clave(passphrase, sal))

    with open(origen, "rb") as entrada, open(destino, "wb") as salida:
        salida.write(MAGIA + sal + nonce_base)
        indice = 0
        while True:
            trozo = entrada.read(BLOQUE)
            ultimo = len(trozo) < BLOQUE
            # El índice va en el nonce (único por bloque) y además como datos
            # autenticados: así nadie puede reordenar ni quitar bloques sin
            # que el descifrado falle.
            nonce = nonce_base + struct.pack(">I", indice)
            aad = struct.pack(">I?", indice, ultimo)
            cifrado = aes.encrypt(nonce, trozo, aad)
            salida.write(struct.pack(">I", len(cifrado)) + cifrado)
            if ultimo:
                break
            indice += 1

    return destino


def descifrar_archivo(origen: Path, passphrase: str, destino: Path) -> Path:
    """Lo inverso. Lanza RespaldoIlegible si algo no cuadra."""
    origen, destino = Path(origen), Path(destino)
    try:
        with open(origen, "rb") as entrada:
            if entrada.read(len(MAGIA)) != MAGIA:
                raise RespaldoIlegible(
                    f"{origen.name} no es un respaldo cifrado de WISP"
                )
            sal = entrada.read(SAL)
            nonce_base = entrada.read(NONCE - 4)
            if len(sal) != SAL or len(nonce_base) != NONCE - 4:
                raise RespaldoIlegible(f"{origen.name} está truncado")

            aes = AESGCM(_clave(passphrase, sal))
            with open(destino, "wb") as salida:
                indice = 0
                while True:
                    cabecera = entrada.read(4)
                    if not cabecera:
                        raise RespaldoIlegible(
                            f"{origen.name} se acaba sin cerrar: está truncado"
                        )
                    (largo,) = struct.unpack(">I", cabecera)
                    cifrado = entrada.read(largo)
                    if len(cifrado) != largo:
                        raise RespaldoIlegible(f"{origen.name} está truncado")
                    nonce = nonce_base + struct.pack(">I", indice)
                    # No se sabe si es el último hasta probarlo: se intenta
                    # como «no último» y, si no cuadra, como «último».
                    for ultimo in (False, True):
                        try:
                            trozo = aes.decrypt(
                                nonce, cifrado, struct.pack(">I?", indice, ultimo)
                            )
                            break
                        except InvalidTag:
                            if ultimo:
                                raise
                    salida.write(trozo)
                    if ultimo:
                        break
                    indice += 1
    except InvalidTag:
        # Sin distinguir clave equivocada de archivo manipulado: para quien
        # está restaurando es lo mismo —no se puede usar— y distinguirlo solo
        # ayudaría a quien esté probando claves.
        destino.unlink(missing_ok=True)
        raise RespaldoIlegible(
            f"No se pudo descifrar {origen.name}: la clave no es la correcta, "
            "o el archivo está dañado o fue manipulado."
        ) from None
    except RespaldoIlegible:
        destino.unlink(missing_ok=True)
        raise
    except OSError as e:
        raise RespaldoIlegible(f"No se pudo leer {origen}: {e}") from e

    return destino


def enviar_fuera(archivo: Path) -> tuple[bool, str]:
    """Ejecuta BACKUP_REMOTO_CMD con {archivo}. Nunca lanza."""
    plantilla = (settings.BACKUP_REMOTO_CMD or "").strip()
    if not plantilla:
        return False, (
            "El envío fuera del servidor no está configurado "
            "(BACKUP_REMOTO_CMD vacío): el respaldo se queda en este disco."
        )
    if "{archivo}" not in plantilla:
        # Mejor negarse que ejecutar algo que no manda el respaldo y dar por
        # bueno el envío.
        return False, (
            "BACKUP_REMOTO_CMD tiene que incluir {archivo} donde va la ruta "
            "del respaldo. Ejemplo: scp {archivo} usuario@maquina:/respaldos/"
        )

    # shlex y no un shell: el comando sale de la configuración, pero pasarlo
    # por `sh -c` significaría que un `;` ahí dentro ejecuta otra cosa, y que
    # una ruta con un espacio rompe el envío. Así la ruta es un argumento.
    try:
        partes = shlex.split(plantilla)
    except ValueError as e:
        return False, f"BACKUP_REMOTO_CMD no se pudo interpretar: {e}"
    cmd = [str(archivo) if p == "{archivo}" else p for p in partes]

    try:
        r = subprocess.run(cmd, capture_output=True, timeout=1800)
    except FileNotFoundError:
        return False, (
            f"«{cmd[0]}» no está instalado en el contenedor del backend. "
            "scp y ssh sí están; rclone o rsync habría que añadirlos al "
            "backend/Dockerfile."
        )
    except subprocess.TimeoutExpired:
        return False, "El envío tardó más de 30 minutos y se cortó."
    except Exception as e:
        return False, f"No se pudo ejecutar el envío: {e}"

    if r.returncode != 0:
        detalle = (r.stderr or r.stdout or b"").decode(errors="ignore").strip()
        return False, f"El envío falló (código {r.returncode}): {detalle[:300]}"

    return True, f"Enviado con {cmd[0]}"


def preparar_y_enviar(ruta: str) -> tuple[bool, str]:
    """Cifra si hay clave y manda fuera si hay destino. Nunca lanza.

    Lo llama el trabajo nocturno. Devuelve (ok, detalle) para que quien llama
    decida si eso es una línea en el log o una alerta.
    """
    archivo = Path(ruta)
    a_enviar = archivo
    cifrado = None

    if settings.BACKUP_CIFRADO_CLAVE:
        try:
            cifrado = cifrar_archivo(archivo, settings.BACKUP_CIFRADO_CLAVE)
            a_enviar = cifrado
        except Exception as e:
            return False, f"No se pudo cifrar el respaldo: {e}"
    elif (settings.BACKUP_REMOTO_CMD or "").strip():
        # Se avisa, no se bloquea: es mejor tener la copia fuera sin cifrar que
        # no tenerla. Pero que quede escrito, porque ese archivo lleva los
        # datos personales de todos los clientes.
        logger.warning(
            "El respaldo sale del servidor SIN CIFRAR: BACKUP_CIFRADO_CLAVE "
            "está vacío. Lleva los datos de todos los clientes."
        )

    ok, detalle = enviar_fuera(a_enviar)

    # El cifrado es un archivo de trabajo: lo que se conserva aquí es el .sql.gz
    # de siempre, que es lo que lista y descarga el panel.
    if cifrado is not None:
        cifrado.unlink(missing_ok=True)

    return ok, detalle
