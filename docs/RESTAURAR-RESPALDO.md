# Restaurar un respaldo de la base de datos

> Un respaldo que no se ha restaurado nunca no es un respaldo: es un archivo.
> Este procedimiento se ejecutó completo el 2026-11-24 y funcionó. Conviene
> repetirlo cada trimestre, porque lo que se comprueba no es solo el archivo:
> es que el procedimiento sigue siendo correcto después de los cambios.

## Qué hay y dónde

| | |
|---|---|
| Se hace | Todas las noches a las 03:30 (hora Lima), automático, y cuando alguien pulsa el botón en Configuración → Respaldos |
| Dónde queda | `/opt/wisp-isp/backups` en el servidor (montado como `/backups` dentro del contenedor) |
| Cuántos se guardan | Los 7 más recientes; al crear el octavo se borra el más viejo |
| Qué contiene | La base completa: clientes, pagos, gastos, usuarios, zonas, historial |
| Qué NO contiene | Las fotos y comprobantes (`/opt/wisp-isp/media`) ni el `.env` |

Que el `media/` quede fuera es importante y no es un olvido: las evidencias y
los comprobantes son archivos, no base de datos, y hay que respaldarlos
aparte.

## Comprobar que un respaldo sirve, sin tocar la base real

Esto se puede hacer cualquier día, en producción, sin riesgo: se restaura en
una base nueva que se borra al terminar.

```sh
# 1. El respaldo más reciente
ARCH=$(docker exec wisp_backend sh -c 'ls -t /backups | head -1')
echo "$ARCH"

# 2. ¿El archivo está completo? (si esto falla, el respaldo no sirve)
docker exec wisp_backend sh -c "gunzip -t /backups/$ARCH" && echo "gzip válido"

# 3. Cuántas filas hay AHORA en la base real
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT (SELECT count(*) FROM clientes) AS clientes,
         (SELECT count(*) FROM pagos)    AS pagos,
         (SELECT count(*) FROM usuarios) AS usuarios,
         (SELECT count(*) FROM zonas)    AS zonas;"

# 4. Una base desechable y la restauración
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS prueba_restauracion;" \
  -c "CREATE DATABASE prueba_restauracion;"

docker exec wisp_backend sh -c \
  "gunzip -c /backups/$ARCH" | \
  docker exec -i wisp_postgres psql -U "$POSTGRES_USER" -d prueba_restauracion -q

# 5. Las mismas cuentas de arriba, en la restaurada
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d prueba_restauracion -c "
  SELECT (SELECT count(*) FROM clientes) AS clientes,
         (SELECT count(*) FROM pagos)    AS pagos,
         (SELECT count(*) FROM usuarios) AS usuarios,
         (SELECT count(*) FROM zonas)    AS zonas;"

# 6. Y que las restricciones viajaron (no solo los datos)
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d prueba_restauracion -c "
  SELECT conname FROM pg_constraint
  WHERE conrelid='pagos'::regclass AND contype='u';"
# Tiene que listar uq_pagos_cliente_mes y uq_pagos_numero_operacion.

# 7. Limpieza
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE prueba_restauracion;"
```

Si los números de los pasos 3 y 5 coinciden y el 6 lista las dos
restricciones, el respaldo sirve.

## Restaurar de verdad, encima de la base de producción

**Esto destruye la base actual.** Solo cuando ya se ha perdido.

```sh
# 1. PARAR el backend primero. Si sigue vivo, escribirá sobre lo que se
#    está restaurando y el resultado será una mezcla de dos bases.
docker compose stop backend

# 2. Guardar lo que haya ahora, aunque parezca inservible: puede tener filas
#    que el respaldo no tiene, y a veces se recuperan a mano.
docker exec wisp_postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "antes-de-restaurar-$(date +%Y%m%d_%H%M%S).sql.gz"

# 3. Base limpia
docker exec wisp_postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE \"$POSTGRES_DB\";" \
  -c "CREATE DATABASE \"$POSTGRES_DB\";"

# 4. Restaurar
gunzip -c /opt/wisp-isp/backups/wisp_AAAAMMDD_HHMMSS.sql.gz | \
  docker exec -i wisp_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 5. Levantar. El entrypoint corre `alembic upgrade head`, así que si el
#    respaldo es de una versión anterior del esquema, las migraciones que
#    falten se aplican solas.
docker compose start backend
docker compose logs -f backend   # mirar que arranca sin errores

# 6. Comprobar a mano, en el panel: que la lista de clientes carga, que el
#    último pago registrado está, y que el calendario de un cliente cuadra.
```

## Lo que falta y conviene saber

**Los respaldos están en el mismo disco que la base.** Un fallo de disco, un
cifrado por ransomware o un `rm` desafortunado se lleva la base y los siete
respaldos a la vez. El trabajo nocturno protege de los borrados por error, no
de perder la máquina. Falta la copia fuera del servidor.

**Aviso de versiones.** El contenedor del backend trae `pg_dump` 17 y el
servidor es PostgreSQL 15 (Debian trixie solo empaqueta el cliente 17). La
restauración funciona, pero el dump emite `SET transaction_timeout = 0`, que
PG15 no conoce, y psql lo anota como `ERROR` y sigue. Es ruido inofensivo
**hoy**; el problema es que ese ruido taparía un error de verdad justo el día
que haya que restaurar con prisa. Dos salidas, las dos son decisión del
negocio:

- añadir el repositorio PGDG al `backend/Dockerfile` e instalar
  `postgresql-client-15`, para que el cliente coincida con el servidor; o
- subir el servidor a PostgreSQL 17, que es una actualización de versión mayor
  y pide su propio plan.

**No hay RPO ni RTO escritos.** Con el trabajo nocturno, lo que se puede
perder son las horas transcurridas desde las 03:30. Conviene decidir si eso es
aceptable para los pagos del día y escribirlo.
