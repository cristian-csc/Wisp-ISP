#!/usr/bin/env python3
"""Abre un respaldo cifrado de WISP.

    python scripts/descifrar-respaldo.py wisp_20261124_033000.sql.gz.enc salida.sql.gz

La clave sale de BACKUP_CIFRADO_CLAVE en el entorno, o se pide por teclado.

Por qué este script existe suelto, sin importar nada de la aplicación: el día
que haga falta el respaldo puede que no quede un contenedor en pie ni una
copia del proyecto. Un respaldo que solo se puede abrir desde dentro de lo que
se perdió no sirve de nada. Solo necesita Python y la librería `cryptography`:

    pip install cryptography

Una vez descifrado, se restaura como cualquier otro respaldo —ver
docs/RESTAURAR-RESPALDO.md.
"""
import getpass
import os
import struct
import sys
from pathlib import Path

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
except ImportError:
    sys.exit("Falta la libreria 'cryptography'. Instalala con:  pip install cryptography")

# Tiene que coincidir con backend/app/respaldos.py. Se repite a proposito:
# este script no importa nada del proyecto.
MAGIA = b"WISPBK01"
SAL = 16
NONCE = 12
BLOQUE = 1024 * 1024
_N, _R, _P = 2 ** 15, 8, 1


def descifrar(origen: Path, passphrase: str, destino: Path) -> None:
    with open(origen, "rb") as entrada:
        if entrada.read(len(MAGIA)) != MAGIA:
            sys.exit(f"{origen.name} no es un respaldo cifrado de WISP.")
        sal = entrada.read(SAL)
        nonce_base = entrada.read(NONCE - 4)
        if len(sal) != SAL or len(nonce_base) != NONCE - 4:
            sys.exit(f"{origen.name} esta truncado.")

        aes = AESGCM(Scrypt(salt=sal, length=32, n=_N, r=_R, p=_P).derive(passphrase.encode()))

        with open(destino, "wb") as salida:
            indice = 0
            while True:
                cabecera = entrada.read(4)
                if not cabecera:
                    sys.exit(f"{origen.name} se acaba sin cerrar: esta truncado.")
                (largo,) = struct.unpack(">I", cabecera)
                cifrado = entrada.read(largo)
                if len(cifrado) != largo:
                    sys.exit(f"{origen.name} esta truncado.")
                nonce = nonce_base + struct.pack(">I", indice)
                trozo = None
                for ultimo in (False, True):
                    try:
                        trozo = aes.decrypt(nonce, cifrado, struct.pack(">I?", indice, ultimo))
                        break
                    except InvalidTag:
                        continue
                if trozo is None:
                    destino.unlink(missing_ok=True)
                    sys.exit(
                        "No se pudo descifrar: la clave no es la correcta, o el "
                        "archivo esta danado o fue manipulado."
                    )
                salida.write(trozo)
                if ultimo:
                    break
                indice += 1


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip().splitlines()[2].strip())

    origen, destino = Path(sys.argv[1]), Path(sys.argv[2])
    if not origen.exists():
        sys.exit(f"No existe {origen}")
    if destino.exists():
        sys.exit(f"{destino} ya existe. Elige otro nombre para no pisarlo.")

    clave = os.environ.get("BACKUP_CIFRADO_CLAVE") or getpass.getpass(
        "Clave del respaldo (BACKUP_CIFRADO_CLAVE): "
    )
    if not clave:
        sys.exit("Sin clave no se puede abrir el respaldo.")

    descifrar(origen, clave, destino)
    kb = destino.stat().st_size // 1024
    print(f"Listo: {destino}  ({kb} KB)")
    print("Para restaurarlo, ver docs/RESTAURAR-RESPALDO.md")


if __name__ == "__main__":
    main()
