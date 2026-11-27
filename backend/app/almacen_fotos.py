"""Guardado de fotos en disco, compartido por los módulos nuevos (unidades,
combustible, inventario). Misma idea que routers/evidencias.py: las fotos van
a MEDIA_DIR con un nombre al azar, y se sirven solo con sesión por un endpoint
dedicado — nunca se expone la ruta del disco al cliente."""
import os
import uuid

from fastapi import UploadFile, HTTPException

from .config import settings

# Solo imágenes para estas fotos (surtidor, boleta, carro, equipo). La boleta
# en papel se fotografía; no hace falta PDF aquí.
EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".webp"}

# Tope de tamaño para no llenar el disco con una foto gigante (8 MB).
_MAX_BYTES = 8 * 1024 * 1024


def guardar_imagen(archivo: UploadFile, subdir: str) -> str:
    """Valida y guarda una imagen bajo MEDIA_DIR/<subdir>/. Devuelve la ruta
    absoluta en disco (para guardar en la BD). Lanza HTTPException si algo falla."""
    ext = os.path.splitext(archivo.filename or "")[1].lower()
    if ext not in EXT_IMAGEN:
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes (jpg, png o webp)")

    datos = archivo.file.read()
    if not datos:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(datos) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="La imagen es muy grande (máximo 8 MB)")

    carpeta = os.path.join(settings.MEDIA_DIR, subdir)
    os.makedirs(carpeta, exist_ok=True)
    nombre = f"{uuid.uuid4().hex}{ext}"
    ruta = os.path.join(carpeta, nombre)
    with open(ruta, "wb") as f:
        f.write(datos)
    return ruta


def borrar_imagen(ruta: str | None) -> None:
    """Borra el archivo de disco si existe. Nunca lanza."""
    if not ruta:
        return
    try:
        if os.path.isfile(ruta):
            os.remove(ruta)
    except OSError:
        pass
