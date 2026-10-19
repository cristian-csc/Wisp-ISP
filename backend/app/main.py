from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from . import models
from .routers import (
    clientes, zonas, pagos, gastos, auth, whatsapp, dashboard, planes, admin,
    cliente_app, cajas_nap, onus, averias, ordenes_retiro, evidencias, mufas,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # El esquema lo gestiona Alembic (alembic upgrade head), no create_all.
    # Ver docker-entrypoint.sh / README para el flujo de migraciones.
    from .seed import seed_initial_data
    from .database import SessionLocal
    from .scheduler import init_scheduler, stop_scheduler
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    init_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="TUX-ISP API",
    description="Sistema de gestión para ISP WISP",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dominiowisp.com",  # placeholder — reemplazar por el dominio real cuando lo compren
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:8081",
        "http://localhost:19006",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["Clientes"])
app.include_router(zonas.router, prefix="/api/zonas", tags=["Zonas"])
app.include_router(pagos.router, prefix="/api/pagos", tags=["Pagos"])
app.include_router(gastos.router, prefix="/api/gastos", tags=["Gastos"])
app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["WhatsApp"])
app.include_router(planes.router, prefix="/api/planes", tags=["Planes"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(cliente_app.router, prefix="/api/cliente", tags=["App Cliente"])
app.include_router(cajas_nap.router, prefix="/api/cajas-nap", tags=["Cajas NAP"])
app.include_router(mufas.router, prefix="/api/mufas", tags=["Mufas"])
app.include_router(onus.router, prefix="/api/onus", tags=["ONUs"])
app.include_router(averias.router, prefix="/api/averias", tags=["Averías"])
app.include_router(ordenes_retiro.router, prefix="/api/ordenes-retiro", tags=["Órdenes de retiro"])
app.include_router(evidencias.router, prefix="/api/evidencias", tags=["Evidencias"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "TUX-ISP", "version": "1.0.0"}
