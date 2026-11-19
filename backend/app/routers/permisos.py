"""Roles y módulos: qué módulos tiene cada rol.

Lo marcado aquí es a la vez el menú y el permiso real de la API. La relación
entre módulos y endpoints está en app/acceso.py.
"""
import logging
import re
import unicodedata
from collections import defaultdict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .. import acceso, models, schemas
from ..config import settings
from ..database import get_db
from .auth import (
    get_current_cliente,
    oauth2_scheme,
    require_roles,
    rol_de_la_cuenta,
    usuario_del_token,
)

router = APIRouter()
logger = logging.getLogger(__name__)

ROL_CLIENTE = "cliente"
# Sin este módulo el administrador ya no podría corregir los permisos.
MODULO_INTOCABLE = "panel.roles"
# Lo que cabe en la barra inferior: dos a cada lado y el botón central.
MAXIMO_EN_BARRA = 5
# La pantalla a la que llega todo el personal al entrar.
MODULO_DE_INICIO = "panel.dashboard"

solo_admin = require_roles(models.RolUsuario.admin)


def _disponible_para(rol: models.Rol, modulo: models.Modulo) -> bool:
    """¿Este rol puede tener este módulo y usarlo de verdad?"""
    return acceso.modulo_disponible(modulo.clave, rol.perfil_base)


def _es_fijo(rol: models.Rol, modulo: models.Modulo) -> bool:
    """Módulos que este rol no puede perder."""
    if modulo.clave == MODULO_DE_INICIO:
        return True
    return rol.es_superadmin and modulo.clave == MODULO_INTOCABLE


def _rol_de_la_sesion(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[models.Rol]:
    """El rol de quien pregunta, sea personal de la empresa o cliente: cada
    uno entra con un token distinto."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("role") == ROL_CLIENTE:
        get_current_cliente(token, db)
        return db.query(models.Rol).filter(models.Rol.clave == ROL_CLIENTE).first()
    return rol_de_la_cuenta(db, usuario_del_token(token, db))


def _por_que_no_puede_cambiar(
    db: Session,
    rol: models.Rol,
    modulo: models.Modulo,
    asignacion: Optional[models.RolModulo],
    activo: bool,
) -> Optional[str]:
    """El motivo por el que este cambio no se permite, o None si se puede."""
    if activo:
        if not _disponible_para(rol, modulo):
            return f"«{modulo.nombre}» no está disponible para el rol {rol.nombre}."
        if modulo.plataforma == "movil":
            en_barra = (
                db.query(func.count(models.RolModulo.modulo_id))
                .join(models.Modulo, models.Modulo.id == models.RolModulo.modulo_id)
                .filter(models.RolModulo.rol_id == rol.id, models.Modulo.plataforma == "movil")
                .scalar()
            )
            if en_barra >= MAXIMO_EN_BARRA:
                return f"La barra de la app admite {MAXIMO_EN_BARRA} módulos. Quita uno antes de agregar otro."
        return None

    if modulo.clave == MODULO_DE_INICIO:
        return f"«{modulo.nombre}» es la pantalla de inicio y no se puede quitar."
    if _es_fijo(rol, modulo):
        return f"El {rol.nombre} necesita «{modulo.nombre}» para poder corregir los permisos."
    if asignacion is not None and asignacion.es_central:
        return f"«{modulo.nombre}» es el botón central de la app de este rol."
    return None


@router.get("/mis-modulos", response_model=schemas.MisModulosOut)
def mis_modulos(
    plataforma: Optional[Literal["panel", "movil"]] = None,
    rol: Optional[models.Rol] = Depends(_rol_de_la_sesion),
    db: Session = Depends(get_db),
):
    """Los módulos que le tocan a quien pregunta, en el orden en que se muestran."""
    if rol is None:
        raise HTTPException(status_code=404, detail="Tu rol no está configurado")

    consulta = (
        db.query(models.Modulo, models.RolModulo)
        .options(joinedload(models.Modulo.padre))
        .join(models.RolModulo, models.RolModulo.modulo_id == models.Modulo.id)
        .filter(models.RolModulo.rol_id == rol.id, models.Modulo.activo.is_(True))
    )
    if plataforma:
        consulta = consulta.filter(models.Modulo.plataforma == plataforma)

    # Los grupos van en el orden de Módulos padre; dentro de cada grupo, y en
    # la barra de la app, manda el orden elegido para el rol.
    filas = sorted(
        consulta.all(),
        key=lambda f: (
            f[0].plataforma,
            f[0].padre.orden if f[0].plataforma == "panel" else 0,
            f[1].orden,
        ),
    )
    return {
        "rol": rol,
        "modulos": [
            {
                "clave": m.clave, "nombre": m.nombre, "grupo": m.padre.nombre,
                "grupo_id": m.modulo_padre_id, "grupo_icono": m.padre.icono,
                "plataforma": m.plataforma, "ruta": m.ruta, "icono": m.icono,
                "es_central": rm.es_central,
            }
            for m, rm in filas
        ],
    }


@router.get("/roles", response_model=list[schemas.RolConCuentasOut])
def listar_roles(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(solo_admin),
):
    cuentas = dict(
        db.query(models.Usuario.rol_id, func.count(models.Usuario.id))
        .filter(models.Usuario.activo.is_(True))
        .group_by(models.Usuario.rol_id)
        .all()
    )
    modulos = dict(
        db.query(models.RolModulo.rol_id, func.count(models.RolModulo.modulo_id))
        .join(models.Modulo, models.Modulo.id == models.RolModulo.modulo_id)
        .filter(models.Modulo.activo.is_(True))
        .group_by(models.RolModulo.rol_id)
        .all()
    )
    return [
        {
            "id": r.id, "clave": r.clave, "nombre": r.nombre, "descripcion": r.descripcion,
            "es_superadmin": r.es_superadmin, "es_sistema": r.es_sistema,
            "perfil_base": r.perfil_base,
            "cuentas_activas": None if r.clave == ROL_CLIENTE else cuentas.get(r.id, 0),
            "total_modulos": modulos.get(r.id, 0),
        }
        for r in db.query(models.Rol).order_by(models.Rol.id).all()
    ]


def _clave_nueva(db: Session, nombre: str) -> str:
    """Una clave única a partir del nombre: «Caja Norte» pasa a caja_norte."""
    sin_tildes = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "_", sin_tildes.lower()).strip("_")[:40] or "rol"
    clave, numero = base, 2
    while db.query(models.Rol.id).filter(models.Rol.clave == clave).first():
        clave, numero = f"{base}_{numero}", numero + 1
    return clave


def _nombre_ocupado(db: Session, nombre: str, excepto: Optional[int] = None) -> bool:
    consulta = db.query(models.Rol.id).filter(func.lower(models.Rol.nombre) == nombre.lower())
    if excepto is not None:
        consulta = consulta.filter(models.Rol.id != excepto)
    return consulta.first() is not None


def _rol_como_fila(db: Session, rol: models.Rol) -> dict:
    cuentas = (
        db.query(func.count(models.Usuario.id))
        .filter(models.Usuario.rol_id == rol.id, models.Usuario.activo.is_(True))
        .scalar()
    )
    total = db.query(func.count(models.RolModulo.modulo_id)).filter(models.RolModulo.rol_id == rol.id).scalar()
    return {
        "id": rol.id, "clave": rol.clave, "nombre": rol.nombre, "descripcion": rol.descripcion,
        "es_superadmin": rol.es_superadmin, "es_sistema": rol.es_sistema,
        "perfil_base": rol.perfil_base, "cuentas_activas": cuentas, "total_modulos": total,
    }


@router.post("/roles", response_model=schemas.RolConCuentasOut, status_code=201)
def crear_rol(
    data: schemas.RolCrear,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    if _nombre_ocupado(db, data.nombre):
        raise HTTPException(status_code=409, detail=f"Ya existe un rol llamado «{data.nombre}».")
    rol = models.Rol(
        clave=_clave_nueva(db, data.nombre),
        nombre=data.nombre,
        descripcion=(data.descripcion or "").strip() or None,
        perfil_base=data.perfil_base,
    )
    db.add(rol)
    db.flush()
    inicio = db.query(models.Modulo).filter(models.Modulo.clave == MODULO_DE_INICIO).first()
    if inicio is not None:
        db.add(models.RolModulo(rol_id=rol.id, modulo_id=inicio.id, orden=1))
    db.commit()
    db.refresh(rol)
    logger.warning("Permisos — creó el rol %s, hecho por %s (id %d)", rol.clave, current_user.email, current_user.id)
    return _rol_como_fila(db, rol)


@router.put("/roles/{rol_id}", response_model=schemas.RolConCuentasOut)
def editar_rol(
    rol_id: int,
    data: schemas.RolEditar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    cambios = data.model_dump(exclude_unset=True)
    nombre = cambios.get("nombre")
    if nombre is not None and nombre != rol.nombre:
        if rol.es_sistema:
            raise HTTPException(status_code=409, detail="El nombre de un rol del sistema no se puede cambiar.")
        if _nombre_ocupado(db, nombre, excepto=rol.id):
            raise HTTPException(status_code=409, detail=f"Ya existe un rol llamado «{nombre}».")
        rol.nombre = nombre
    if "descripcion" in cambios:
        rol.descripcion = (cambios["descripcion"] or "").strip() or None
    db.commit()
    db.refresh(rol)
    logger.warning("Permisos — editó el rol %s, hecho por %s (id %d)", rol.clave, current_user.email, current_user.id)
    return _rol_como_fila(db, rol)


@router.delete("/roles/{rol_id}")
def eliminar_rol(
    rol_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.es_sistema:
        raise HTTPException(status_code=409, detail="Los roles del sistema no se pueden eliminar.")
    cuentas = db.query(func.count(models.Usuario.id)).filter(models.Usuario.rol_id == rol.id).scalar()
    if cuentas:
        raise HTTPException(
            status_code=409,
            detail=f"Este rol tiene {cuentas} cuenta(s). Pásalas a otro rol antes de eliminarlo.",
        )
    clave = rol.clave
    db.delete(rol)
    db.commit()
    logger.warning("Permisos — eliminó el rol %s, hecho por %s (id %d)", clave, current_user.email, current_user.id)
    return {"ok": True}


@router.get("/modulos", response_model=list[schemas.ModuloConRolesOut])
def listar_modulos(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(solo_admin),
):
    asignaciones = defaultdict(list)
    for a in db.query(models.RolModulo).order_by(models.RolModulo.orden).all():
        asignaciones[a.modulo_id].append(a)
    roles = db.query(models.Rol).order_by(models.Rol.id).all()
    modulos = (
        db.query(models.Modulo)
        .options(joinedload(models.Modulo.padre))
        .join(models.ModuloPadre, models.ModuloPadre.id == models.Modulo.modulo_padre_id)
        .filter(models.Modulo.activo.is_(True))
        .order_by(models.Modulo.plataforma.desc(), models.ModuloPadre.orden, models.Modulo.orden)
        .all()
    )
    return [
        {
            "id": m.id, "clave": m.clave, "nombre": m.nombre, "grupo": m.padre.nombre,
            "modulo_padre_id": m.modulo_padre_id,
            "plataforma": m.plataforma, "audiencia": m.audiencia, "ruta": m.ruta,
            "icono": m.icono, "orden": m.orden, "asignaciones": asignaciones[m.id],
            "roles_disponibles": [r.id for r in roles if _disponible_para(r, m)],
            "roles_fijos": [r.id for r in roles if _disponible_para(r, m) and _es_fijo(r, m)],
        }
        for m in modulos
    ]


# ── Módulos padre: los grupos del menú ─────────────────────────────────────

def _padre_o_404(db: Session, padre_id: int) -> models.ModuloPadre:
    padre = db.query(models.ModuloPadre).filter(models.ModuloPadre.id == padre_id).first()
    if padre is None:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    return padre


def _nombre_de_padre_ocupado(db: Session, nombre: str, plataforma: str, excepto: Optional[int] = None) -> bool:
    consulta = db.query(models.ModuloPadre.id).filter(
        func.lower(models.ModuloPadre.nombre) == nombre.lower(),
        models.ModuloPadre.plataforma == plataforma,
    )
    if excepto is not None:
        consulta = consulta.filter(models.ModuloPadre.id != excepto)
    return consulta.first() is not None


def _padres(db: Session, plataforma: str) -> list[models.ModuloPadre]:
    padres = (
        db.query(models.ModuloPadre)
        .options(joinedload(models.ModuloPadre.modulos))
        .filter(models.ModuloPadre.plataforma == plataforma)
        .order_by(models.ModuloPadre.orden, models.ModuloPadre.id)
        .all()
    )
    for padre in padres:
        padre.modulos = sorted((m for m in padre.modulos if m.activo), key=lambda m: m.orden)
    return padres


@router.get("/modulos-padre", response_model=list[schemas.ModuloPadreOut])
def listar_modulos_padre(
    plataforma: Literal["panel", "movil"] = "panel",
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(solo_admin),
):
    resultado = [schemas.ModuloPadreOut.model_validate(p) for p in _padres(db, plataforma)]
    db.expire_all()
    return resultado


@router.post("/modulos-padre", response_model=schemas.ModuloPadreOut, status_code=201)
def crear_modulo_padre(
    data: schemas.ModuloPadreCrear,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    if _nombre_de_padre_ocupado(db, data.nombre, data.plataforma):
        raise HTTPException(status_code=409, detail=f"Ya existe un grupo llamado «{data.nombre}».")
    ultimo = (
        db.query(func.max(models.ModuloPadre.orden))
        .filter(models.ModuloPadre.plataforma == data.plataforma)
        .scalar()
    )
    padre = models.ModuloPadre(
        nombre=data.nombre, icono=data.icono, plataforma=data.plataforma, orden=(ultimo or 0) + 1,
    )
    db.add(padre)
    db.commit()
    db.refresh(padre)
    logger.warning("Permisos — creó el grupo %s, hecho por %s (id %d)", padre.nombre, current_user.email, current_user.id)
    return padre


@router.put("/modulos-padre/orden", response_model=list[schemas.ModuloPadreOut])
def ordenar_modulos_padre(
    data: schemas.OrdenPadres,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    padres = {
        p.id: p
        for p in db.query(models.ModuloPadre).filter(models.ModuloPadre.plataforma == data.plataforma).all()
    }
    if len(data.padre_ids) != len(set(data.padre_ids)) or set(data.padre_ids) != set(padres):
        raise HTTPException(
            status_code=409,
            detail="Los grupos cambiaron. Vuelve a cargar la página e inténtalo otra vez.",
        )
    for posicion, padre_id in enumerate(data.padre_ids, start=1):
        padres[padre_id].orden = posicion
    db.commit()
    logger.warning("Permisos — cambió el orden de los grupos, hecho por %s (id %d)", current_user.email, current_user.id)
    resultado = [schemas.ModuloPadreOut.model_validate(p) for p in _padres(db, data.plataforma)]
    db.expire_all()
    return resultado


@router.put("/modulos-padre/{padre_id}", response_model=schemas.ModuloPadreOut)
def editar_modulo_padre(
    padre_id: int,
    data: schemas.ModuloPadreEditar,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    padre = _padre_o_404(db, padre_id)
    cambios = data.model_dump(exclude_unset=True)
    nombre = cambios.get("nombre")
    if nombre is not None and _nombre_de_padre_ocupado(db, nombre, padre.plataforma, excepto=padre.id):
        raise HTTPException(status_code=409, detail=f"Ya existe un grupo llamado «{nombre}».")
    for campo, valor in cambios.items():
        setattr(padre, campo, valor)
    db.commit()
    db.refresh(padre)
    logger.warning("Permisos — editó el grupo %s, hecho por %s (id %d)", padre.nombre, current_user.email, current_user.id)
    return padre


@router.delete("/modulos-padre/{padre_id}")
def eliminar_modulo_padre(
    padre_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    padre = _padre_o_404(db, padre_id)
    total = db.query(func.count(models.Modulo.id)).filter(models.Modulo.modulo_padre_id == padre.id).scalar()
    if total:
        raise HTTPException(
            status_code=409,
            detail=f"«{padre.nombre}» tiene {total} módulo(s). Muévelos a otro grupo antes de eliminarlo.",
        )
    nombre = padre.nombre
    db.delete(padre)
    db.commit()
    logger.warning("Permisos — eliminó el grupo %s, hecho por %s (id %d)", nombre, current_user.email, current_user.id)
    return {"ok": True}


@router.put("/modulos/{modulo_id}/padre")
def mover_modulo(
    modulo_id: int,
    data: schemas.MoverModulo,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    modulo = db.query(models.Modulo).filter(models.Modulo.id == modulo_id).first()
    if modulo is None:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    padre = _padre_o_404(db, data.modulo_padre_id)
    if padre.plataforma != modulo.plataforma:
        raise HTTPException(status_code=409, detail="Ese grupo pertenece a otra plataforma.")
    modulo.modulo_padre_id = padre.id
    db.commit()
    logger.warning("Permisos — movió %s al grupo %s, hecho por %s (id %d)", modulo.clave, padre.nombre, current_user.email, current_user.id)
    return {"modulo_id": modulo.id, "modulo_padre_id": padre.id}


@router.put("/roles/{rol_id}/orden", response_model=schemas.OrdenModulosOut)
def ordenar_modulos(
    rol_id: int,
    data: schemas.OrdenModulos,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    """Guarda el orden en que este rol ve sus módulos. La lista debe traer
    todos los que tiene: si no coincide, otra persona los cambió mientras
    tanto y hay que volver a cargar antes de ordenar."""
    rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado")

    asignaciones = {
        a.modulo_id: a
        for a in (
            db.query(models.RolModulo)
            .join(models.Modulo, models.Modulo.id == models.RolModulo.modulo_id)
            .filter(models.RolModulo.rol_id == rol.id, models.Modulo.plataforma == data.plataforma)
            .all()
        )
    }
    if len(data.modulo_ids) != len(set(data.modulo_ids)) or set(data.modulo_ids) != set(asignaciones):
        raise HTTPException(
            status_code=409,
            detail="Los módulos de este rol cambiaron. Vuelve a cargar la página e inténtalo otra vez.",
        )

    for posicion, modulo_id in enumerate(data.modulo_ids, start=1):
        asignaciones[modulo_id].orden = posicion
    db.commit()

    logger.warning(
        "Permisos — cambió el orden de %s del rol %s, hecho por %s (id %d)",
        data.plataforma, rol.clave, current_user.email, current_user.id,
    )
    return {"rol_id": rol.id, "plataforma": data.plataforma, "modulo_ids": data.modulo_ids}


@router.put("/roles/{rol_id}/modulos/{modulo_id}", response_model=schemas.CambioModuloOut)
def cambiar_modulo(
    rol_id: int,
    modulo_id: int,
    data: schemas.CambioModulo,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(solo_admin),
):
    """Da o quita un solo módulo. Uno por uno, y no la lista entera, para que
    dos personas con la pantalla abierta no se pisen los cambios."""
    rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    modulo = (
        db.query(models.Modulo)
        .filter(models.Modulo.id == modulo_id, models.Modulo.activo.is_(True))
        .first()
    )
    if modulo is None:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")

    asignacion = db.get(models.RolModulo, (rol.id, modulo.id))
    respuesta = {"rol_id": rol.id, "modulo_id": modulo.id, "activo": data.activo}
    if (asignacion is not None) == data.activo:
        return respuesta

    motivo = _por_que_no_puede_cambiar(db, rol, modulo, asignacion, data.activo)
    if motivo:
        raise HTTPException(status_code=409, detail=motivo)

    if data.activo:
        ultimo = (
            db.query(func.max(models.RolModulo.orden))
            .filter(models.RolModulo.rol_id == rol.id)
            .scalar()
        )
        db.add(models.RolModulo(rol_id=rol.id, modulo_id=modulo.id, orden=(ultimo or 0) + 1))
    else:
        db.delete(asignacion)

    try:
        db.commit()
    except IntegrityError:
        # Otra persona hizo el mismo cambio en ese mismo instante.
        db.rollback()
        return respuesta

    logger.warning(
        "Permisos — %s el módulo %s %s rol %s, hecho por %s (id %d)",
        "dio" if data.activo else "quitó", modulo.clave,
        "al" if data.activo else "del", rol.clave, current_user.email, current_user.id,
    )
    return respuesta
