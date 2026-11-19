# -*- coding: utf-8 -*-
"""El almacen de materiales, probado contra la base de verdad."""
from decimal import Decimal

from app.database import SessionLocal
from app import models, schemas
from app.routers import materiales as R

db = SessionLocal()
fallos = []


def check(etiqueta, real, esperado):
    ok = real == esperado
    print("  %-58s %s" % (etiqueta, "OK" if ok else "FALLA -> %r (esperaba %r)" % (real, esperado)))
    if not ok:
        fallos.append(etiqueta)


def intentar(data, usuario):
    try:
        return R.registrar_movimiento(data=data, db=db, current_user=usuario)
    except Exception as e:
        return str(getattr(e, "detail", e))


admin = db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.admin).first()
tecnico = db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.tecnico).first()
drop = db.query(models.Material).filter(models.Material.clave == "cable_drop").first()
bobina = next(p for p in drop.presentaciones if p.equivale_a == 1000)

print("\nmaterial: %s (%s)   presentacion: %s = %g" %
      (drop.nombre, drop.unidad, bobina.nombre, bobina.equivale_a))
print("tecnico de prueba: %s\n" % tecnico.nombre)

try:
    print("1. Una compra de 2 bobinas entra como 2000 metros")
    R.registrar_movimiento(
        data=schemas.MovimientoMaterialCreate(
            material_id=drop.id, tipo="entrada", cantidad=2, presentacion_id=bobina.id),
        db=db, current_user=admin)
    check("el almacen tiene 2000", R._saldos(db).get(drop.id), Decimal(2000))

    print("\n2. No se entrega lo que no hay")
    res = intentar(schemas.MovimientoMaterialCreate(
        material_id=drop.id, tipo="entrega", cantidad=3000, tecnico_id=tecnico.id), admin)
    check("rechaza entregar 3000", "solo hay" in str(res), True)

    print("\n3. Una entrega sale del almacen y entra al tecnico")
    R.registrar_movimiento(
        data=schemas.MovimientoMaterialCreate(
            material_id=drop.id, tipo="entrega", cantidad=200, tecnico_id=tecnico.id),
        db=db, current_user=admin)
    check("al almacen le quedan 1800", R._saldos(db).get(drop.id), Decimal(1800))
    check("el tecnico lleva 200", R._saldos_tecnico(db).get((tecnico.id, drop.id)), Decimal(200))

    print("\n4. Una entrega sin tecnico no se acepta")
    res = intentar(schemas.MovimientoMaterialCreate(
        material_id=drop.id, tipo="entrega", cantidad=10), admin)
    check("la rechaza", "tecnico" in str(res).replace("é", "e"), True)

    print("\n5. Solo el ajuste puede restar")
    res = intentar(schemas.MovimientoMaterialCreate(
        material_id=drop.id, tipo="entrada", cantidad=-5), admin)
    check("rechaza una entrada negativa", "Solo un ajuste puede restar" in str(res), True)
    R.registrar_movimiento(
        data=schemas.MovimientoMaterialCreate(
            material_id=drop.id, tipo="ajuste", cantidad=-50, tecnico_id=tecnico.id,
            motivo="cuadre: se perdio un retazo"),
        db=db, current_user=admin)
    check("tras el cuadre el tecnico lleva 150",
          R._saldos_tecnico(db).get((tecnico.id, drop.id)), Decimal(150))

    print("\n6. El consumo no se registra desde aqui")
    # Lo frena el propio esquema, antes de llegar al router: la peticion ni
    # llega a formarse. Es mejor que comprobarlo dentro del handler.
    try:
        schemas.MovimientoMaterialCreate(
            material_id=drop.id, tipo="consumo", cantidad=10, tecnico_id=tecnico.id)
        rechazado = False
    except Exception:
        rechazado = True
    check("el esquema lo rechaza", rechazado, True)

    print("\n7. Lo que ve el panel")
    lista = R.listar_materiales(db=db, current_user=admin)
    drop_out = next(m for m in lista if m["clave"] == "cable_drop")
    check("en almacen", drop_out["en_almacen"], Decimal(1800))
    check("presentaciones del drop", len(drop_out["presentaciones"]), 3)
    por_tec = R.saldos_por_tecnico(db=db, current_user=admin)
    check("un tecnico con saldo", len(por_tec), 1)
    check("y lleva 150 metros", por_tec[0]["cantidad"], Decimal(150))
    movs = R.listar_movimientos(db=db, current_user=admin)
    check("movimientos registrados", len(movs), 3)
    check("la compra recuerda su presentacion",
          [m["presentacion"] for m in movs if m["tipo"] == "entrada"], ["Bobina 1000 m"])

finally:
    db.query(models.MovimientoMaterial).delete(synchronize_session=False)
    db.commit()
    print("\nlimpieza hecha, el almacen queda en cero")

print("\n%s" % ("TODO BIEN" if not fallos else "FALLAN: " + ", ".join(fallos)))
