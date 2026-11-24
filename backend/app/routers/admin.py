import gzip
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.engine.url import make_url

from ..config import settings
from .auth import get_current_user, require_roles
from .. import models

router = APIRouter()


# Los respaldos nuevos se llaman "wisp_...". Los anteriores se llamaban
# "tuxtell_..." y siguen en el disco, así que se siguen listando y
# descargando: cambiar el nombre no debe dejar inaccesible un respaldo viejo.
PREFIJO_BACKUP = "wisp_"
PREFIJOS_ACEPTADOS = ("wisp_", "tuxtell_")


def _backup_dir() -> Path:
    p = Path(settings.BACKUP_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _todos_los_backups(backup_dir: Path) -> list[Path]:
    archivos: list[Path] = []
    for prefijo in PREFIJOS_ACEPTADOS:
        archivos.extend(backup_dir.glob(f"{prefijo}*.sql.gz"))
    return sorted(archivos, key=lambda p: p.stat().st_mtime)


COPIAS_QUE_SE_GUARDAN = 7

# pg_dump de una base de un WISP tarda segundos, no minutos. El tope existe
# para que un pg_dump colgado -- la base bloqueada por otra cosa, el disco
# lleno -- no deje el proceso esperando para siempre, no para acotar un dump
# normal. Media hora es holgado a propósito: cortar un respaldo por impaciencia
# es peor que esperar.
SEGUNDOS_MAXIMOS = 1800


def hacer_backup() -> dict:
    """Un respaldo comprimido de la base, en BACKUP_DIR.

    Separado del endpoint porque lo llaman dos: el botón del panel y el
    trabajo nocturno del planificador. Devuelve {filename, size_kb, ruta} y
    lanza RuntimeError con el motivo si falla — quien llama decide si eso es
    un 500, una línea en el log o una alerta.
    """
    backup_dir = _backup_dir()
    db_url = make_url(settings.DATABASE_URL)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{PREFIJO_BACKUP}{timestamp}.sql.gz"
    filepath = backup_dir / filename

    # Un entorno mínimo y explícito, no una copia del del proceso: ahí viven
    # SECRET_KEY, el token de WhatsApp y el de APIs Perú, y pg_dump no tiene
    # nada que hacer con ellos.
    env = {
        'PGPASSWORD': db_url.password or '',
        'PATH': os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin'),
        'LANG': os.environ.get('LANG', 'C.UTF-8'),
    }

    dump_cmd = [
        'pg_dump',
        '-h', db_url.host,
        '-p', str(db_url.port or 5432),
        '-U', db_url.username,
        '-d', db_url.database,
        '--no-password',
    ]

    try:
        # Se comprime sobre la marcha en vez de juntar el volcado entero en
        # memoria y comprimirlo después. Con la base de hoy cabe de sobra, pero
        # esto ahora corre solo cada noche y crece con los clientes: el día que
        # no cupiera, el fallo sería que el contenedor muere de madrugada sin
        # que nadie lo mire.
        with gzip.open(filepath, 'wb') as gz:
            proceso = subprocess.Popen(
                dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
            )
            shutil.copyfileobj(proceso.stdout, gz)
            proceso.stdout.close()
            _, err = proceso.communicate(timeout=SEGUNDOS_MAXIMOS)
        if proceso.returncode != 0:
            raise RuntimeError(err.decode(errors="ignore").strip() or f"pg_dump salió con {proceso.returncode}")
    except Exception as e:
        # Un respaldo a medias es peor que ninguno: parece válido en la lista.
        if filepath.exists():
            filepath.unlink()
        raise RuntimeError(str(e)) from e

    size_kb = filepath.stat().st_size // 1024

    for viejo in _todos_los_backups(backup_dir)[:-COPIAS_QUE_SE_GUARDAN]:
        viejo.unlink()

    return {"filename": filename, "size_kb": size_kb, "ruta": str(filepath)}


@router.post("/backup")
def crear_backup(current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin))):
    try:
        resultado = hacer_backup()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Error de backup: {e}")
    return {"filename": resultado["filename"], "size_kb": resultado["size_kb"]}


@router.get("/backups/download/{filename}")
def descargar_backup(filename: str, current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin))):
    # El nombre tiene que ser exactamente un respaldo de esta carpeta: sin
    # barras ni '..', para que nadie pueda pedir un archivo de otro sitio.
    if (not filename.startswith(PREFIJOS_ACEPTADOS) or not filename.endswith('.sql.gz')
            or "/" in filename or "\\" in filename or ".." in filename):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    filepath = Path(settings.BACKUP_DIR) / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    return FileResponse(path=str(filepath), filename=filename, media_type='application/gzip')


@router.get("/backups")
def listar_backups(current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin))):
    backup_dir = _backup_dir()
    files = list(reversed(_todos_los_backups(backup_dir)))
    return [
        {
            "filename": f.name,
            "size_kb": f.stat().st_size // 1024,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in files[:20]
    ]
