from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from . import models, registro
from . import acceso
from .config import es_produccion, origenes_cors, settings

# Lo primero de todo, antes de que cualquier módulo pueda anotar algo: sin
# esto el logger raíz descarta todo lo que esté por debajo de WARNING, y cada
# logger.info() del proyecto no se escribe en ninguna parte. Ver registro.py.
registro.configurar(settings.LOG_LEVEL)
from .routers import (
    clientes, zonas, pagos, gastos, auth, whatsapp, dashboard, planes, admin,
    cliente_app, cajas_nap, onus, averias, ordenes_retiro, evidencias, mufas,
    jornadas, consultas, permisos, materiales,
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

def montar(router, prefix: str, tags: list) -> None:
    """Incluye un router y apunta la ruta completa de sus endpoints.

    Las dos cosas van juntas a proposito. acceso.py decide los permisos de
    modulo por la ruta completa, y un router incluido sin registrar deja de
    aplicar sus reglas en silencio. Lo vigila tests/test_ruta_de_permisos.py.
    """
    app.include_router(router, prefix=prefix, tags=tags)
    acceso.registrar_rutas(router, prefix)


montar(auth.router, prefix="/api/auth", tags=["Auth"])
montar(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
montar(clientes.router, prefix="/api/clientes", tags=["Clientes"])
montar(zonas.router, prefix="/api/zonas", tags=["Zonas"])
montar(pagos.router, prefix="/api/pagos", tags=["Pagos"])
montar(gastos.router, prefix="/api/gastos", tags=["Gastos"])
montar(whatsapp.router, prefix="/api/whatsapp", tags=["WhatsApp"])
montar(planes.router, prefix="/api/planes", tags=["Planes"])
montar(admin.router, prefix="/api/admin", tags=["Admin"])
montar(cliente_app.router, prefix="/api/cliente", tags=["App Cliente"])
montar(cajas_nap.router, prefix="/api/cajas-nap", tags=["Cajas NAP"])
montar(mufas.router, prefix="/api/mufas", tags=["Mufas"])
montar(onus.router, prefix="/api/onus", tags=["ONUs"])
montar(averias.router, prefix="/api/averias", tags=["Averías"])
montar(ordenes_retiro.router, prefix="/api/ordenes-retiro", tags=["Órdenes de retiro"])
montar(evidencias.router, prefix="/api/evidencias", tags=["Evidencias"])
montar(jornadas.router, prefix="/api/jornadas", tags=["Jornadas"])
montar(consultas.router, prefix="/api/consultas", tags=["Consultas"])
montar(permisos.router, prefix="/api/permisos", tags=["Roles y módulos"])
montar(materiales.router, prefix="/api/materiales", tags=["Materiales"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "WISP-ISP", "version": "1.0.0"}
