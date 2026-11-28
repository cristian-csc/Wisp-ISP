"""Costo de instalación cobrado con el primer pago.

Reglas que se prueban:
- Se cobra SOLO en el primer pago de un cliente recién instalado, y solo si su
  zona tiene costo de instalación > 0. Automático.
- Los clientes migrados quedan fuera (ya estaban instalados).
- Es editable: quien cobra puede mandar su propio monto, o 0 para quitarlo.
- Nunca se cobra dos veces: en un pago que no es el primero, mandarlo da 400.
- El recibo suma la instalación al importe pagado, aparte de la mensualidad.
"""
from datetime import date

import pytest

from app import models
from app.routers.pagos import _datos_recibo
from tests.conftest import crear_zona, crear_plan, crear_cliente


@pytest.fixture
def datos(db):
    zona = crear_zona(db)
    plan = crear_plan(db)
    return zona, plan, db


def _payload(cliente_id: int, mes: str, **extra) -> dict:
    base = {
        "cliente_id": cliente_id,
        "mes_pagado": mes,
        "fecha_pago": str(date.today()),
        "monto": 50.0,
        "metodo_pago": "efectivo",
        "estado": "pagado",
    }
    base.update(extra)
    return base


def test_primer_pago_cobra_instalacion_de_la_zona(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 100.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    assert resp.status_code == 201, resp.json()
    assert resp.json()["cargo_instalacion"] == 100.0


def test_zona_sin_costo_no_cobra_instalacion(client, db, datos):
    zona, plan, _ = datos  # costo_instalacion = 0 por defecto
    cliente = crear_cliente(db, zona, plan)

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    assert resp.status_code == 201, resp.json()
    assert resp.json()["cargo_instalacion"] is None


def test_segundo_pago_ya_no_cobra_instalacion(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 100.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)

    primero = client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    assert primero.status_code == 201
    assert primero.json()["cargo_instalacion"] == 100.0

    # Segundo mes: automático, NO vuelve a cobrar instalación.
    segundo = client.post("/pagos", json=_payload(cliente.id, "2026-08"))
    assert segundo.status_code == 201, segundo.json()
    assert segundo.json()["cargo_instalacion"] is None


def test_cliente_migrado_no_cobra_instalacion_automatica(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 100.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)
    cliente.migrado = True
    db.commit()

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    assert resp.status_code == 201, resp.json()
    assert resp.json()["cargo_instalacion"] is None


def test_editable_monto_propio_aunque_la_zona_no_cobre(client, db, datos):
    zona, plan, _ = datos  # zona sin costo
    cliente = crear_cliente(db, zona, plan)

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07", cargo_instalacion=80.0))
    assert resp.status_code == 201, resp.json()
    assert resp.json()["cargo_instalacion"] == 80.0


def test_editable_cero_quita_la_instalacion_aunque_la_zona_cobre(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 100.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07", cargo_instalacion=0))
    assert resp.status_code == 201, resp.json()
    assert resp.json()["cargo_instalacion"] is None


def test_instalacion_en_pago_que_no_es_el_primero_da_400(client, db, datos):
    zona, plan, _ = datos  # zona sin costo, para que el primero no lleve cargo
    cliente = crear_cliente(db, zona, plan)

    primero = client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    assert primero.status_code == 201
    assert primero.json()["cargo_instalacion"] is None

    segundo = client.post("/pagos", json=_payload(cliente.id, "2026-08", cargo_instalacion=50.0))
    assert segundo.status_code == 400
    assert "primer pago" in segundo.json()["detail"].lower()


def test_endpoint_sugerencia_antes_y_despues_del_primer_pago(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 120.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)

    # Antes de pagar: le toca instalación.
    antes = client.get(f"/pagos/instalacion-sugerida/{cliente.id}")
    assert antes.status_code == 200
    assert antes.json() == {"aplica": True, "costo": 120.0}

    # Tras el primer pago: ya no.
    client.post("/pagos", json=_payload(cliente.id, "2026-07"))
    despues = client.get(f"/pagos/instalacion-sugerida/{cliente.id}")
    assert despues.status_code == 200
    assert despues.json()["aplica"] is False


def test_el_recibo_suma_instalacion_al_importe_pagado(client, db, datos):
    zona, plan, _ = datos
    zona.costo_instalacion = 100.0
    db.commit()
    cliente = crear_cliente(db, zona, plan)

    resp = client.post("/pagos", json=_payload(cliente.id, "2026-07", monto=50.0))
    assert resp.status_code == 201, resp.json()
    pago = db.query(models.Pago).filter(models.Pago.cliente_id == cliente.id).first()

    recibo = _datos_recibo(db, pago)
    assert recibo.instalacion == 100.0
    # El mes es 50 y la instalación 100: entraron 150 a caja.
    assert recibo.pagado == 150.0
    # IMP. TOTAL incluye la instalación; menos descuento (0) = importe pagado.
    assert recibo.imp_total == 150.0
