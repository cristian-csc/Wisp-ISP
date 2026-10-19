"""
Tests para el módulo de pagos.

Cubre:
- Bug corte_temporal: NO debe reactivar clientes suspendidos
- Pago normal: SÍ debe reactivar clientes suspendidos
- fecha_vencimiento: solo se actualiza en pagos reales (no en corte_temporal)
- Pagos de meses futuros: permitidos (pago adelantado)
- Detección de pago duplicado para el mismo mes/cliente
"""
from datetime import date

import pytest

from app import models
from tests.conftest import crear_zona, crear_plan, crear_cliente


# ── Fixtures de datos base ────────────────────────────────────────────────────

@pytest.fixture
def datos(db):
    zona = crear_zona(db)
    plan = crear_plan(db)
    return zona, plan, db


def _payload_pago(cliente_id: int, mes: str, estado: str = "pagado", monto: float = 50.0) -> dict:
    return {
        "cliente_id": cliente_id,
        "mes_pagado": mes,
        "fecha_pago": str(date.today()),
        "monto": monto,
        "metodo_pago": "efectivo",
        "estado": estado,
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestCorteTemporal:
    def test_corte_temporal_no_reactiva_cliente_suspendido(self, client, datos):
        """
        Bug crítico corregido: marcar un mes como corte_temporal en un cliente
        suspendido NO debe reactivar el servicio.
        """
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="suspendido")

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "corte_temporal", 0))
        assert resp.status_code == 201

        db.refresh(cliente)
        assert cliente.estado == models.EstadoCliente.suspendido, (
            "El cliente suspendido NO debería reactivarse con corte_temporal"
        )

    def test_corte_temporal_no_actualiza_fecha_vencimiento(self, client, datos):
        """
        Un corte_temporal no representa un pago real:
        la fecha_vencimiento no debe cambiar.
        """
        zona, plan, db = datos
        fecha_original = date(2026, 7, 15)
        cliente = crear_cliente(db, zona, plan, estado="activo", fecha_vencimiento=fecha_original)

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "corte_temporal", 0))
        assert resp.status_code == 201

        db.refresh(cliente)
        assert cliente.fecha_vencimiento == fecha_original, (
            "fecha_vencimiento no debe cambiar con corte_temporal"
        )

    def test_corte_temporal_crea_registro_en_bd(self, client, datos):
        """El corte temporal sí debe quedar registrado como pago en la BD."""
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="activo")

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "corte_temporal", 0))
        assert resp.status_code == 201

        pago = db.query(models.Pago).filter(models.Pago.cliente_id == cliente.id).first()
        assert pago is not None
        assert pago.estado == models.EstadoPago.corte_temporal
        assert pago.monto == 0.0


class TestPagoNormal:
    def test_pago_normal_reactiva_cliente_suspendido(self, client, datos):
        """
        Un pago con estado='pagado' en un cliente suspendido
        debe reactivar el servicio automáticamente.
        """
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="suspendido")

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07"))
        assert resp.status_code == 201

        db.refresh(cliente)
        assert cliente.estado == models.EstadoCliente.activo, (
            "El cliente suspendido debería reactivarse con un pago normal"
        )

    def test_pago_normal_actualiza_fecha_vencimiento(self, client, datos):
        """
        Un pago del mes de julio (instalación día 15) debe mover
        la fecha_vencimiento al 15 de agosto.
        """
        zona, plan, db = datos
        cliente = crear_cliente(
            db, zona, plan,
            estado="activo",
            fecha_instalacion=date(2026, 1, 15),
            fecha_vencimiento=date(2026, 7, 15),
        )

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07"))
        assert resp.status_code == 201

        db.refresh(cliente)
        assert cliente.fecha_vencimiento == date(2026, 8, 15), (
            "Pago de julio con ciclo día 15 → vence el 15 de agosto"
        )

    def test_fecha_vencimiento_no_retrocede_con_pago_atrasado(self, client, datos):
        """
        Si el cliente ya tiene fecha_vencimiento en agosto y se paga julio
        (mes atrasado), la fecha no debe retroceder.
        """
        zona, plan, db = datos
        cliente = crear_cliente(
            db, zona, plan,
            estado="activo",
            fecha_instalacion=date(2026, 1, 15),
            fecha_vencimiento=date(2026, 8, 15),
        )

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-06"))
        assert resp.status_code == 201

        db.refresh(cliente)
        assert cliente.fecha_vencimiento >= date(2026, 8, 15), (
            "La fecha_vencimiento no debe retroceder por pago de mes atrasado"
        )

    def test_pago_registra_historial(self, client, datos):
        """Cada pago debe quedar en el historial del cliente."""
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="activo")

        client.post("/pagos", json=_payload_pago(cliente.id, "2026-07"))

        historial = db.query(models.Historial).filter(
            models.Historial.cliente_id == cliente.id,
            models.Historial.tipo == models.TipoHistorial.pago,
        ).first()
        assert historial is not None


class TestPagosMesAdelantado:
    def test_pago_mes_futuro_permitido(self, client, datos):
        """
        Un cliente puede pagar meses futuros por adelantado.
        No debe haber restricción en el backend.
        """
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="activo")

        # Pagamos 2 meses adelante (agosto y septiembre desde julio actual)
        resp_ago = client.post("/pagos", json=_payload_pago(cliente.id, "2026-08"))
        assert resp_ago.status_code == 201

        resp_sep = client.post("/pagos", json=_payload_pago(cliente.id, "2026-09"))
        assert resp_sep.status_code == 201

        pagos = db.query(models.Pago).filter(models.Pago.cliente_id == cliente.id).all()
        assert len(pagos) == 2

    def test_pago_adelantado_actualiza_fecha_vencimiento_correctamente(self, client, datos):
        """
        Pagar septiembre por adelantado (ciclo día 15) debe
        mover vencimiento al 15 de octubre.
        """
        zona, plan, db = datos
        cliente = crear_cliente(
            db, zona, plan,
            estado="activo",
            fecha_instalacion=date(2026, 1, 15),
            fecha_vencimiento=date(2026, 7, 15),
        )

        client.post("/pagos", json=_payload_pago(cliente.id, "2026-09"))

        db.refresh(cliente)
        assert cliente.fecha_vencimiento == date(2026, 10, 15)


class TestValidacionesPago:
    def test_pago_duplicado_rechazado(self, client, datos):
        """No se puede registrar dos pagos del mismo mes para el mismo cliente."""
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan, estado="activo")

        resp1 = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07"))
        assert resp1.status_code == 201

        resp2 = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07"))
        assert resp2.status_code == 400
        assert "2026-07" in resp2.json()["detail"]

    def test_pago_cliente_inexistente_retorna_404(self, client, datos):
        """Registrar pago para un cliente que no existe debe devolver 404."""
        resp = client.post("/pagos", json=_payload_pago(99999, "2026-07"))
        assert resp.status_code == 404

    def test_listar_pagos_filtra_por_cliente(self, client, datos):
        """El listado de pagos debe filtrar correctamente por cliente_id."""
        zona, plan, db = datos
        c1 = crear_cliente(db, zona, plan, estado="activo")
        c2 = models.Cliente(
            nombre="Cliente Dos",
            usuario_pppoe="user_dos",
            password_pppoe="pass",
            zona_id=zona.id,
            plan_id=plan.id,
            fecha_instalacion=date(2026, 1, 1),
            estado=models.EstadoCliente.activo,
            tipo_conexion=models.TipoConexion.inalambrico,
            estado_equipo=models.EstadoEquipo.sin_equipo,
        )
        db.add(c2)
        db.commit()
        db.refresh(c2)

        client.post("/pagos", json=_payload_pago(c1.id, "2026-07"))
        client.post("/pagos", json=_payload_pago(c2.id, "2026-07"))

        resp = client.get(f"/pagos?cliente_id={c1.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["cliente_id"] == c1.id
