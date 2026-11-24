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

class TestNoSePuedeCobrarDosVecesElMismoMes:
    """El doble clic en «Registrar pago».

    El guard de duplicados era un SELECT seguido de un INSERT, sin ninguna
    restricción en la base que lo respaldara. Dos peticiones a la vez —un doble
    clic, la cajera reintentando porque el navegador se quedó pensando, dos
    personas cobrando al mismo cliente— pasaban las dos el SELECT y hacían las
    dos el INSERT. Quedaban dos pagos del mismo mes y la fecha de vencimiento
    avanzaba DOS meses: un mes regalado y la caja descuadrada.

    Y la ventana no era teórica: entre el SELECT y el commit el endpoint genera
    un PDF y espera a WhatsApp. Segundos, no milisegundos.
    """

    def test_la_base_rechaza_dos_pagos_del_mismo_mes(self, db, datos):
        """La restricción es la que de verdad garantiza. Si esta prueba falla,
        el SELECT se quedó solo otra vez."""
        from sqlalchemy.exc import IntegrityError

        zona, plan, _ = datos
        cliente = crear_cliente(db, zona, plan)
        db.add(models.Pago(
            cliente_id=cliente.id, monto=50, mes_pagado="2026-07",
            fecha_pago=date.today(), estado=models.EstadoPago.pagado,
        ))
        db.commit()

        db.add(models.Pago(
            cliente_id=cliente.id, monto=50, mes_pagado="2026-07",
            fecha_pago=date.today(), estado=models.EstadoPago.pagado,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_el_mismo_mes_en_otro_cliente_si_se_puede(self, db, datos):
        """La restricción es por cliente y mes, no por mes: en julio cobran
        todos."""
        zona, plan, _ = datos
        uno = crear_cliente(db, zona, plan, usuario_pppoe="cli_uno")
        otro = crear_cliente(db, zona, plan, usuario_pppoe="cli_otro")
        for c in (uno, otro):
            db.add(models.Pago(
                cliente_id=c.id, monto=50, mes_pagado="2026-07",
                fecha_pago=date.today(), estado=models.EstadoPago.pagado,
            ))
        db.commit()
        assert db.query(models.Pago).count() == 2

    def test_la_carrera_da_un_400_amable_y_no_un_500(self, client, db, datos, monkeypatch):
        """Cuando el SELECT no llega a ver el pago de la otra petición, salta
        la restricción. Quien cobra tiene que leer «ya existe un pago», no un
        error del servidor."""
        from app.routers import pagos as pagos_mod

        zona, plan, _ = datos
        cliente = crear_cliente(db, zona, plan)
        db.add(models.Pago(
            cliente_id=cliente.id, monto=50, mes_pagado="2026-07",
            fecha_pago=date.today(), estado=models.EstadoPago.pagado,
        ))
        db.commit()

        # Se simula la carrera con fidelidad: la PRIMERA consulta (el guard,
        # antes de insertar) no ve nada, porque la otra petición todavía no
        # hizo commit. La segunda —la que el endpoint hace al recuperarse del
        # IntegrityError— sí lo ve, porque ya está. Devolver vacío siempre no
        # sería una carrera: sería una base que miente.
        real = pagos_mod._meses_ya_pagados
        llamadas = {"n": 0}

        def primera_vez_ciego(*a, **k):
            llamadas["n"] += 1
            return [] if llamadas["n"] == 1 else real(*a, **k)

        monkeypatch.setattr(pagos_mod, "_meses_ya_pagados", primera_vez_ciego)

        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "pagado", 50))
        assert resp.status_code == 400, (
            f"la carrera dio HTTP {resp.status_code}; se esperaba un 400 amable"
        )
        assert "ya existe" in resp.json()["detail"].lower()
        # Y no quedó un segundo pago.
        assert db.query(models.Pago).filter(
            models.Pago.cliente_id == cliente.id,
            models.Pago.mes_pagado == "2026-07",
        ).count() == 1


class TestTopeDeCero:
    """El guard que impide cobrar S/ 0 o menos.

    Existe por los descuentos: un descuento igual o mayor que el subtotal
    dejaría un cobro de cero o negativo, que no es un cobro. Pero el guard se
    escribió sobre el monto a secas y se llevó por delante el corte temporal,
    que por diseño ES un pago de S/ 0 (ver TestCorteTemporal). Al restringirlo
    a los cobros reales hay que comprobar las dos mitades: que el corte
    temporal pasa, y que un cobro de cero sigue sin pasar.
    """

    def test_un_cobro_de_cero_se_rechaza(self, client, datos):
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan)
        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "pagado", 0))
        assert resp.status_code == 400, "un cobro de S/ 0 entró como pago real"
        assert "mayor que cero" in resp.json()["detail"]

    def test_un_cobro_negativo_se_rechaza(self, client, datos):
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan)
        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "pagado", -10))
        assert resp.status_code == 400

    def test_sin_indicar_estado_tambien_se_rechaza(self, client, datos):
        """El estado por defecto es `pagado`, así que el camino normal del
        panel —que no manda el campo— sigue protegido."""
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan)
        payload = _payload_pago(cliente.id, "2026-07", "pagado", 0)
        del payload["estado"]
        resp = client.post("/pagos", json=payload)
        assert resp.status_code == 400

    def test_un_cobro_normal_sigue_pasando(self, client, datos):
        zona, plan, db = datos
        cliente = crear_cliente(db, zona, plan)
        resp = client.post("/pagos", json=_payload_pago(cliente.id, "2026-07", "pagado", 50))
        assert resp.status_code == 201


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
