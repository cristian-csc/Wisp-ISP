"""Materiales de fibra: qué hay en el almacén y qué se mueve.

Los saldos NO se guardan: se calculan sumando `movimientos_material`. Toda
consulta de "cuánto queda" pasa por `_saldos()`, de modo que no hay dos
caminos que puedan dar respuestas distintas.

Qué suma y qué resta en el almacén:

    entrada     +   una compra
    devolucion  +   roseta o patch cord recuperados de un cliente
    entrega     −   salió con un técnico
    ajuste      ±   corrección de un cuadre (lo único que admite negativo)

El `consumo` no toca el almacén: descuenta del saldo del técnico, que es
quien ya tenía el material encima.
"""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, case, func
from typing import List, Optional
from decimal import Decimal
import re
import unicodedata

from ..database import get_db
from .. import models, schemas
from .auth import require_roles
from ..almacen_fotos import guardar_imagen, borrar_imagen

router = APIRouter()

# Quién puede mirar el almacén y quién puede moverlo. De momento ambos son
# del administrador; el día que haya un encargado de almacén se le delega
# desde Roles y módulos sin tocar este archivo.
solo_admin = require_roles(models.RolUsuario.admin)

# El efecto de cada tipo sobre el saldo del ALMACÉN.
EFECTO_ALMACEN = {
    "entrada": 1,
    "devolucion": 1,
    "entrega": -1,
    "ajuste": 1,      # ya viene con signo
    "consumo": 0,     # sale del saldo del técnico, no del almacén
}


def _saldos(db: Session) -> dict[int, Decimal]:
    """Lo que hay en el almacén, por material. Un único lugar que lo calcula."""
    signo = case(
        (models.MovimientoMaterial.tipo.in_(("entrada", "devolucion")), models.MovimientoMaterial.cantidad),
        (models.MovimientoMaterial.tipo == "entrega", -models.MovimientoMaterial.cantidad),
        # Un ajuste con tecnico corrige el conteo DE ESE TECNICO, no el del
        # almacen. Sin esta condicion un cuadre en la camioneta restaba de
        # los dos sitios a la vez y el almacen perdia material que nunca
        # salio de ahi.
        (and_(models.MovimientoMaterial.tipo == "ajuste",
              models.MovimientoMaterial.tecnico_id.is_(None)),
         models.MovimientoMaterial.cantidad),
        else_=0,
    )
    filas = (
        db.query(models.MovimientoMaterial.material_id, func.coalesce(func.sum(signo), 0))
        .group_by(models.MovimientoMaterial.material_id)
        .all()
    )
    return {material_id: Decimal(total) for material_id, total in filas}


def _saldos_tecnico(db: Session) -> dict[tuple[int, int], Decimal]:
    """Lo que lleva encima cada técnico: {(tecnico_id, material_id): cantidad}."""
    signo = case(
        (models.MovimientoMaterial.tipo == "entrega", models.MovimientoMaterial.cantidad),
        (models.MovimientoMaterial.tipo == "consumo", -models.MovimientoMaterial.cantidad),
        (models.MovimientoMaterial.tipo == "ajuste", models.MovimientoMaterial.cantidad),
        else_=0,
    )
    filas = (
        db.query(
            models.MovimientoMaterial.tecnico_id,
            models.MovimientoMaterial.material_id,
            func.coalesce(func.sum(signo), 0),
        )
        .filter(models.MovimientoMaterial.tecnico_id.isnot(None))
        .group_by(models.MovimientoMaterial.tecnico_id, models.MovimientoMaterial.material_id)
        .all()
    )
    return {(t, m): Decimal(total) for t, m, total in filas}


def _material_out(material: models.Material, saldo: Decimal) -> dict:
    return {
        "id": material.id,
        "clave": material.clave,
        "nombre": material.nombre,
        "unidad": material.unidad,
        "se_recupera": material.se_recupera,
        "consumo_estandar": material.consumo_estandar,
        "activo": material.activo,
        "en_almacen": saldo,
        "tiene_foto": bool(material.foto_ruta),
        "presentaciones": [
            {"id": p.id, "nombre": p.nombre, "equivale_a": p.equivale_a, "activo": p.activo}
            for p in material.presentaciones
            if p.activo
        ],
    }


@router.get("", response_model=List[schemas.MaterialOut])
def listar_materiales(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    saldos = _saldos(db)
    materiales = (
        db.query(models.Material)
        .options(joinedload(models.Material.presentaciones))
        .filter(models.Material.activo == True)  # noqa: E712
        .order_by(models.Material.id)
        .all()
    )
    return [_material_out(m, saldos.get(m.id, Decimal(0))) for m in materiales]


def _clave_desde(nombre: str) -> str:
    """Un identificador estable a partir del nombre escrito.

    La clave no se le pide a nadie: se deduce. Es lo que usan el codigo y los
    informes, asi que no debe llevar tildes ni espacios, y no cambia aunque
    luego se corrija el nombre visible.
    """
    base = unicodedata.normalize("NFKD", nombre.strip().lower())
    base = base.encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    return base[:40] or "material"


@router.post("", response_model=schemas.MaterialOut, status_code=201)
def crear_material(
    data: schemas.MaterialCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    clave = _clave_desde(data.nombre)
    if db.query(models.Material).filter(models.Material.clave == clave).first():
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe un material que se llama asi ({data.nombre}).",
        )

    nombres = [p.nombre.strip().lower() for p in data.presentaciones]
    if len(nombres) != len(set(nombres)):
        raise HTTPException(status_code=400, detail="Hay dos presentaciones con el mismo nombre.")

    material = models.Material(
        clave=clave,
        nombre=data.nombre.strip(),
        unidad=data.unidad,
        se_recupera=data.se_recupera,
        consumo_estandar=data.consumo_estandar,
        activo=True,
    )
    material.presentaciones = [
        models.MaterialPresentacion(nombre=p.nombre.strip(), equivale_a=p.equivale_a, activo=True)
        for p in data.presentaciones
    ]
    db.add(material)
    db.commit()
    db.refresh(material)
    return _material_out(material, Decimal(0))


@router.put("/{material_id}", response_model=schemas.MaterialOut)
def editar_material(
    material_id: int,
    data: schemas.MaterialUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    campos = data.model_dump(exclude_unset=True)
    if "nombre" in campos and campos["nombre"]:
        material.nombre = campos["nombre"].strip()
    if "se_recupera" in campos:
        material.se_recupera = campos["se_recupera"]
    if "consumo_estandar" in campos:
        material.consumo_estandar = campos["consumo_estandar"]
    if "activo" in campos:
        # Desactivar no borra: los movimientos viejos siguen contando y el
        # historial se sigue leyendo. Solo deja de ofrecerse al registrar.
        material.activo = campos["activo"]

    db.commit()
    db.refresh(material)
    return _material_out(material, _saldos(db).get(material.id, Decimal(0)))


# ── Foto de presentación del material ───────────────────────────────────────────
# Una foto representativa del producto (cable drop, conector, roseta…). No toca
# el stock ni los movimientos: es solo para reconocerlo de un vistazo. La imagen
# se guarda en disco y se sirve con sesión, nunca por ruta directa.

@router.post("/{material_id}/foto", response_model=schemas.MaterialOut)
def subir_foto_material(
    material_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    nueva = guardar_imagen(archivo, "materiales")
    anterior = material.foto_ruta
    material.foto_ruta = nueva
    db.commit()
    db.refresh(material)
    # Se borra la anterior solo después de confirmar la nueva, para no quedar sin
    # ninguna si algo falla a mitad.
    borrar_imagen(anterior)
    return _material_out(material, _saldos(db).get(material.id, Decimal(0)))


@router.get("/{material_id}/foto")
def ver_foto_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not material or not material.foto_ruta or not os.path.isfile(material.foto_ruta):
        raise HTTPException(status_code=404, detail="Sin foto")
    return FileResponse(material.foto_ruta)


@router.post("/{material_id}/presentaciones", response_model=schemas.MaterialPresentacionOut, status_code=201)
def agregar_presentacion(
    material_id: int,
    data: schemas.PresentacionInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    material = db.query(models.Material).filter(models.Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    nombre = data.nombre.strip()
    if any(p.nombre.strip().lower() == nombre.lower() for p in material.presentaciones):
        raise HTTPException(status_code=400, detail=f"«{nombre}» ya existe en este material.")

    presentacion = models.MaterialPresentacion(
        material_id=material.id, nombre=nombre, equivale_a=data.equivale_a, activo=True,
    )
    db.add(presentacion)
    db.commit()
    db.refresh(presentacion)
    return presentacion


@router.delete("/presentaciones/{presentacion_id}")
def quitar_presentacion(
    presentacion_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    """Quita una presentacion. Si ya se uso en alguna compra, se desactiva en
    vez de borrarse: el historial debe seguir pudiendo decir «entraron 2
    bobinas», y borrarla dejaria esas lineas sin explicacion."""
    presentacion = (
        db.query(models.MaterialPresentacion)
        .filter(models.MaterialPresentacion.id == presentacion_id)
        .first()
    )
    if not presentacion:
        raise HTTPException(status_code=404, detail="Presentación no encontrada")

    usada = (
        db.query(models.MovimientoMaterial)
        .filter(models.MovimientoMaterial.presentacion_id == presentacion_id)
        .count()
    )
    if usada:
        presentacion.activo = False
        db.commit()
        return {"ok": True, "desactivada": True,
                "detalle": f"Se usó en {usada} movimiento(s), así que se guarda para el historial "
                           "y deja de ofrecerse."}

    db.delete(presentacion)
    db.commit()
    return {"ok": True, "desactivada": False}


@router.post("/movimientos", response_model=schemas.MovimientoMaterialOut, status_code=201)
def registrar_movimiento(
    data: schemas.MovimientoMaterialCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    """Una entrada de almacén, una entrega a un técnico o un ajuste.

    El consumo no se registra aquí: lo genera el cierre de una instalación,
    con los datos que el técnico ya da en su app.
    """
    material = db.query(models.Material).filter(models.Material.id == data.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    if data.tipo not in ("entrada", "entrega", "devolucion", "ajuste"):
        raise HTTPException(status_code=400, detail="Ese tipo de movimiento no se registra desde aquí.")

    # Cuánto es, en la unidad en que se cuenta. Si vino por presentación se
    # traduce aquí: "2 bolsas" son 20 unidades.
    cantidad = Decimal(str(data.cantidad))
    presentacion = None
    if data.presentacion_id is not None:
        presentacion = (
            db.query(models.MaterialPresentacion)
            .filter(
                models.MaterialPresentacion.id == data.presentacion_id,
                models.MaterialPresentacion.material_id == material.id,
            )
            .first()
        )
        if not presentacion:
            raise HTTPException(status_code=400, detail="Esa presentación no es de este material.")
        cantidad = cantidad * Decimal(presentacion.equivale_a)

    if cantidad == 0:
        raise HTTPException(status_code=400, detail="La cantidad no puede ser cero.")
    if cantidad < 0 and data.tipo != "ajuste":
        raise HTTPException(
            status_code=400,
            detail="Solo un ajuste puede restar. Para sacar material del almacén usa una entrega.",
        )

    if data.tipo in ("entrega",):
        if data.tecnico_id is None:
            raise HTTPException(status_code=400, detail="Una entrega necesita decir a qué técnico.")
        tecnico = db.query(models.Usuario).filter(models.Usuario.id == data.tecnico_id).first()
        if not tecnico or tecnico.rol != models.RolUsuario.tecnico:
            raise HTTPException(status_code=400, detail="Ese usuario no es un técnico.")
        # No se entrega lo que no hay: el almacén quedaría en negativo y el
        # saldo dejaría de significar algo.
        disponible = _saldos(db).get(material.id, Decimal(0))
        if cantidad > disponible:
            raise HTTPException(
                status_code=400,
                detail=f"En almacén solo hay {disponible:g} {material.unidad}(s) de {material.nombre}.",
            )

    movimiento = models.MovimientoMaterial(
        material_id=material.id,
        tipo=data.tipo,
        cantidad=cantidad,
        tecnico_id=data.tecnico_id,
        presentacion_id=presentacion.id if presentacion else None,
        motivo=(data.motivo or None),
        registrado_por_id=current_user.id,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)
    return _movimiento_out(movimiento)


def _movimiento_out(m: models.MovimientoMaterial) -> dict:
    return {
        "id": m.id,
        "material_id": m.material_id,
        "material_nombre": m.material.nombre if m.material else None,
        "unidad": m.material.unidad if m.material else None,
        "tipo": m.tipo,
        "cantidad": m.cantidad,
        "tecnico_id": m.tecnico_id,
        "tecnico_nombre": m.tecnico.nombre if m.tecnico else None,
        "cliente_id": m.cliente_id,
        "presentacion": m.presentacion.nombre if m.presentacion else None,
        "motivo": m.motivo,
        "registrado_por": m.registrado_por.nombre if m.registrado_por else None,
        "creado_en": m.creado_en,
    }


@router.get("/movimientos", response_model=List[schemas.MovimientoMaterialOut])
def listar_movimientos(
    material_id: Optional[int] = None,
    limite: int = 100,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    query = db.query(models.MovimientoMaterial).options(
        joinedload(models.MovimientoMaterial.material),
        joinedload(models.MovimientoMaterial.tecnico),
        joinedload(models.MovimientoMaterial.registrado_por),
        joinedload(models.MovimientoMaterial.presentacion),
    )
    if material_id is not None:
        query = query.filter(models.MovimientoMaterial.material_id == material_id)
    movimientos = query.order_by(models.MovimientoMaterial.creado_en.desc()).limit(min(limite, 300)).all()
    return [_movimiento_out(m) for m in movimientos]


@router.get("/por-tecnico", response_model=List[schemas.SaldoTecnicoOut])
def saldos_por_tecnico(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    """Qué lleva encima cada técnico. Es la pregunta que este módulo existe
    para responder: el material no se pierde en el almacén, se pierde en la
    camioneta."""
    saldos = _saldos_tecnico(db)
    if not saldos:
        return []

    tecnicos = {
        u.id: u.nombre
        for u in db.query(models.Usuario)
        .filter(models.Usuario.id.in_({t for t, _ in saldos}))
        .all()
    }
    materiales = {
        m.id: m
        for m in db.query(models.Material)
        .filter(models.Material.id.in_({mat for _, mat in saldos}))
        .all()
    }

    salida = []
    for (tecnico_id, material_id), cantidad in sorted(saldos.items()):
        material = materiales.get(material_id)
        # Un saldo en cero no es noticia: lo entregado ya se gastó entero.
        if cantidad == 0 or material is None:
            continue
        salida.append({
            "tecnico_id": tecnico_id,
            "tecnico_nombre": tecnicos.get(tecnico_id, "—"),
            "material_id": material_id,
            "material_nombre": material.nombre,
            "unidad": material.unidad,
            "cantidad": cantidad,
        })
    return salida
