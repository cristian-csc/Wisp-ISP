import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "changeme-dev-only-secret-key"
_DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"


class Settings(BaseSettings):
    # "desarrollo" o "produccion". En produccion el sistema se niega a
    # arrancar con claves de ejemplo y esconde la documentacion de la API.
    ENTORNO: str = "desarrollo"

    DATABASE_URL: str = _DEFAULT_DATABASE_URL
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Origenes que pueden llamar a la API desde un navegador, separados por
    # coma. Vacio = la lista de desarrollo de abajo (solo localhost).
    CORS_ORIGINS: str = ""

    # Freno de fuerza bruta en el login. 0 desactiva el freno.
    LOGIN_MAX_INTENTOS: int = 8
    LOGIN_VENTANA_SEGUNDOS: int = 300
    LOGIN_BLOQUEO_SEGUNDOS: int = 900

    # Contrasena del primer administrador, solo se usa si la base esta vacia.
    # Si no se define, el sistema genera una al azar y la escribe en el log de
    # arranque una unica vez — nunca hay una clave conocida en el codigo.
    ADMIN_INICIAL_EMAIL: str = "admin"
    ADMIN_INICIAL_PASSWORD: str = ""

    WHATSAPP_API_URL: str = "http://127.0.0.1:3001"
    # Clave compartida con el bot de WhatsApp. Sin ella, cualquiera que
    # alcance el puerto del bot puede mandar mensajes como la empresa.
    WHATSAPP_API_TOKEN: str = ""

    # Datos de infraestructura: sin valor por defecto a proposito, para no
    # publicar la IP ni el usuario reales del servidor en el codigo fuente.
    VPS_IP: str = ""
    SSH_KEY_PATH: str = "/root/.ssh/id_ed25519"
    SSH_USER: str = ""
    WG_CONFIG_PATH: str = "/etc/wireguard/wg0.conf"
    VPS_WG_PUBKEY: str = ""
    PHONE_CONTACTO: str = "990807069"
    BACKUP_DIR: str = "/backups"
    MEDIA_DIR: str = "/media"

    # Consulta automatica de nombres por documento (APIs Peru).
    # El token vive SOLO aqui: si el movil llamara directo al proveedor, el
    # token viajaria dentro del APK y cualquiera podria extraerlo.
    APISPERU_URL: str = "https://dniruc.apisperu.com/api/v1"
    APISPERU_TOKEN: str = ""
    # Cuota del plan gratuito. Al llegar al tope se deja de consultar y el
    # nombre se escribe a mano; el alta del cliente nunca falla por esto.
    CONSULTAS_LIMITE_MENSUAL: int = 1000
    # A partir de aqui se avisa que queda poco
    CONSULTAS_AVISO_DESDE: int = 950
    PRECIO_TV_ADICIONAL: float = 10.0
    DIAS_GRACIA: int = 3

    # Datos que salen impresos en el recibo de pago. Los que estan vacios no se
    # imprimen: es preferible un recibo sin RUC a uno con el RUC de otra empresa.
    # Se completan en el .env, sin tocar codigo.
    EMPRESA_NOMBRE: str = "WISP"
    EMPRESA_RUBRO: str = "Ingeniería en Redes y Telecomunicaciones"
    EMPRESA_RUC: str = ""
    EMPRESA_DIRECCION: str = ""
    EMPRESA_CIUDAD: str = "Juliaca - Puno - Perú"
    # Si la empresa atiende en dos números, se ponen separados por guion
    EMPRESA_TELEFONOS: str = "990807069"
    EMPRESA_CORREO: str = ""

    class Config:
        env_file = ".env"


settings = Settings()


def es_produccion() -> bool:
    return settings.ENTORNO.strip().lower() in ("produccion", "producción", "production", "prod")


def origenes_cors() -> list[str]:
    """Quien puede llamar a la API desde un navegador.

    En produccion la lista sale solo del .env: si se deja vacia, nadie puede
    entrar desde un navegador, que es preferible a dejar la puerta abierta
    sin que nadie se entere.
    """
    definidos = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if definidos:
        return definidos
    if es_produccion():
        return []
    # Desarrollo: solo la propia maquina (panel Vite, preview y Expo).
    return [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
        "http://localhost:8081", "http://localhost:19006",
    ]


# En produccion una clave de ejemplo no es un aviso: es una puerta abierta.
# Cualquiera que lea el codigo en GitHub podria firmar un token de admin.
_PROBLEMAS = []
if settings.SECRET_KEY == _DEFAULT_SECRET:
    _PROBLEMAS.append(
        "SECRET_KEY tiene el valor de ejemplo. Genera una con "
        "'openssl rand -hex 32' y ponla en el .env."
    )
if settings.DATABASE_URL == _DEFAULT_DATABASE_URL:
    _PROBLEMAS.append("DATABASE_URL tiene el valor de ejemplo. Apúntala a la base real en el .env.")
if es_produccion() and not settings.CORS_ORIGINS.strip():
    _PROBLEMAS.append("CORS_ORIGINS está vacío. Pon el dominio del panel en el .env.")

if _PROBLEMAS:
    if es_produccion():
        raise RuntimeError(
            "No se puede arrancar en producción con esta configuración:\n  - "
            + "\n  - ".join(_PROBLEMAS)
        )
    for p in _PROBLEMAS:
        logger.warning("⚠️  %s", p)
