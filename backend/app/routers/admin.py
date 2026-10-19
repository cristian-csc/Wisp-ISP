import os
import subprocess
import gzip
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.engine.url import make_url

from ..config import settings
from .auth import get_current_user
from .. import models

router = APIRouter()


def _backup_dir() -> Path:
    p = Path(settings.BACKUP_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.post("/backup")
def crear_backup(current_user: models.Usuario = Depends(get_current_user)):
    backup_dir = _backup_dir()
    db_url = make_url(settings.DATABASE_URL)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"tuxtell_{timestamp}.sql.gz"
    filepath = backup_dir / filename

    env = os.environ.copy()
    env['PGPASSWORD'] = db_url.password or ''

    dump_cmd = [
        'pg_dump',
        '-h', db_url.host,
        '-p', str(db_url.port or 5432),
        '-U', db_url.username,
        '-d', db_url.database,
        '--no-password',
    ]

    try:
        result = subprocess.run(dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode().strip())
        with gzip.open(filepath, 'wb') as gz:
            gz.write(result.stdout)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"pg_dump falló: {e}")
    except Exception as e:
        if filepath.exists():
            filepath.unlink()
        raise HTTPException(status_code=500, detail=f"Error de backup: {e}")

    size_kb = filepath.stat().st_size // 1024

    all_backups = sorted(backup_dir.glob('tuxtell_*.sql.gz'), key=lambda p: p.stat().st_mtime)
    for old in all_backups[:-7]:
        old.unlink()

    return {"filename": filename, "size_kb": size_kb}


@router.get("/backups/download/{filename}")
def descargar_backup(filename: str, current_user: models.Usuario = Depends(get_current_user)):
    if not filename.startswith('tuxtell_') or not filename.endswith('.sql.gz') or '/' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    filepath = Path(settings.BACKUP_DIR) / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    return FileResponse(path=str(filepath), filename=filename, media_type='application/gzip')


@router.get("/backups")
def listar_backups(current_user: models.Usuario = Depends(get_current_user)):
    backup_dir = _backup_dir()
    files = sorted(backup_dir.glob('tuxtell_*.sql.gz'), key=lambda p: p.stat().st_mtime, reverse=True)
    return [
        {
            "filename": f.name,
            "size_kb": f.stat().st_size // 1024,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in files[:20]
    ]
