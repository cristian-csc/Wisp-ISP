#!/bin/bash
# Script de despliegue TUX-ISP en VPS 161.132.48.127

set -e

echo "=== TUX-ISP Deploy ==="

# docker-compose.yml ya no trae secretos embebidos: exige un .env real junto a él.
if [ ! -f ".env" ]; then
  echo "ERROR: no existe .env en $(pwd). Copia .env.example a .env y completa los valores reales antes de desplegar." >&2
  exit 1
fi

# Detener contenedores anteriores
docker compose down --remove-orphans 2>/dev/null || true

# Construir imágenes
docker compose build --no-cache

# Levantar servicios
docker compose up -d

# Esperar a que la base de datos esté lista
echo "Esperando base de datos..."
sleep 10

# Verificar estado
docker compose ps

echo ""
echo "=== Deploy completado ==="
echo "Frontend: http://161.132.48.127"
echo "API:      http://161.132.48.127/api"
echo "Docs API: http://161.132.48.127/api/docs"
echo ""
echo "Credenciales por defecto:"
echo "  Email:    admin@dominiowisp.com"
echo "  Password: admin2024"
