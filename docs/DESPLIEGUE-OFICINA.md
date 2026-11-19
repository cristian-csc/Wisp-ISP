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

La primera vez tarda bastante: compila el frontend y el backend. Verifica:

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
| **Servicio de WhatsApp** | `docker stats wisp_whatsapp` | Tiene techo de 512 MB y 0.5 CPU. Si se acerca al techo o la sesión se cae seguido: `docker compose restart whatsapp` |
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

## 12. Añadir una zona nueva (un MikroTik más)

Esta parte costó una tarde la primera vez. Si sigues el orden de aquí, son
quince minutos.

### Lo primero: quién habla con los routers

Dos máquinas distintas, y conviene no confundirlas nunca:

```
Servidor de la OFICINA                     VPS
┌────────────────────────┐        ┌──────────────┐
│ Aquí corre el sistema    │        │ Solo el túnel│
│ (wisp_backend)           │        │ WireGuard    │
│ Llave: la del backend    │        │ Llave: la de │
│   ← ESTA es la que        │        │  tu acceso   │
│     necesita el panel    │        │  manual      │
└───────────┬────────────┘        └──────┬───────┘
            └──────── túnel ────────────┘
                         │
                  MikroTik 10.20.0.x
```

**El sistema solo usa la llave del servidor de la oficina.** La de la VPS es
tu herramienta de mano: sirve para entrar tú, no para que el panel traiga
datos. Probar con `ssh` desde la VPS no demuestra que el sistema funcione.

Las llaves pertenecen a las **máquinas**, no a los routers: no se generan
nuevas por cada MikroTik. Un router nuevo solo tiene que **conocer las dos
que ya existen**.

### Cómo se llaman, para no perderse

| Archivo | De quién es | Para qué |
|---|---|---|
| `wisp_api` (VPS) | La VPS | Entrar tú a mano a los routers |
| `oficina` (servidor de la oficina) | El backend | Lo que usa el sistema |

Los `.pub` son públicos: se copian, se guardan y se suben a los routers sin
riesgo. Las privadas **no salen nunca** de su máquina.

> Si al generar una llave le pones comentario (`ssh-keygen -C "oficina"`), el
> router te lo muestra en la columna KEY-OWNER y puedes distinguirlas. Sin
> eso, dos llaves distintas se ven iguales en `/user ssh-keys print`.

### Los cinco pasos

**1. El túnel.** Dale al router una IP `10.20.0.x` y crea su peer. Comprueba
desde el servidor de la oficina, no desde la VPS:

```bash
ping -c 3 10.20.0.X
sudo wg show
```

En `allowed ips` tiene que entrar esa IP. Con `10.20.0.0/24` ya están todas;
si dijera `10.20.0.2/32`, el túnel está arriba pero **esa IP no tiene
camino** — es la trampa clásica de WireGuard.

**2. El usuario en el router.** Crea `wisp-api` en el MikroTik. Si falta, el
paso 3 no tiene a quién asignarle la llave y falla sin decir gran cosa.

**3. Las dos llaves.** Desde el servidor de la oficina:

```bash
# la pública del backend, derivada de su privada
sudo ssh-keygen -y -f /root/.ssh/<llave-del-backend> | sudo tee /root/.ssh/oficina.pub

sudo scp /root/.ssh/oficina.pub <usuario>@10.20.0.X:/oficina.pub
sudo ssh <usuario>@10.20.0.X \
  "/user ssh-keys import public-key-file=oficina.pub user=wisp-api"
```

Y lo mismo con la pública de la VPS si quieres seguir entrando desde allí.
**Importar añade, no reemplaza**: las llaves que ya estaban siguen valiendo.

Ojo con el `user=wisp-api`: subes el archivo con tu usuario de administrador,
pero la llave tiene que quedar asignada al usuario que usa el sistema.

**4. La zona en el panel.** Dos datos, y los dos son obligatorios:

- **IP del túnel** — `10.20.0.X`. **No la IP pública del router.**
- **Pool PPPoE** — el nombre exacto que tiene en ESE router. Cada uno usa el
  suyo; se consulta así:

```bash
sudo ssh <usuario>@10.20.0.X "/ip pool print"
```

Se escribe tal cual, con mayúsculas y guiones bajos incluidos. Sin el pool,
el sistema ni intenta conectarse — y entonces no ves ningún error de red,
porque nunca hubo red de por medio.

Comprueba que se guardó de verdad:

```bash
docker exec wisp_postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT nombre, ip_wireguard, pool_pppoe FROM zonas"'
```

**5. Probarlo por el camino del sistema.** Esto es lo único que vale como
prueba: corre el código del backend, dentro del contenedor, con su llave.

```bash
cd ~/Wisp-ISP
docker exec wisp_backend python -c "
from app.routers.clientes import _mikrotik_exec
r = _mikrotik_exec('10.20.0.X', ['/system/identity/print'])
print(r['ok'], r.get('error','')[:90])
" 2>/dev/null
```

Tiene que decir `True`.

### Cuando algo falla

| Lo que ves | Lo que suele ser |
|---|---|
| El ping no sale desde la oficina | `allowed ips` no cubre esa IP |
| «rechazó la llave del usuario» | La pública del backend no está en ese router, o el usuario tiene `address=` limitado (`/user print detail` lo dice) |
| «no se pudo leer la llave» | La ruta de `SSH_KEY_PATH` no existe, o la llave tiene contraseña (el sistema no puede usarla) |
| «no tiene configurado el pool» | Falta el paso 4 |
| El panel dice túnel conectado pero no trae datos | El ping funciona y el SSH no: mira la llave, no la red |

> **Historia que conviene recordar:** hubo una época en que el sistema decía
> `Invalid key` cuando el problema era la autenticación. La llave estaba
> perfecta. Era un defecto de la librería, que prueba cuatro tipos de llave
> en bucle y se queda con el error de la última vuelta. Ya está corregido y
> ahora el mensaje distingue «no se puede leer» de «el router la rechaza»,
> pero si alguna vez vuelve a aparecer ese texto en una versión vieja: no te
> fijes en la llave, fíjate en quién la rechaza.

### Si las carpetas no existen todavía

El `docker-compose.yml` monta `/etc/wireguard` y `/root/.ssh`. Si aún no vas
a usar esta parte, créalas vacías para que Docker no falle:

```bash
sudo mkdir -p /etc/wireguard /root/.ssh
```

Esas funciones no estarán disponibles hasta que configures las llaves; el
resto del sistema funciona igual.
