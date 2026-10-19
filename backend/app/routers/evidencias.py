import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from .. import models, schemas
from .auth import get_current_user, require_roles
from ..config import settings

router = APIRouter()

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


@router.get("", response_model=List[schemas.EvidenciaOut])
def list_evidencias(
    averia_id: Optional[int] = Query(None),
    cliente_id: Optional[int] = Query(None),
    orden_retiro_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Evidencia)
    if averia_id:
        query = query.filter(models.Evidencia.averia_id == averia_id)
    if cliente_id:
        query = query.filter(models.Evidencia.cliente_id == cliente_id)
    if orden_retiro_id:
        query = query.filter(models.Evidencia.orden_retiro_id == orden_retiro_id)
    return query.order_by(models.Evidencia.creado_en.desc()).all()


@router.post("", response_model=schemas.EvidenciaOut, status_code=201)
def upload_evidencia(
    tipo: models.TipoEvidencia = Form(...),
    archivo: UploadFile = File(...),
    averia_id: Optional[int] = Form(None),
    cliente_id: Optional[int] = Form(None),
    orden_retiro_id: Optional[int] = Form(None),
    descripcion: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not averia_id and not cliente_id and not orden_retiro_id:
        raise HTTPException(status_code=400, detail="Debe indicar averia_id, cliente_id u orden_retiro_id")

    ext = os.path.splitext(archivo.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido (solo imágenes o PDF)")

    subdir = "retiros" if orden_retiro_id else ("averias" if averia_id else "clientes")
    target_dir = os.path.join(settings.MEDIA_DIR, "evidencias", subdir)
    os.makedirs(target_dir, exist_ok=True)
    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    ruta_completa = os.path.join(target_dir, nombre_archivo)

    with open(ruta_completa, "wb") as f:
        f.write(archivo.file.read())

    evidencia = models.Evidencia(
        averia_id=averia_id,
        cliente_id=cliente_id,
        orden_retiro_id=orden_retiro_id,
        tipo=tipo,
        ruta_archivo=ruta_completa,
        descripcion=descripcion,
        subido_por_id=current_user.id,
    )
    db.add(evidencia)
    db.commit()
    db.refresh(evidencia)
    return evidencia


@router.get("/{evidencia_id}/archivo")
def descargar_evidencia(
    evidencia_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    evidencia = db.query(models.Evidencia).filter(models.Evidencia.id == evidencia_id).first()
    if not evidencia or not os.path.isfile(evidencia.ruta_archivo):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(evidencia.ruta_archivo)


@router.delete("/{evidencia_id}", status_code=204)
def eliminar_evidencia(
    evidencia_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Borra una foto subida por error — el registro y el archivo en disco."""
    evidencia = db.query(models.Evidencia).filter(models.Evidencia.id == evidencia_id).first()
    if not evidencia:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    if os.path.isfile(evidencia.ruta_archivo):
        try:
            os.remove(evidencia.ruta_archivo)
        except OSError:
            pass
    db.delete(evidencia)
    db.commit()
