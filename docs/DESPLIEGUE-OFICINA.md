# Despliegue en la PC de la oficina (prueba de un mes)

Guía para poner **WISP-ISP** a funcionar en una PC propia, publicado en internet
con el dominio de Cloudflare, sin abrir puertos del router y sin IP pública.

> **Sobre los nombres.** En una instalación **nueva** todo se llama `wisp`:
> los contenedores (`wisp_postgres`, `wisp_backend`…), las carpetas de datos
> en `/opt/wisp-isp/` y la base. En la instalación que ya está en producción
> siguen diciendo `tuxtell` **a propósito**, porque son identificadores con los
> que ya hay datos guardados y renombrarlos haría que Docker creara una base
> vacía. Dos excepciones que **no** se renombran nunca: `SSH_USER` y
> `SSH_KEY_PATH`, porque el usuario y la llave viven dentro de los MikroTik,
> no aquí. Procedimiento con respaldo para renombrar una instalación con datos:
> `MANUAL_PRIVADO_SEGURIDAD_WISP-ISP.md`.

**Hardware de referencia:** AMD A8-7600 (4 núcleos), 4 GB RAM, 450 GB disco.
Suficiente: el sistema completo consume entre 1.3 y 1.8 GB en reposo.

---

## 1. Antes de instalar nada

**En la BIOS/UEFI de la PC**, busca la opción `Restore on AC Power Loss` (o
"Estado tras corte de energía") y ponla en **Power On**. Sin esto, después de un
corte de luz el servidor no vuelve solo: alguien tiene que ir a encenderlo.

**Compra un UPS.** Es lo único que recomiendo comprar desde ya, porque te sirve
igual cuando migres al servidor definitivo. Un corte de luz en mitad de una
escritura de PostgreSQL puede corromper la base de datos; con clientes y pagos
registrados eso es perder trabajo real.

**Revisa la salud del disco** antes de confiarle datos. Es la pieza con más
probabilidad de fallar en una PC vieja:

```bash
sudo apt install -y smartmontools
sudo smartctl -H /dev/sda
sudo smartctl -A /dev/sda | grep -i reallocated
```

El primero debe decir `PASSED`; el segundo, 0 sectores reasignados.

---

## 2. Instalar Ubuntu Server

Descarga **Ubuntu Server 24.04 LTS** (64 bits). El A8-7600 es x86-64, así que
corre sin problema. Durante la instalación:

- **No instales entorno gráfico.** No hace falta y consume RAM.
- Marca **OpenSSH server**, para administrar la PC desde tu laptop.
- Deja el disco con el particionado automático.

Después de instalar, desde tu laptop:

```bash
ssh usuario@IP-DE-LA-PC
sudo apt update && sudo apt upgrade -y
```

---

## 3. Memoria de intercambio (swap) — IMPORTANTE

Con 4 GB de RAM esto no es opcional. Compilar el frontend (`npm run build`
dentro de Docker) puede pedir entre 1.5 y 2 GB de golpe, y si coincide con los
demás servicios encendidos, la compilación muere a medio camino.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

La última línea debe mostrar 4.0Gi en la fila `Swap`.

---

## 4. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Cierra la sesión SSH y vuelve a entrar para que el grupo tome efecto. Verifica:

```bash
docker --version && docker compose version
```

---

## 5. Copiar el proyecto y configurarlo

```bash
sudo mkdir -p /opt/wisp-isp/backups /opt/wisp-isp/media
sudo chown -R $USER:$USER /opt/wisp-isp
```

Clona el repositorio y crea el `.env`:

```bash
cd ~
git clone https://github.com/cristian-csc/Wisp-ISP.git
cd Wisp-ISP
cp .env.example .env
chmod 600 .env
nano .env
```

Valores que debes completar de verdad:

| Variable | Qué poner |
|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Los que quieras, con una contraseña larga |
| `DATABASE_URL` | Debe coincidir con los tres de arriba |
| `SECRET_KEY` | Genérala con `openssl rand -hex 32` — **no reutilices la de desarrollo** |
| `BACKUP_DIR` | `/opt/wisp-isp/backups` |
| `MEDIA_DIR` | `/opt/wisp-isp/media` |
| `ENTORNO` | `produccion` — activa las protecciones y esconde `/docs` |
| `CORS_ORIGINS` | El dominio, ej. `https://wispfibra.com,https://www.wispfibra.com`. En producción es obligatorio: vacío, el backend no arranca |
| `WHATSAPP_API_TOKEN` | Genérala con `openssl rand -hex 24`. La misma clave la comparten el backend y el bot |
| `NGINX_CONF` | `nginx.cloudflare.conf` (ver paso 6) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Lo obtienes en el paso 7 |

---

## 6. Usar la configuración de Nginx para Cloudflare

El `nginx/nginx.conf` que viene en el proyecto es para un VPS con IP pública:
exige certificados de Let's Encrypt y **Nginx no arranca sin ellos**. Detrás del
túnel no hacen falta, porque el HTTPS lo pone Cloudflare.

No hay que copiar ni editar nada: se elige con una variable del `.env`.

```
NGINX_CONF=nginx.cloudflare.conf
```

Los dos archivos quedan en el repositorio, así que volver al modo VPS es
cambiar esa línea. Se hace con una variable y no copiando archivos a propósito:
si se editara `nginx/nginx.conf` en el servidor, el siguiente `git pull`
chocaría con ese cambio local y habría que resolverlo a mano cada vez.

---

## 7. Crear el túnel de Cloudflare

En el panel de Cloudflare, entra a **Zero Trust → Networks → Tunnels**:

1. **Create a tunnel** → tipo **Cloudflared** → ponle un nombre (ej. `oficina-tuxisp`).
2. Cloudflare te muestra un comando de instalación: **no lo ejecutes**. Lo único
   que necesitas es el **token**, la cadena larga que aparece en ese comando
   después de `--token`. El túnel lo levanta Docker por ti.
3. Pega ese token en el `.env`, en `CLOUDFLARE_TUNNEL_TOKEN=`.
4. En la pestaña **Public Hostnames**, agrega:
   - **Subdomain:** vacío, o `app` si no quieres usar el dominio raíz
   - **Domain:** tu dominio
   - **Service → Type:** `HTTP`
   - **URL:** `nginx:80`

Ese `nginx:80` es el nombre del contenedor dentro de Docker, no una dirección de
internet. Por eso no hay que abrir ningún puerto en el router.

---

## 8. Levantar todo

```bash
cd ~/Wisp-ISP
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build
```

La primera vez tarda bastante: compila el frontend y descarga Chromium para el
servicio de WhatsApp. Verifica:

```bash
docker compose ps
docker compose logs -f cloudflared
free -h
```

Todos los contenedores deben estar en `running`, y el log del túnel debe decir
`Registered tunnel connection`. Entra a tu dominio desde el navegador: debería
cargar con candado de HTTPS.

---

## 9. Respaldos automáticos

Tu backend ya tiene la función de backup, pero durante la prueba conviene que
una copia **salga de esa PC**. Lo mínimo:

```bash
crontab -e
```

Agrega estas dos líneas, cambiando `USUARIO` y `BASEDATOS` por los de tu `.env`:

```
0 3 * * * docker exec wisp_postgres pg_dump -U USUARIO BASEDATOS | gzip > /opt/wisp-isp/backups/db_$(date +\%F).sql.gz
0 4 * * 0 find /opt/wisp-isp/backups -name "db_*.sql.gz" -mtime +30 -delete
```

La primera hace una copia diaria a las 3 a.m.; la segunda borra las de más de 30
días para que no se llene el disco.

Y una vez por semana, cópialas a tu laptop:

```bash
scp usuario@IP-DE-LA-PC:/opt/wisp-isp/backups/db_*.sql.gz ~/respaldos-wisp/
```

---

## 10. Qué vigilar durante el mes de prueba

No es el procesador lo que va a fallar. Vigila esto:

| Qué | Cómo | Señal de alarma |
|---|---|---|
| **Chromium de WhatsApp** | `docker stats wisp_whatsapp` | Si pasa de 1.5 GB o la sesión se cae seguido: `docker compose restart whatsapp` |
| **RAM libre** | `free -h` | Si el swap se usa todo el tiempo, el equipo se quedó corto |
| **Disco** | `df -h` | Las fotos de evidencias crecen; que no se llene |
| **Cortes de luz** | ¿Volvió solo el servidor? | Si no, revisa la opción de BIOS del paso 1 |

---

## 11. Migrar al servidor definitivo (dentro de un mes)

Está pensado para que sea rápido. En la PC vieja:

```bash
cd ~/Wisp-ISP
docker exec wisp_postgres pg_dump -U USUARIO BASEDATOS | gzip > ~/migracion-db.sql.gz
tar czf ~/migracion-media.tar.gz -C /opt/wisp-isp media
```

Te llevas tres cosas: `migracion-db.sql.gz`, `migracion-media.tar.gz` y el
archivo `.env`.

En el servidor nuevo repite los pasos 2 al 8, pero antes de levantar todo,
restaura la base:

```bash
docker compose up -d postgres
sleep 10
gunzip -c migracion-db.sql.gz | docker exec -i wisp_postgres psql -U USUARIO BASEDATOS
tar xzf migracion-media.tar.gz -C /opt/wisp-isp
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build
```

**El dominio no requiere ningún cambio.** Creas el túnel nuevo en Cloudflare,
pones su token en el `.env` del servidor nuevo y apuntas el hostname ahí. Los
clientes no notan nada: no hay DNS que esperar ni certificados que reemitir.

La sesión de WhatsApp sí se pierde — hay que volver a escanear el QR una vez.

---

## Nota sobre MikroTik y WireGuard

El `docker-compose.yml` monta `/etc/wireguard` y `/root/.ssh` para la gestión de
los MikroTik. Si en esta prueba todavía no vas a usar esa parte, créalas vacías
para que Docker no falle:

```bash
sudo mkdir -p /etc/wireguard /root/.ssh
```

Esas funciones simplemente no estarán disponibles hasta que configures las
llaves; el resto del sistema funciona igual.
