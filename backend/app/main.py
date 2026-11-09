from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from . import models
from .config import es_produccion, origenes_cors
from .routers import (
    clientes, zonas, pagos, gastos, auth, whatsapp, dashboard, planes, admin,
    cliente_app, cajas_nap, onus, averias, ordenes_retiro, evidencias, mufas,
    jornadas, consultas,
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


# En producción la documentación interactiva queda cerrada: regala el mapa
# completo de la API (rutas, campos, ejemplos) a cualquiera que entre.
_DOCS = None if es_produccion() else "/docs"
_REDOC = None if es_produccion() else "/redoc"
_OPENAPI = None if es_produccion() else "/openapi.json"

app = FastAPI(
    title="WISP-ISP API",
    description="WISP Control — sistema de gestión para WISP Ingeniería en Redes y Telecomunicaciones",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=_DOCS,
    redoc_url=_REDOC,
    openapi_url=_OPENAPI,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes_cors(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cabeceras_de_seguridad(request: Request, call_next):
    """Cabeceras mínimas en toda respuesta de la API.

    Lo importante es `no-store` en /api/: las respuestas llevan datos de
    clientes y de dinero, y sin esto el navegador —o una caché intermedia
    como Cloudflare— podría guardarlas y enseñárselas a otra persona.
    """
    respuesta = await call_next(request)
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    respuesta.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        respuesta.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        respuesta.headers["Pragma"] = "no-cache"
    return respuesta

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
app.include_router(jornadas.router, prefix="/api/jornadas", tags=["Jornadas"])
app.include_router(consultas.router, prefix="/api/consultas", tags=["Consultas"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "WISP-ISP", "version": "1.0.0"}
