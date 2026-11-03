import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "changeme-dev-only-secret-key"
_DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"


class Settings(BaseSettings):
    DATABASE_URL: str = _DEFAULT_DATABASE_URL
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    WHATSAPP_API_URL: str = "http://127.0.0.1:3001"
    VPS_IP: str = "161.132.48.127"
    SSH_KEY_PATH: str = "/root/.ssh/tuxtell_key"
    SSH_USER: str = "tuxtell-api"
    WG_CONFIG_PATH: str = "/etc/wireguard/wg0.conf"
    VPS_WG_PUBKEY: str = "z5ErxfupttwgB5L0AA2C+AzRAFwy4N1ZCVvKGRyV5TI="
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

    # Datos que salen impresos en el recibo de pago. Vienen del recibo que la
    # empresa ya usaba; si alguno cambia, se corrige en el .env sin tocar codigo.
    EMPRESA_NOMBRE: str = "REDJULIACA"
    EMPRESA_RUC: str = "20610944257"
    EMPRESA_DIRECCION: str = "JR. SAN MARTIN 726"
    EMPRESA_CIUDAD: str = "PERU - SAN ROMAN - JULIACA"
    EMPRESA_TELEFONOS: str = "990807069 - 931090909"
    EMPRESA_CORREO: str = "redjuliaca051@gmail.com"

    class Config:
        env_file = ".env"


settings = Settings()

if settings.SECRET_KEY == _DEFAULT_SECRET:
    logger.warning(
        "⚠️  SECRET_KEY usa el valor por defecto. "
        "Define SECRET_KEY en el archivo .env con una clave aleatoria larga."
    )

if settings.DATABASE_URL == _DEFAULT_DATABASE_URL:
    logger.warning(
        "⚠️  DATABASE_URL usa el valor por defecto. "
        "Define DATABASE_URL en el archivo .env apuntando a la base real."
    )
