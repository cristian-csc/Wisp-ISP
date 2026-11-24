"""Dónde acaba lo que el sistema anota.

El problema que resuelve: sin configurar nada, el logger raíz de Python
descarta todo lo que esté por debajo de WARNING. Uvicorn configura sus PROPIOS
loggers, no el raíz, así que cada `logger.info(...)` del proyecto no se
escribía en ninguna parte. Se perdía el recuento de los cortes de cada noche,
quién estrenó contraseña, a qué cliente se le mandó un código… y el registro
de auditoría de los comandos RouterOS, con la zona, el usuario y el comando.

Eso último es lo peor del asunto: el rastro de quién tocó un router de
producción se escribía y se tiraba. Es peor que no haberlo escrito, porque
alguien confía en que está ahí el día que hace falta.

Decisiones, y por qué:

  * A `stdout`, no a un archivo. El backend corre en un contenedor; lo que
    sale por ahí lo recoge Docker y se lee con `docker compose logs`. Un
    archivo dentro del contenedor se pierde en el siguiente despliegue.
  * El nivel sale de `LOG_LEVEL`, con INFO por defecto. En producción INFO es
    lo correcto: es el nivel en el que están escritas las cosas que hay que
    poder responder («¿se cortó a quien tocaba anoche?»).
  * Las librerías ruidosas se quedan en WARNING. `paramiko` y `httpx` a INFO
    escriben varias líneas por conexión, y con quince routers eso tapa el
    registro de la empresa, que es justamente el que hacía falta ver.
"""
import logging
import sys

_NIVELES = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}

# Librerías que a INFO escriben una línea por conexión o por ciclo. El registro
# tiene que ser legible para que alguien lo lea; si no, da igual que exista.
_RUIDOSAS = ("paramiko", "httpx", "httpcore", "apscheduler", "passlib")

# Para que importar el módulo dos veces (uvicorn --reload lo hace) no acabe
# con cada mensaje saliendo dos o tres veces.
_YA_CONFIGURADO = False


class _SalidaEstandar:
    """`sys.stdout` resuelto en el momento de escribir, no al construirse.

    `logging.StreamHandler(sys.stdout)` se queda con el objeto que había en
    ese instante. Normalmente da igual —en el contenedor stdout no cambia—,
    pero rompe en cuanto algo lo redirige después: el handler sigue escribiendo
    en la salida vieja. Resolverlo al escribir cuesta cuatro líneas y hace que
    el registro siga a stdout a donde vaya.
    """

    def write(self, texto):
        return sys.stdout.write(texto)

    def flush(self):
        return sys.stdout.flush()


def configurar(nivel: str | None = None) -> None:
    """Deja el registro listo. Idempotente: llamarlo de nuevo solo cambia el nivel."""
    global _YA_CONFIGURADO

    pedido = (nivel or "INFO").strip().upper()
    if pedido not in _NIVELES:
        # Una errata en una variable de entorno no puede impedir que el
        # sistema arranque. Se avisa y se sigue con INFO.
        print(
            f"LOG_LEVEL='{pedido}' no es un nivel válido "
            f"({', '.join(sorted(_NIVELES))}). Se usa INFO.",
            file=sys.stderr,
        )
        pedido = "INFO"

    raiz = logging.getLogger()
    raiz.setLevel(pedido)

    if not _YA_CONFIGURADO:
        salida = logging.StreamHandler(_SalidaEstandar())
        salida.setFormatter(logging.Formatter(
            # La hora en ISO y el nombre del logger: con eso se sabe cuándo
            # pasó y qué módulo lo dijo, que es lo que se pregunta primero.
            fmt="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        ))
        raiz.addHandler(salida)
        _YA_CONFIGURADO = True

    for ruidosa in _RUIDOSAS:
        logging.getLogger(ruidosa).setLevel(
            # Si se está depurando a propósito, no se le tapa la boca a nadie.
            logging.DEBUG if pedido == "DEBUG" else logging.WARNING
        )
