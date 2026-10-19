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

echo "Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
