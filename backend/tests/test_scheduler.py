"""El trabajo nocturno no puede congelar el API.

La API corre con un único proceso de uvicorn, sin `--workers`. Y
`job_corte_automatico` es `async def`, así que se ejecuta en el bucle de
eventos. Dentro llamaba directamente a `cortar_cliente`, que es síncrona y
hace, por cada cliente, una petición HTTP a WhatsApp (8 s de timeout) y una
conexión SSH nueva al MikroTik (10 s de conexión + 10 s por comando). Ninguna
de las dos cede el control.

Mientras el trabajo de las 09:00 corría, la API entera estaba parada: el panel
no respondía, la app móvil no respondía, el bot no respondía. Con 100 clientes
a cortar y una zona cuyo router no contesta, son 15-30 minutos de caída total,
todos los días, en horario de oficina.

Estas pruebas no miden tiempos —serían lentas y poco fiables— sino que
comprueban lo que de verdad importa: que el trabajo bloqueante se ejecuta en
OTRO hilo, no en el del bucle de eventos.
"""
import asyncio
import inspect
import logging
import threading

import pytest

from app import scheduler as sched


def test_el_corte_corre_fuera_del_bucle_de_eventos(monkeypatch, db):
    """`cortar_cliente` tiene que ejecutarse en un hilo del pool, no en el
    hilo del bucle. Si vuelve a correr en el bucle, esta prueba lo caza."""
    from app import models
    from tests.conftest import crear_cliente, crear_plan, crear_zona
    from datetime import date, timedelta

    zona, plan = crear_zona(db), crear_plan(db)
    vencido = date.today() - timedelta(days=30)
    crear_cliente(db, zona, plan, estado="activo", fecha_vencimiento=vencido)

    # La sesión del job apunta a la misma base en memoria que la fixture.
    monkeypatch.setattr(sched, "SessionLocal", lambda: db)

    hilos_del_corte: list[int] = []

    def cortar_falso(db_, cliente, motivo):
        hilos_del_corte.append(threading.get_ident())

    import app.routers.clientes as clientes_mod
    monkeypatch.setattr(clientes_mod, "cortar_cliente", cortar_falso)

    hilo_del_bucle: list[int] = []

    async def correr():
        hilo_del_bucle.append(threading.get_ident())
        return await sched.job_corte_automatico()

    resultado = asyncio.run(correr())

    assert resultado["candidatos"] >= 1, "la prueba no preparó ningún candidato"
    assert hilos_del_corte, "no se llegó a cortar a nadie"
    assert all(h != hilo_del_bucle[0] for h in hilos_del_corte), (
        "cortar_cliente volvió a ejecutarse en el hilo del bucle de eventos: "
        "mientras corra el trabajo nocturno, la API estará parada"
    )


def test_el_bucle_sigue_respondiendo_durante_el_corte(monkeypatch, db):
    """Comprobación complementaria: con el corte en marcha, el bucle de
    eventos puede seguir atendiendo otras tareas."""
    from datetime import date, timedelta
    from tests.conftest import crear_cliente, crear_plan, crear_zona

    zona, plan = crear_zona(db), crear_plan(db)
    vencido = date.today() - timedelta(days=30)
    for i in range(3):
        crear_cliente(db, zona, plan, estado="activo",
                      fecha_vencimiento=vencido, usuario_pppoe=f"cli_{i}")

    monkeypatch.setattr(sched, "SessionLocal", lambda: db)

    import time

    def cortar_lento(db_, cliente, motivo):
        time.sleep(0.15)   # imita el SSH y el HTTP, sin ceder el control

    import app.routers.clientes as clientes_mod
    monkeypatch.setattr(clientes_mod, "cortar_cliente", cortar_lento)

    latidos = {"n": 0}

    async def latir():
        """Si el bucle estuviera bloqueado, esto no avanzaría."""
        try:
            while True:
                await asyncio.sleep(0.02)
                latidos["n"] += 1
        except asyncio.CancelledError:
            pass

    async def correr():
        pulso = asyncio.create_task(latir())
        await sched.job_corte_automatico()
        pulso.cancel()
        await asyncio.gather(pulso, return_exceptions=True)

    asyncio.run(correr())

    assert latidos["n"] >= 3, (
        f"el bucle solo latió {latidos['n']} veces mientras se cortaba a 3 "
        "clientes: sigue bloqueado"
    )


def test_las_notificaciones_no_son_async():
    """`get_notificaciones` hace cinco bloques de consultas síncronas y una
    llamada al bot de hasta 10 s. Siendo `async def` todo eso corre en el
    bucle de eventos, y el panel la consulta cada 30 segundos desde cada
    pestaña abierta: con tres administradores, la API se detiene varias veces
    por minuto.

    Declarada como `def` normal, FastAPI la lleva al pool de hilos sola. Es el
    arreglo de una palabra, y esta prueba es la que impide que alguien le
    devuelva el `async` sin darse cuenta.
    """
    from app.routers import clientes

    assert not inspect.iscoroutinefunction(clientes.get_notificaciones), (
        "get_notificaciones volvió a ser async def: sus consultas y su "
        "llamada al bot bloquean el bucle de eventos en cada sondeo del panel"
    )


def test_el_respaldo_diario_esta_programado():
    """El respaldo tiene que estar en el planificador, no solo escrito.

    Hasta ahora el único respaldo era el que alguien se acordara de pulsar en
    el panel: no había cron, ni trabajo aquí, ni nada en scripts/. El RPO real
    era «desde el último que alguien recordó hacer».
    """
    from apscheduler.triggers.cron import CronTrigger

    # init_scheduler() arranca un AsyncIOScheduler, que exige un bucle de
    # eventos corriendo: por eso va dentro de asyncio.run y no a pelo.
    async def arrancar_y_mirar():
        sched.scheduler.remove_all_jobs()
        sched.init_scheduler()
        try:
            return {t.id: type(t.trigger).__name__ for t in sched.scheduler.get_jobs()}
        finally:
            sched.scheduler.shutdown(wait=False)

    trabajos = asyncio.run(arrancar_y_mirar())

    assert "backup_diario" in trabajos, (
        f"el respaldo no está programado; hay {sorted(trabajos)}"
    )
    assert trabajos["backup_diario"] == CronTrigger.__name__
    # Y los que ya había siguen ahí.
    assert {"recordatorio_preventivo", "corte_automatico"} <= set(trabajos)


def test_el_respaldo_corre_fuera_del_bucle_de_eventos(monkeypatch):
    """pg_dump es un proceso externo: esperarlo en el bucle pararía la API,
    igual que pasaba con los cortes."""
    from app.routers import admin as admin_mod

    hilos: list[int] = []

    def backup_falso():
        hilos.append(threading.get_ident())
        return {"filename": "wisp_prueba.sql.gz", "size_kb": 1, "ruta": "/x"}

    monkeypatch.setattr(admin_mod, "hacer_backup", backup_falso)

    hilo_del_bucle: list[int] = []

    async def correr():
        hilo_del_bucle.append(threading.get_ident())
        return await sched.job_backup_diario()

    resultado = asyncio.run(correr())
    assert resultado["ok"] is True
    assert hilos and hilos[0] != hilo_del_bucle[0], (
        "el respaldo corre en el hilo del bucle de eventos"
    )


def test_un_respaldo_que_falla_se_anota_como_error(monkeypatch, caplog):
    """Un respaldo que falla en silencio es exactamente cómo se pierde una
    base de datos."""
    from app.routers import admin as admin_mod

    def backup_roto():
        raise RuntimeError("el disco está lleno")

    monkeypatch.setattr(admin_mod, "hacer_backup", backup_roto)

    with caplog.at_level(logging.ERROR):
        resultado = asyncio.run(sched.job_backup_diario())

    assert resultado["ok"] is False
    assert "disco está lleno" in caplog.text
    assert any(r.levelno >= logging.ERROR for r in caplog.records), (
        "el fallo del respaldo no se anotó como ERROR"
    )
