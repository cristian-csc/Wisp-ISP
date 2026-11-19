"""Inventario de materiales: stock del almacén, mínimo para reponer y cada
entrada o salida con quién la registró, a quién se le entregó y a qué hora.

El almacén guarda su stock en el propio artículo. Lo que tiene en mano cada
técnico o vendedora no se guarda aparte: sale de sumar sus asignaciones y
restar sus devoluciones y consumos, así nunca se descuadra con el historial.
"""
import uuid
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user, require_roles

router = APIRouter()

Tipo = models.TipoMovimientoInventario
GESTIONAR = require_roles(models.RolUsuario.admin)
SOLO_ADMIN = require_roles(models.RolUsuario.admin)

# Quiénes reciben material: el personal que sale a campo.
ROLES_DE_CAMPO = (models.RolUsuario.tecnico, models.RolUsuario.vendedor_campo)

# Cómo cambia lo que tiene la persona con cada tipo de movimiento.
_EN_MANO = case(
    (models.MovimientoInventario.tipo == Tipo.asignacion, models.MovimientoInventario.cantidad),
    (models.MovimientoInventario.tipo.in_([Tipo.devolucion, Tipo.consumo]), -models.MovimientoInventario.cantidad),
    else_=0,
)


def _estado(stock: int, minimo: int) -> str:
    if stock <= 0:
        return "sin_stock"
    if stock <= minimo:
        return "bajo"
    return "ok"


def _en_personal(db: Session, articulo_ids: Optional[list[int]] = None) -> dict[int, int]:
    consulta = db.query(models.MovimientoInventario.articulo_id, func.coalesce(func.sum(_EN_MANO), 0)).filter(
        models.MovimientoInventario.persona_id.isnot(None)
    )
    if articulo_ids is not None:
        consulta = consulta.filter(models.MovimientoInventario.articulo_id.in_(articulo_ids))
    return {a: int(c) for a, c in consulta.group_by(models.MovimientoInventario.articulo_id).all()}


def _en_mano_de(db: Session, persona_id: int) -> dict[int, int]:
    filas = (
        db.query(models.MovimientoInventario.articulo_id, func.coalesce(func.sum(_EN_MANO), 0))
        .filter(models.MovimientoInventario.persona_id == persona_id)
        .group_by(models.MovimientoInventario.articulo_id)
        .all()
    )
    return {a: int(c) for a, c in filas if c}


def _articulo_out(a: models.ArticuloInventario, en_personal: int) -> schemas.ArticuloInventarioOut:
    out = schemas.ArticuloInventarioOut.model_validate(a)
    out.en_personal = en_personal
    out.estado = _estado(a.stock, a.stock_minimo)
    return out


def _movimiento_out(m: models.MovimientoInventario) -> schemas.MovimientoInventarioOut:
    return schemas.MovimientoInventarioOut(
        id=m.id,
        articulo_id=m.articulo_id,
        articulo_nombre=m.articulo.nombre,
        articulo_codigo=m.articulo.codigo,
        unidad=m.articulo.unidad,
        tipo=m.tipo.value,
        cantidad=m.cantidad,
        stock_resultante=m.stock_resultante,
        persona=schemas.PersonaBreve(id=m.persona.id, nombre=m.persona.nombre, rol=m.persona.rol.value) if m.persona else None,
        cliente_id=m.cliente_id,
        cliente_nombre=m.cliente.nombre if m.cliente else None,
        motivo=m.motivo,
        documento=m.documento,
        lote=m.lote,
        registrado_por=schemas.PersonaBreve(
            id=m.registrado_por.id, nombre=m.registrado_por.nombre, rol=m.registrado_por.rol.value
        ),
        creado_en=m.creado_en,
    )


def _con_relaciones(consulta):
    return consulta.options(
        joinedload(models.MovimientoInventario.articulo),
        joinedload(models.MovimientoInventario.persona),
        joinedload(models.MovimientoInventario.registrado_por),
        joinedload(models.MovimientoInventario.cliente),
    )


# ── Catálogo ─────────────────────────────────────────────────────────────────

@router.get("/categorias", response_model=list[schemas.CategoriaInventarioOut])
def listar_categorias(db: Session = Depends(get_db), _: models.Usuario = Depends(get_current_user)):
    return db.query(models.CategoriaInventario).order_by(models.CategoriaInventario.orden).all()


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), _: models.Usuario = Depends(get_current_user)):
    articulos = db.query(models.ArticuloInventario).filter(models.ArticuloInventario.activo.is_(True)).all()
    en_personal = _en_personal(db)
    hoy = datetime.combine(date.today(), time.min)
    movimientos_hoy = db.query(func.count(models.MovimientoInventario.id)).filter(
        models.MovimientoInventario.creado_en >= hoy
    ).scalar()
    return {
        "articulos": len(articulos),
        "sin_stock": sum(1 for a in articulos if a.stock <= 0),
        "bajo_minimo": sum(1 for a in articulos if 0 < a.stock <= a.stock_minimo),
        "valor_almacen": round(sum(a.stock * (a.costo_unitario or 0) for a in articulos), 2),
        "unidades_en_personal": sum(c for i, c in en_personal.items() if c > 0),
        # Quienes tienen algo ahora mismo, no quienes alguna vez recibieron.
        "personas_con_material": db.query(models.MovimientoInventario.persona_id)
        .filter(models.MovimientoInventario.persona_id.isnot(None))
        .group_by(models.MovimientoInventario.persona_id, models.MovimientoInventario.articulo_id)
        .having(func.sum(_EN_MANO) > 0)
        .distinct()
        .count(),
        "movimientos_hoy": movimientos_hoy,
    }


@router.get("/articulos", response_model=list[schemas.ArticuloInventarioOut])
def listar_articulos(
    q: Optional[str] = None,
    categoria_id: Optional[int] = None,
    estado: Optional[str] = Query(None, pattern="^(sin_stock|bajo|ok|alerta)$"),
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(get_current_user),
):
    consulta = db.query(models.ArticuloInventario).options(joinedload(models.ArticuloInventario.categoria))
    if not incluir_inactivos:
        consulta = consulta.filter(models.ArticuloInventario.activo.is_(True))
    if categoria_id:
        consulta = consulta.filter(models.ArticuloInventario.categoria_id == categoria_id)
    if q and q.strip():
        patron = f"%{q.strip()}%"
        consulta = consulta.filter(or_(
            models.ArticuloInventario.nombre.ilike(patron),
            models.ArticuloInventario.codigo.ilike(patron),
            models.ArticuloInventario.marca.ilike(patron),
            models.ArticuloInventario.modelo.ilike(patron),
        ))
    articulos = consulta.order_by(models.ArticuloInventario.nombre).all()
    en_personal = _en_personal(db, [a.id for a in articulos])
    salida = [_articulo_out(a, en_personal.get(a.id, 0)) for a in articulos]
    if estado == "alerta":
        salida = [a for a in salida if a.estado != "ok"]
    elif estado:
        salida = [a for a in salida if a.estado == estado]
    # Lo que falta primero: así lo urgente queda arriba.
    prioridad = {"sin_stock": 0, "bajo": 1, "ok": 2}
    return sorted(salida, key=lambda a: prioridad[a.estado])


@router.get("/articulos/{articulo_id}")
def ver_articulo(articulo_id: int, db: Session = Depends(get_db), _: models.Usuario = Depends(get_current_user)):
    a = db.query(models.ArticuloInventario).options(joinedload(models.ArticuloInventario.categoria)).get(articulo_id)
    if not a:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    por_persona = (
        db.query(models.Usuario, func.sum(_EN_MANO))
        .join(models.MovimientoInventario, models.MovimientoInventario.persona_id == models.Usuario.id)
        .filter(models.MovimientoInventario.articulo_id == articulo_id)
        .group_by(models.Usuario.id)
        .having(func.sum(_EN_MANO) != 0)
        .all()
    )
    movimientos = (
        _con_relaciones(db.query(models.MovimientoInventario))
        .filter(models.MovimientoInventario.articulo_id == articulo_id)
        .order_by(models.MovimientoInventario.creado_en.desc(), models.MovimientoInventario.id.desc())
        .limit(30)
        .all()
    )
    en_personal = sum(int(c) for _, c in por_persona)
    return {
        "articulo": _articulo_out(a, en_personal),
        "en_manos": [
            {"persona": schemas.PersonaBreve(id=u.id, nombre=u.nombre, rol=u.rol.value), "cantidad": int(c)}
            for u, c in sorted(por_persona, key=lambda f: -f[1])
        ],
        "movimientos": [_movimiento_out(m) for m in movimientos],
    }


def _validar_categoria(db: Session, categoria_id: int):
    if not db.query(models.CategoriaInventario).get(categoria_id):
        raise HTTPException(status_code=400, detail="La categoría no existe")


def _validar_codigo(db: Session, codigo: str, propio: Optional[int] = None):
    otro = db.query(models.ArticuloInventario).filter(models.ArticuloInventario.codigo == codigo).first()
    if otro and otro.id != propio:
        raise HTTPException(status_code=409, detail=f"El código {codigo} ya lo usa «{otro.nombre}»")


@router.post("/articulos", response_model=schemas.ArticuloInventarioOut, status_code=201)
def crear_articulo(
    data: schemas.ArticuloInventarioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(GESTIONAR),
):
    _validar_categoria(db, data.categoria_id)
    _validar_codigo(db, data.codigo)
    a = models.ArticuloInventario(**data.model_dump(exclude={"stock_inicial"}), stock=data.stock_inicial)
    db.add(a)
    db.flush()
    if data.stock_inicial:
        db.add(models.MovimientoInventario(
            articulo_id=a.id, tipo=Tipo.entrada, cantidad=data.stock_inicial,
            stock_resultante=data.stock_inicial, motivo="Stock inicial al registrar el material",
            registrado_por_id=current_user.id,
        ))
    db.commit()
    db.refresh(a)
    return _articulo_out(a, 0)


@router.put("/articulos/{articulo_id}", response_model=schemas.ArticuloInventarioOut)
def editar_articulo(
    articulo_id: int,
    data: schemas.ArticuloInventarioUpdate,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(GESTIONAR),
):
    """Cambia los datos del material. El stock no se toca aquí: se mueve con
    entradas, salidas o un ajuste, para que siempre quede quién y por qué."""
    a = db.query(models.ArticuloInventario).get(articulo_id)
    if not a:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    _validar_categoria(db, data.categoria_id)
    _validar_codigo(db, data.codigo, propio=a.id)
    for campo, valor in data.model_dump().items():
        setattr(a, campo, valor)
    db.commit()
    db.refresh(a)
    return _articulo_out(a, _en_personal(db, [a.id]).get(a.id, 0))


@router.post("/articulos/{articulo_id}/ajuste", response_model=schemas.MovimientoInventarioOut)
def ajustar_stock(
    articulo_id: int,
    data: schemas.AjusteInventario,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(SOLO_ADMIN),
):
    """Corrige el almacén con lo que dio el conteo físico. Solo el
    administrador: es la única forma de cambiar el stock sin una entrega real."""
    a = db.query(models.ArticuloInventario).filter(models.ArticuloInventario.id == articulo_id).with_for_update().first()
    if not a:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    diferencia = data.stock_contado - a.stock
    if diferencia == 0:
        raise HTTPException(status_code=400, detail="El conteo coincide con el stock: no hay nada que ajustar")
    a.stock = data.stock_contado
    m = models.MovimientoInventario(
        articulo_id=a.id, tipo=Tipo.ajuste, cantidad=diferencia, stock_resultante=a.stock,
        motivo=data.motivo.strip(), registrado_por_id=current_user.id,
    )
    db.add(m)
    db.commit()
    return _movimiento_out(_con_relaciones(db.query(models.MovimientoInventario)).get(m.id))


# ── Movimientos ──────────────────────────────────────────────────────────────

NECESITA_PERSONA = {"asignacion", "devolucion", "consumo"}
VERBO = {"asignacion": "entregar", "devolucion": "recibir la devolución de", "consumo": "registrar el consumo de"}


@router.post("/movimientos", response_model=list[schemas.MovimientoInventarioOut], status_code=201)
def registrar_movimientos(
    data: schemas.MovimientosCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(GESTIONAR),
):
    """Una o varias líneas del mismo tipo, todas o ninguna."""
    persona = None
    if data.tipo in NECESITA_PERSONA:
        if not data.persona_id:
            raise HTTPException(status_code=400, detail=f"Elige a quién vas a {VERBO[data.tipo]} el material")
        persona = db.query(models.Usuario).get(data.persona_id)
        if not persona or persona.rol not in ROLES_DE_CAMPO:
            raise HTTPException(status_code=400, detail="El material solo se entrega a técnicos y vendedoras")
        if not persona.activo and data.tipo == "asignacion":
            raise HTTPException(status_code=400, detail=f"{persona.nombre} está desactivado: no se le puede entregar material")
    elif data.persona_id:
        raise HTTPException(status_code=400, detail="Las entradas y salidas del almacén no llevan persona")
    if data.tipo == "salida" and not (data.motivo and data.motivo.strip()):
        raise HTTPException(status_code=400, detail="Indica el motivo de la salida (venta, merma, daño…)")
    if data.cliente_id and data.tipo not in ("consumo", "salida"):
        raise HTTPException(status_code=400, detail="Solo el consumo o la salida se asocian a un cliente")
    if data.cliente_id and not db.query(models.Cliente).get(data.cliente_id):
        raise HTTPException(status_code=400, detail="El cliente no existe")

    ids = [l.articulo_id for l in data.lineas]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Hay un material repetido en la lista: junta las cantidades")
    articulos = {
        a.id: a for a in db.query(models.ArticuloInventario)
        .filter(models.ArticuloInventario.id.in_(ids))
        .order_by(models.ArticuloInventario.id)
        .with_for_update()
        .all()
    }
    en_mano = _en_mano_de(db, persona.id) if persona else {}

    lote = str(uuid.uuid4()) if len(data.lineas) > 1 else None
    creados = []
    for linea in data.lineas:
        a = articulos.get(linea.articulo_id)
        if not a:
            raise HTTPException(status_code=404, detail=f"El material {linea.articulo_id} no existe")
        if not a.activo and data.tipo in ("entrada", "asignacion"):
            raise HTTPException(status_code=400, detail=f"«{a.nombre}» está archivado")
        if data.tipo in ("salida", "asignacion") and linea.cantidad > a.stock:
            raise HTTPException(
                status_code=400,
                detail=f"No alcanza «{a.nombre}»: pides {linea.cantidad} y en el almacén hay {a.stock} {a.unidad}(s)",
            )
        if data.tipo in ("devolucion", "consumo") and linea.cantidad > en_mano.get(a.id, 0):
            raise HTTPException(
                status_code=400,
                detail=f"{persona.nombre} tiene {en_mano.get(a.id, 0)} de «{a.nombre}» y estás registrando {linea.cantidad}",
            )
        if data.tipo in ("entrada", "devolucion"):
            a.stock += linea.cantidad
        elif data.tipo in ("salida", "asignacion"):
            a.stock -= linea.cantidad
        m = models.MovimientoInventario(
            articulo_id=a.id, tipo=Tipo(data.tipo), cantidad=linea.cantidad, stock_resultante=a.stock,
            persona_id=persona.id if persona else None, cliente_id=data.cliente_id,
            motivo=(data.motivo or "").strip() or None, documento=(data.documento or "").strip() or None,
            lote=lote, registrado_por_id=current_user.id,
        )
        db.add(m)
        creados.append(m)
    db.commit()
    ids_creados = [m.id for m in creados]
    filas = _con_relaciones(db.query(models.MovimientoInventario)).filter(models.MovimientoInventario.id.in_(ids_creados)).all()
    return [_movimiento_out(m) for m in sorted(filas, key=lambda m: m.id)]


@router.get("/movimientos")
def listar_movimientos(
    articulo_id: Optional[int] = None,
    persona_id: Optional[int] = None,
    tipo: Optional[str] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(get_current_user),
):
    consulta = db.query(models.MovimientoInventario)
    if articulo_id:
        consulta = consulta.filter(models.MovimientoInventario.articulo_id == articulo_id)
    if persona_id:
        consulta = consulta.filter(models.MovimientoInventario.persona_id == persona_id)
    if tipo:
        try:
            consulta = consulta.filter(models.MovimientoInventario.tipo == Tipo(tipo))
        except ValueError:
            raise HTTPException(status_code=400, detail="Tipo de movimiento desconocido")
    if desde:
        consulta = consulta.filter(models.MovimientoInventario.creado_en >= datetime.combine(desde, time.min))
    if hasta:
        consulta = consulta.filter(models.MovimientoInventario.creado_en < datetime.combine(hasta + timedelta(days=1), time.min))
    total = consulta.count()
    filas = (
        _con_relaciones(consulta)
        .order_by(models.MovimientoInventario.creado_en.desc(), models.MovimientoInventario.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "items": [_movimiento_out(m) for m in filas],
    }


# ── Personal ─────────────────────────────────────────────────────────────────

def _material_de(db: Session, persona_id: int) -> list[dict]:
    en_mano = _en_mano_de(db, persona_id)
    if not en_mano:
        return []
    articulos = db.query(models.ArticuloInventario).filter(models.ArticuloInventario.id.in_(en_mano)).all()
    ultimos = dict(
        db.query(models.MovimientoInventario.articulo_id, func.max(models.MovimientoInventario.creado_en))
        .filter(models.MovimientoInventario.persona_id == persona_id)
        .group_by(models.MovimientoInventario.articulo_id)
        .all()
    )
    return sorted(
        [
            {
                "articulo_id": a.id, "codigo": a.codigo, "nombre": a.nombre, "unidad": a.unidad,
                "cantidad": en_mano[a.id], "ultimo_movimiento": ultimos.get(a.id),
            }
            for a in articulos if en_mano.get(a.id, 0) > 0
        ],
        key=lambda x: x["nombre"],
    )


@router.get("/personal")
def personal(db: Session = Depends(get_db), _: models.Usuario = Depends(get_current_user)):
    """Técnicos y vendedoras con lo que tiene cada uno en mano. Primero
    quien tiene más, que es a quien se le pide cuentas."""
    personas = (
        db.query(models.Usuario)
        .filter(models.Usuario.rol.in_(ROLES_DE_CAMPO))
        .order_by(models.Usuario.activo.desc(), models.Usuario.nombre)
        .all()
    )
    salida = []
    for p in personas:
        material = _material_de(db, p.id)
        if not p.activo and not material:
            continue
        ultimo = db.query(func.max(models.MovimientoInventario.creado_en)).filter(
            models.MovimientoInventario.persona_id == p.id
        ).scalar()
        salida.append({
            "persona": {"id": p.id, "nombre": p.nombre, "rol": p.rol.value, "activo": p.activo, "telefono": p.telefono},
            "unidades": sum(x["cantidad"] for x in material),
            "articulos": len(material),
            "ultimo_movimiento": ultimo,
            "material": material,
        })
    salida.sort(key=lambda x: (not x["persona"]["activo"], -x["unidades"], x["persona"]["nombre"]))
    return salida


@router.get("/mio")
def mi_material(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    """Lo que tiene en mano quien inició sesión. Lo usa la app del técnico."""
    return {"material": _material_de(db, current_user.id)}
