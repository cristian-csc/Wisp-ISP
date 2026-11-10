import logging
import secrets
import string

from sqlalchemy.orm import Session
from passlib.context import CryptContext
from . import models
from .config import settings

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _password_inicial() -> tuple[str, bool]:
    """La contraseña del primer administrador.

    Sale de ADMIN_INICIAL_PASSWORD en el .env. Si no está definida se inventa
    una al azar y se escribe UNA sola vez en el log de arranque: así nunca
    existe una contraseña conocida escrita en el código, que es lo que pasaba
    antes (cualquiera que leyera el repositorio la sabía).
    """
    definida = settings.ADMIN_INICIAL_PASSWORD.strip()
    if definida:
        return definida, False
    alfabeto = string.ascii_letters + string.digits
    return "".join(secrets.choice(alfabeto) for _ in range(16)), True


def seed_initial_data(db: Session):
    """Lo ÚNICO que el sistema crea solo: el primer administrador.

    Antes también inventaba 4 planes y 3 zonas de ejemplo (Cabanillas, Palca,
    Paratia, con routers e IPs falsos). Se quitó el 2026-11-10: en una
    instalación de verdad esos datos son una trampa, porque parecen reales y
    nadie sabe que los puso el sistema. El riesgo concreto: asignarle un
    cliente a una zona que no existe, o darle de alta con un plan cuya
    velocidad no es la que se le vendió.

    Planes y zonas los carga la empresa desde el panel, con sus datos reales.
    """
    # Primer administrador — solo si la base está completamente vacía de
    # usuarios. Nunca se toca una instalación que ya tiene gente dentro.
    if db.query(models.Usuario).count() == 0:
        clave, generada = _password_inicial()
        admin = models.Usuario(
            nombre="Administrador",
            email=settings.ADMIN_INICIAL_EMAIL,
            hashed_password=pwd_context.hash(clave),
            rol=models.RolUsuario.admin,
        )
        db.add(admin)
        db.commit()
        if generada:
            logger.warning(
                "\n%s\n  PRIMER ARRANQUE — se creó el administrador '%s'\n"
                "  Contraseña generada: %s\n"
                "  Anótala y cámbiala al entrar. No se volverá a mostrar.\n%s",
                "=" * 66, settings.ADMIN_INICIAL_EMAIL, clave, "=" * 66,
            )
        else:
            logger.info(
                "Administrador inicial '%s' creado con la contraseña de ADMIN_INICIAL_PASSWORD.",
                settings.ADMIN_INICIAL_EMAIL,
            )
