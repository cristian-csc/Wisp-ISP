"""
Tests para el módulo de gastos.

Cubre:
- Creación y listado de gastos
- Gastos recurrentes: deben aparecer en meses posteriores
- Gastos recurrentes: no deben duplicarse si ya hay registro del mes
- Filtro por mes y categoría
- CRUD básico (crear, editar, eliminar)
"""
from datetime import date

import pytest

from app import models, schemas


# ── Helper ────────────────────────────────────────────────────────────────────

def _payload(
    descripcion: str = "Servicio Internet",
    monto: float = 100.0,
    categoria: str = "servicios",
    fecha: str = "2026-06-01",
    es_recurrente: bool = False,
) -> dict:
    return {
        "descripcion": descripcion,
        "monto": monto,
        "categoria": categoria,
        "fecha": fecha,
        "es_recurrente": es_recurrente,
    }


def _crear_gasto(client, **kwargs) -> dict:
    resp = client.post("/gastos", json=_payload(**kwargs))
    assert resp.status_code == 201, resp.json()
    return resp.json()


# ── Tests CRUD básicos ────────────────────────────────────────────────────────

class TestCRUDGastos:
    def test_crear_gasto(self, client):
        data = _crear_gasto(client, descripcion="Luz", monto=80.0, fecha="2026-07-01")
        assert data["descripcion"] == "Luz"
        assert data["monto"] == 80.0
        assert data["id"] is not None

    def test_listar_gastos_vacio(self, client):
        resp = client.get("/gastos")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_listar_gastos_retorna_todos(self, client):
        _crear_gasto(client, descripcion="G1", fecha="2026-07-01")
        _crear_gasto(client, descripcion="G2", fecha="2026-07-05")

        resp = client.get("/gastos")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_editar_gasto(self, client):
        gasto = _crear_gasto(client, descripcion="Original", monto=50.0, fecha="2026-07-01")
        gasto_id = gasto["id"]

        resp = client.put(f"/gastos/{gasto_id}", json=_payload(descripcion="Actualizado", monto=99.0))
        assert resp.status_code == 200
        data = resp.json()
        assert data["descripcion"] == "Actualizado"
        assert data["monto"] == 99.0

    def test_editar_gasto_inexistente_retorna_404(self, client):
        resp = client.put("/gastos/99999", json=_payload())
        assert resp.status_code == 404

    def test_eliminar_gasto(self, client):
        gasto = _crear_gasto(client, descripcion="Borrar", fecha="2026-07-01")
        gasto_id = gasto["id"]

        resp = client.delete(f"/gastos/{gasto_id}")
        assert resp.status_code == 200

        resp = client.get(f"/gastos?mes=2026-07")
        assert resp.json()["total"] == 0

    def test_eliminar_gasto_inexistente_retorna_404(self, client):
        resp = client.delete("/gastos/99999")
        assert resp.status_code == 404


# ── Tests Filtro por mes ──────────────────────────────────────────────────────

class TestFiltroMes:
    def test_filtro_mes_solo_devuelve_del_mes(self, client):
        _crear_gasto(client, descripcion="Julio", fecha="2026-07-01")
        _crear_gasto(client, descripcion="Agosto", fecha="2026-08-01")

        resp = client.get("/gastos?mes=2026-07")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["descripcion"] == "Julio"

    def test_filtro_mes_agosto_no_muestra_julio(self, client):
        _crear_gasto(client, descripcion="Solo julio", fecha="2026-07-15")

        resp = client.get("/gastos?mes=2026-08")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_filtro_categoria(self, client):
        _crear_gasto(client, descripcion="Luz", categoria="servicios", fecha="2026-07-01")
        _crear_gasto(client, descripcion="Renta", categoria="renta", fecha="2026-07-01")

        resp = client.get("/gastos?mes=2026-07&categoria=servicios")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["categoria"] == "servicios"


# ── Tests Gastos Recurrentes ──────────────────────────────────────────────────

class TestGastosRecurrentes:
    def test_recurrente_aparece_en_mes_siguiente(self, client):
        """
        Un gasto creado en junio con es_recurrente=True debe
        aparecer automáticamente al consultar julio.
        """
        _crear_gasto(client, descripcion="Internet", fecha="2026-06-01", es_recurrente=True)

        resp = client.get("/gastos?mes=2026-07")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1, "El gasto recurrente debe aparecer en julio aunque se creó en junio"
        assert data["items"][0]["descripcion"] == "Internet"
        assert data["items"][0]["es_recurrente"] is True

    def test_recurrente_aparece_varios_meses_despues(self, client):
        """
        Un gasto recurrente de enero debe aparecer también en agosto.
        """
        _crear_gasto(client, descripcion="Electricidad", fecha="2026-01-01", es_recurrente=True)

        resp = client.get("/gastos?mes=2026-08")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_recurrente_no_duplica_si_ya_existe_en_mes(self, client):
        """
        Si un gasto recurrente ya fue registrado manualmente en el mes consultado,
        no debe aparecer duplicado.
        """
        _crear_gasto(client, descripcion="Internet", fecha="2026-06-01", es_recurrente=True)
        _crear_gasto(client, descripcion="Internet", fecha="2026-07-01", es_recurrente=True)

        resp = client.get("/gastos?mes=2026-07")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1, "No debe aparecer duplicado cuando ya se registró en el mes"

    def test_no_recurrente_no_aparece_en_otro_mes(self, client):
        """
        Un gasto sin es_recurrente NO debe aparecer en meses posteriores.
        """
        _crear_gasto(client, descripcion="Gasto único", fecha="2026-06-01", es_recurrente=False)

        resp = client.get("/gastos?mes=2026-07")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_multiples_recurrentes_todos_aparecen(self, client):
        """
        Varios gastos recurrentes de meses anteriores deben aparecer todos.
        """
        _crear_gasto(client, descripcion="Internet", categoria="servicios", fecha="2026-05-01", es_recurrente=True)
        _crear_gasto(client, descripcion="Electricidad", categoria="servicios", fecha="2026-05-01", es_recurrente=True)
        _crear_gasto(client, descripcion="Renta", categoria="renta", fecha="2026-06-01", es_recurrente=True)

        resp = client.get("/gastos?mes=2026-07")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3

    def test_recurrente_con_filtro_categoria(self, client):
        """
        El filtro de categoría debe aplicarse también a los recurrentes proyectados.
        """
        _crear_gasto(client, descripcion="Internet", categoria="servicios", fecha="2026-06-01", es_recurrente=True)
        _crear_gasto(client, descripcion="Renta", categoria="renta", fecha="2026-06-01", es_recurrente=True)

        resp = client.get("/gastos?mes=2026-07&categoria=servicios")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["descripcion"] == "Internet"


# ── Test paginación ───────────────────────────────────────────────────────────

class TestPaginacion:
    def test_paginacion_limita_resultados(self, client):
        for i in range(5):
            _crear_gasto(client, descripcion=f"Gasto {i}", fecha="2026-07-01")

        resp = client.get("/gastos?mes=2026-07&per_page=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["pages"] == 3

    def test_segunda_pagina(self, client):
        for i in range(4):
            _crear_gasto(client, descripcion=f"Gasto {i}", fecha="2026-07-01")

        resp = client.get("/gastos?mes=2026-07&per_page=2&page=2")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2
