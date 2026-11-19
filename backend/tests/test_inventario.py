"""
Tests del inventario de materiales.

Cubre:
- Alta con stock inicial (queda como entrada en el historial)
- Entrega a un técnico, devolución y consumo: almacén y "en mano" cuadran
- No se entrega más de lo que hay ni se devuelve más de lo que se tiene
- Entregas de varias líneas: todas o ninguna
- Estado sin stock / bajo mínimo / ok
- Ajuste por conteo
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import models
from app.database import get_db
from app.routers import inventario as inventario_router
from app.routers.auth import get_current_user
from tests.conftest import MOCK_USER, override_get_current_user, override_get_db


@pytest.fixture
def api():
    app = FastAPI()
    app.include_router(inventario_router.router, prefix="/inv")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c


@pytest.fixture
def base(db):
    db.add(models.Usuario(id=MOCK_USER.id, nombre="Test Admin", email="admin@wisp.test", hashed_password="x", rol=models.RolUsuario.admin))
    tecnico = models.Usuario(nombre="Rosa Técnico", email="rosa@wisp.test", hashed_password="x", rol=models.RolUsuario.tecnico)
    vendedora = models.Usuario(nombre="Ana Vendedora", email="ana@wisp.test", hashed_password="x", rol=models.RolUsuario.vendedor_campo)
    cajera = models.Usuario(nombre="Caja", email="caja@wisp.test", hashed_password="x", rol=models.RolUsuario.atencion_cliente)
    categoria = models.CategoriaInventario(nombre="Fibra óptica", orden=1)
    unidad = models.UnidadMedida(nombre="unidad", plural="unidades", abreviatura="und")
    db.add_all([tecnico, vendedora, cajera, categoria, unidad])
    db.commit()
    return {"tecnico": tecnico.id, "vendedora": vendedora.id, "cajera": cajera.id, "categoria": categoria.id, "unidad": unidad.id}


def _alta(api, base, codigo="SCAPC", stock=0, minimo=10, nombre="Conector SC/APC", por_pieza=False):
    r = api.post("/inv/articulos", json={
        "codigo": codigo, "nombre": nombre, "categoria_id": base["categoria"],
        "unidad_id": base["unidad"], "stock_minimo": minimo, "stock_inicial": stock, "costo_unitario": 1.5,
        "controla_por_unidad": por_pieza,
    })
    assert r.status_code == 201, r.json()
    return r.json()


def _mover(api, tipo, lineas, **extra):
    return api.post("/inv/movimientos", json={"tipo": tipo, "lineas": lineas, **extra})


def test_alta_con_stock_inicial_queda_en_el_historial(api, base):
    a = _alta(api, base, codigo=" scapc ", stock=50)
    assert a["codigo"] == "SCAPC"
    assert a["stock"] == 50 and a["estado"] == "ok"
    movs = api.get("/inv/movimientos", params={"articulo_id": a["id"]}).json()
    assert movs["total"] == 1
    assert movs["items"][0]["tipo"] == "entrada"
    assert movs["items"][0]["registrado_por"]["nombre"] == "Test Admin"


def test_codigo_repetido(api, base):
    _alta(api, base)
    r = api.post("/inv/articulos", json={"codigo": "scapc", "nombre": "Otro", "categoria_id": base["categoria"], "unidad_id": base["unidad"]})
    assert r.status_code == 409


def test_entrega_devolucion_y_consumo_cuadran(api, base):
    a = _alta(api, base, stock=100)
    linea = lambda n: [{"articulo_id": a["id"], "cantidad": n}]

    r = _mover(api, "asignacion", linea(30), persona_id=base["tecnico"])
    assert r.status_code == 201, r.json()
    mov = r.json()[0]
    assert mov["stock_resultante"] == 70
    assert mov["persona"]["nombre"] == "Rosa Técnico"
    assert mov["creado_en"]

    assert _mover(api, "devolucion", linea(5), persona_id=base["tecnico"]).status_code == 201
    assert _mover(api, "consumo", linea(20), persona_id=base["tecnico"], motivo="Instalación").status_code == 201

    art = api.get(f"/inv/articulos/{a['id']}").json()
    assert art["articulo"]["stock"] == 75
    assert art["articulo"]["en_personal"] == 5
    assert art["en_manos"] == [{"persona": {"id": base["tecnico"], "nombre": "Rosa Técnico", "rol": "tecnico"}, "cantidad": 5}]

    personal = {p["persona"]["id"]: p for p in api.get("/inv/personal").json()}
    assert personal[base["tecnico"]]["unidades"] == 5
    assert personal[base["vendedora"]]["unidades"] == 0
    assert base["cajera"] not in personal


def test_no_entrega_mas_de_lo_que_hay(api, base):
    a = _alta(api, base, stock=3)
    r = _mover(api, "asignacion", [{"articulo_id": a["id"], "cantidad": 4}], persona_id=base["tecnico"])
    assert r.status_code == 400
    assert "hay 3" in r.json()["detail"]


def test_no_devuelve_ni_consume_mas_de_lo_que_tiene(api, base):
    a = _alta(api, base, stock=10)
    _mover(api, "asignacion", [{"articulo_id": a["id"], "cantidad": 2}], persona_id=base["tecnico"])
    for tipo in ("devolucion", "consumo"):
        r = _mover(api, tipo, [{"articulo_id": a["id"], "cantidad": 3}], persona_id=base["tecnico"])
        assert r.status_code == 400, tipo
    # La vendedora no tiene nada de este material.
    r = _mover(api, "devolucion", [{"articulo_id": a["id"], "cantidad": 1}], persona_id=base["vendedora"])
    assert r.status_code == 400


def test_solo_se_entrega_a_personal_de_campo(api, base):
    a = _alta(api, base, stock=10)
    linea = [{"articulo_id": a["id"], "cantidad": 1}]
    assert _mover(api, "asignacion", linea).status_code == 400
    assert _mover(api, "asignacion", linea, persona_id=base["cajera"]).status_code == 400
    assert _mover(api, "entrada", linea, persona_id=base["tecnico"]).status_code == 400


def test_salida_pide_motivo(api, base):
    a = _alta(api, base, stock=10)
    linea = [{"articulo_id": a["id"], "cantidad": 1}]
    assert _mover(api, "salida", linea).status_code == 400
    assert _mover(api, "salida", linea, motivo="Se rompió").status_code == 201


def test_entrega_de_varias_lineas_es_todo_o_nada(api, base):
    a = _alta(api, base, codigo="A", stock=10)
    b = _alta(api, base, codigo="B", stock=1, nombre="Switch 8 puertos")
    r = _mover(api, "asignacion", [
        {"articulo_id": a["id"], "cantidad": 5},
        {"articulo_id": b["id"], "cantidad": 2},
    ], persona_id=base["tecnico"])
    assert r.status_code == 400
    assert api.get(f"/inv/articulos/{a['id']}").json()["articulo"]["stock"] == 10

    r = _mover(api, "asignacion", [
        {"articulo_id": a["id"], "cantidad": 5},
        {"articulo_id": b["id"], "cantidad": 1},
    ], persona_id=base["tecnico"])
    assert r.status_code == 201
    lotes = {m["lote"] for m in r.json()}
    assert len(lotes) == 1 and None not in lotes


def test_material_repetido_en_la_lista(api, base):
    a = _alta(api, base, stock=10)
    r = _mover(api, "entrada", [{"articulo_id": a["id"], "cantidad": 1}] * 2)
    assert r.status_code == 400


def test_estados_y_filtro_de_alertas(api, base):
    _alta(api, base, codigo="SIN", stock=0, minimo=5, nombre="Sin stock")
    _alta(api, base, codigo="BAJO", stock=5, minimo=5, nombre="Bajo")
    _alta(api, base, codigo="OK", stock=50, minimo=5, nombre="Bien")
    todos = api.get("/inv/articulos").json()
    assert [a["estado"] for a in todos] == ["sin_stock", "bajo", "ok"]
    alertas = api.get("/inv/articulos", params={"estado": "alerta"}).json()
    assert {a["codigo"] for a in alertas} == {"SIN", "BAJO"}
    resumen = api.get("/inv/resumen").json()
    assert resumen["sin_stock"] == 1 and resumen["bajo_minimo"] == 1 and resumen["articulos"] == 3
    assert resumen["valor_almacen"] == 82.5


def test_ajuste_por_conteo(api, base):
    a = _alta(api, base, stock=20)
    r = api.post(f"/inv/articulos/{a['id']}/ajuste", json={"stock_contado": 17, "motivo": "Conteo de fin de mes"})
    assert r.status_code == 200, r.json()
    assert r.json()["cantidad"] == -3 and r.json()["stock_resultante"] == 17
    r = api.post(f"/inv/articulos/{a['id']}/ajuste", json={"stock_contado": 17, "motivo": "Otra vez"})
    assert r.status_code == 400


def test_editar_no_toca_el_stock(api, base):
    a = _alta(api, base, stock=20)
    r = api.put(f"/inv/articulos/{a['id']}", json={
        "codigo": "SCAPC", "nombre": "Conector SC/APC rápido", "categoria_id": base["categoria"],
        "unidad_id": base["unidad"], "stock_minimo": 30, "activo": True,
    })
    assert r.status_code == 200
    assert r.json()["stock"] == 20 and r.json()["estado"] == "bajo"


def test_mi_material(api, base, db):
    a = _alta(api, base, stock=10)
    _mover(api, "asignacion", [{"articulo_id": a["id"], "cantidad": 4}], persona_id=MOCK_USER.id)
    # El admin no es personal de campo: no se le entrega y su lista queda vacía.
    assert api.get("/inv/mio").json() == {"material": []}


# ── Piezas con etiqueta ──────────────────────────────────────────────────────

def _piezas(api, articulo_id):
    return api.get(f"/inv/articulos/{articulo_id}/activos").json()


def test_alta_por_pieza_genera_un_codigo_por_pieza(api, base):
    a = _alta(api, base, codigo="SW8", nombre="Switch 8 puertos", stock=3, por_pieza=True)
    assert a["stock"] == 3 and a["controla_por_unidad"]
    piezas = _piezas(api, a["id"])
    assert len(piezas) == 3
    assert all(p["codigo"].startswith("ACT-") and p["estado"] == "almacen" for p in piezas)
    assert len({p["codigo"] for p in piezas}) == 3
    movs = api.get("/inv/movimientos", params={"articulo_id": a["id"]}).json()["items"]
    assert len(movs) == 3 and all(m["activo_codigo"] for m in movs)


def test_entrega_y_devolucion_por_pieza(api, base):
    a = _alta(api, base, codigo="SW8", nombre="Switch", stock=3, por_pieza=True)
    p1, p2, _ = _piezas(api, a["id"])
    r = _mover(api, "asignacion", [{"articulo_id": a["id"], "activo_ids": [p1["id"], p2["id"]]}], persona_id=base["tecnico"])
    assert r.status_code == 201, r.json()
    assert api.get(f"/inv/articulos/{a['id']}").json()["articulo"]["stock"] == 1
    estado = {p["id"]: p for p in _piezas(api, a["id"])}
    assert estado[p1["id"]]["estado"] == "asignado" and estado[p1["id"]]["persona"]["id"] == base["tecnico"]

    # La misma pieza no se entrega dos veces.
    r = _mover(api, "asignacion", [{"articulo_id": a["id"], "activo_ids": [p1["id"]]}], persona_id=base["vendedora"])
    assert r.status_code == 400 and p1["codigo"] in r.json()["detail"]
    # La vendedora no puede devolver lo que tiene el técnico.
    r = _mover(api, "devolucion", [{"articulo_id": a["id"], "activo_ids": [p1["id"]]}], persona_id=base["vendedora"])
    assert r.status_code == 400

    assert _mover(api, "devolucion", [{"articulo_id": a["id"], "activo_ids": [p1["id"]]}], persona_id=base["tecnico"]).status_code == 201
    assert _mover(api, "consumo", [{"articulo_id": a["id"], "activo_ids": [p2["id"]]}], persona_id=base["tecnico"]).status_code == 201
    estado = {p["id"]: p["estado"] for p in _piezas(api, a["id"])}
    assert estado[p1["id"]] == "almacen" and estado[p2["id"]] == "usado"
    assert api.get(f"/inv/articulos/{a['id']}").json()["articulo"]["en_personal"] == 0


def test_material_por_pieza_pide_piezas_y_a_granel_no(api, base):
    sw = _alta(api, base, codigo="SW8", nombre="Switch", stock=2, por_pieza=True)
    cable = _alta(api, base, codigo="UTP", nombre="Cable", stock=50)
    assert _mover(api, "asignacion", [{"articulo_id": sw["id"], "cantidad": 1}], persona_id=base["tecnico"]).status_code == 400
    pieza = _piezas(api, sw["id"])[0]
    assert _mover(api, "asignacion", [{"articulo_id": cable["id"], "activo_ids": [pieza["id"]]}], persona_id=base["tecnico"]).status_code == 400


def test_entrada_por_pieza_crea_piezas_con_serie(api, base):
    a = _alta(api, base, codigo="RT", nombre="Router", por_pieza=True)
    r = _mover(api, "entrada", [{"articulo_id": a["id"], "cantidad": 2, "numeros_serie": ["SN-1", "SN-2"]}])
    assert r.status_code == 201 and len(r.json()) == 2
    assert {p["numero_serie"] for p in _piezas(api, a["id"])} == {"SN-1", "SN-2"}


def test_escanear_pieza_serie_y_material(api, base):
    a = _alta(api, base, codigo="RT", nombre="Router", por_pieza=True)
    _mover(api, "entrada", [{"articulo_id": a["id"], "cantidad": 1, "numeros_serie": ["ZTEG123"]}])
    pieza = _piezas(api, a["id"])[0]
    r = api.get("/inv/escanear", params={"codigo": pieza["codigo"].lower()}).json()
    assert r["tipo"] == "activo" and r["activo"]["id"] == pieza["id"]
    assert api.get("/inv/escanear", params={"codigo": "ZTEG123"}).json()["activo"]["id"] == pieza["id"]
    assert api.get("/inv/escanear", params={"codigo": "rt"}).json()["tipo"] == "material"
    assert api.get("/inv/escanear", params={"codigo": "NADA"}).status_code == 404


def test_etiquetar_material_existente_respeta_lo_que_tiene_cada_uno(api, base):
    a = _alta(api, base, codigo="CLV", nombre="Cleaver", stock=4)
    _mover(api, "asignacion", [{"articulo_id": a["id"], "cantidad": 1}], persona_id=base["tecnico"])
    r = api.post(f"/inv/articulos/{a['id']}/etiquetar")
    assert r.status_code == 200, r.json()
    piezas = r.json()
    assert len(piezas) == 4
    assert sum(1 for p in piezas if p["estado"] == "asignado" and p["persona"]["id"] == base["tecnico"]) == 1
    assert api.post(f"/inv/articulos/{a['id']}/etiquetar").status_code == 400
    # Ya no se ajusta por conteo: se mueve por pieza.
    assert api.post(f"/inv/articulos/{a['id']}/ajuste", json={"stock_contado": 1, "motivo": "conteo"}).status_code == 400
    personal = {p["persona"]["id"]: p for p in api.get("/inv/personal").json()}
    assert len(personal[base["tecnico"]]["material"][0]["piezas"]) == 1


def test_unidades_de_medida(api, base):
    r = api.post("/inv/unidades", json={"nombre": " Bobina ", "plural": "Bobinas", "abreviatura": "BOB"})
    assert r.status_code == 201 and r.json()["nombre"] == "bobina"
    assert api.post("/inv/unidades", json={"nombre": "bobina", "plural": "x", "abreviatura": "x"}).status_code == 409
    _alta(api, base)
    unidades = {u["nombre"]: u for u in api.get("/inv/unidades").json()}
    assert unidades["unidad"]["materiales"] == 1
    assert api.delete(f"/inv/unidades/{base['unidad']}").status_code == 409
    assert api.delete(f"/inv/unidades/{r.json()['id']}").status_code == 204
