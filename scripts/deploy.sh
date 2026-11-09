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
echo "El panel y la API se sirven por el dominio configurado en nginx/nginx.conf."
echo ""
echo "Si es la primera instalación (base de datos vacía), el administrador"
echo "inicial se crea con ADMIN_INICIAL_PASSWORD del .env. Si esa variable"
echo "está vacía, la contraseña generada aparece UNA sola vez aquí:"
echo "  docker compose logs backend | grep -A2 'PRIMER ARRANQUE'"
echo "Cámbiala al entrar. Ver MANUAL_PRIVADO_SEGURIDAD_WISP-ISP.md."
