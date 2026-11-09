#!/bin/sh
# Aplica migraciones pendientes antes de levantar la API.
# En instalaciones ya existentes que vengan del esquema viejo (create_all,
# sin alembic_version), hay que correr una sola vez:
#   docker compose exec backend alembic stamp head
# antes del primer deploy con este entrypoint — si no, "alembic upgrade head"
# intentará crear tablas que ya existen y fallará.
set -e

echo "Aplicando migraciones (alembic upgrade head)..."
alembic upgrade head

# --reload vigila los archivos del proyecto todo el tiempo: cómodo mientras se
# programa, un desperdicio de memoria en el servidor (y un reinicio silencioso
# de la API cada vez que algo toca un archivo). Se activa solo fuera de
# producción, mirando el mismo ENTORNO que usa el backend.
case "$(printf '%s' "${ENTORNO:-desarrollo}" | tr 'A-Z' 'a-z')" in
  produccion|producción|production|prod)
    echo "Iniciando API (produccion)..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
    ;;
  *)
    echo "Iniciando API (desarrollo, con recarga automatica)..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ;;
esac
