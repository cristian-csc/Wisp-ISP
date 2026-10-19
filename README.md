# TUX-ISP — Sistema de Gestión para Tuxtell

Sistema web completo para administración de clientes, pagos, zonas y equipos de red de un proveedor de internet (ISP).

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI · SQLAlchemy · PostgreSQL · Alembic |
| Frontend | React 18 · Vite · Tailwind CSS · Recharts |
| Mensajería | whatsapp-web.js 1.26.0 (Node.js) |
| Red | WireGuard VPN · paramiko SSH · RouterOS v7 |
| Contenedores | Docker Compose |
| Servidor | VPS Linux · Nginx · Let's Encrypt |

---

## Características principales

### Gestión de clientes
- Alta, baja y edición con datos completos (PPPoE, IP estática, equipo, zona, plan)
- **Estado de sesión PPPoE en tiempo real** desde MikroTik (conectado / desconectado + uptime + IP asignada)
- Calendario anual de pagos con estados: pagado, vencido, pendiente, corte temporal, futuro
- Ciclo de facturación de 30 días desde la fecha de instalación
- Dar prórroga con fecha personalizada o atajos +7/+10/+15/+30 días

### Cortes y reactivaciones
- Cortar servicio: envía WhatsApp de aviso **antes** del corte en MikroTik (cliente lo recibe mientras aún tiene internet)
- Reactivar: reactiva en MikroTik y actualiza `fecha_vencimiento = hoy + 30 días`
- Meses de corte temporal: se marcan en amarillo en el calendario (pago S/0 con estado `corte_temporal`)

### Pagos
- Registro con confirmación automática por WhatsApp al cliente
- Reactivación automática del cliente suspendido al registrar un pago
- Resumen mensual de ingresos vs gastos

### Zonas y MikroTik
- Administración de zonas con WireGuard VPN por zona
- **Terminal SSH MikroTik por zona** — ejecuta cualquier comando RouterOS desde el navegador
  - Botones rápidos: ping 8.8.8.8, PPPoE activos, interfaces, IP address, rutas, recursos sistema, logs
  - Historial de comandos con flechas ↑↓ · timeout de 30 segundos para comandos lentos
- Estado WireGuard en tiempo real: Ping · SSH · Handshake por zona
- Gestión de peers WireGuard (agregar / eliminar desde la web)

### Planes de internet
- CRUD de planes sincronizado automáticamente con todos los MikroTiks (PPP profiles)

### WhatsApp
- Avisos de cobro individuales y masivos a clientes sin pago del mes
- Confirmación de pago al registrar
- Aviso de suspensión antes del corte
- Envío manual de mensajes desde el panel web

### Dashboard
- Estadísticas en tiempo real: clientes activos, ingresos, gastos, utilidad, pendientes
- Gráfico de área: ingresos vs gastos del año actual
- Estado de todas las zonas en tiempo real

---

## Estructura del proyecto

```
tuxtell-isp/
├── backend/
│   ├── app/
│   │   ├── main.py          # Arranque FastAPI y CORS
│   │   ├── config.py        # Variables de entorno (pydantic-settings)
│   │   ├── models.py        # Modelos SQLAlchemy
│   │   ├── schemas.py       # Schemas Pydantic v2
│   │   ├── database.py      # Conexión PostgreSQL
│   │   ├── seed.py          # Datos iniciales (admin, planes base)
│   │   └── routers/
│   │       ├── auth.py      # JWT login / cambio de contraseña
│   │       ├── clientes.py  # CRUD + MikroTik SSH + estado PPPoE
│   │       ├── zonas.py     # Zonas + WireGuard + Terminal SSH
│   │       ├── pagos.py     # Registro de pagos + WhatsApp
│   │       ├── gastos.py    # Gastos operativos
│   │       ├── planes.py    # Planes + sync MikroTik PPP profiles
│   │       ├── whatsapp.py  # Avisos automáticos
│   │       └── dashboard.py # Stats y gráficas
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.js    # Axios con interceptor JWT + redirect 401
│   │   ├── App.jsx          # Rutas protegidas
│   │   └── components/
│   │       ├── Dashboard.jsx
│   │       ├── Clientes.jsx
│   │       ├── ClienteDetalle.jsx   # Perfil + PPPoE en tiempo real
│   │       ├── NuevoCliente.jsx
│   │       ├── Zonas.jsx            # Zonas + Terminal MikroTik
│   │       ├── Pagos.jsx
│   │       ├── Gastos.jsx
│   │       ├── WhatsApp.jsx
│   │       ├── Configuracion.jsx
│   │       ├── Login.jsx
│   │       ├── Layout.jsx
│   │       └── Sidebar.jsx
│   ├── Dockerfile
│   └── vite.config.js
├── whatsapp/                # Servicio Node.js whatsapp-web.js
│   ├── index.js
│   └── package.json
├── nginx/nginx.conf         # Reverse proxy con SSL
└── docker-compose.yml
```

---

## Variables de entorno

Todas se definen en `.env` (raíz del proyecto, junto a `docker-compose.yml`). Copia `.env.example` a `.env` y completa los valores reales — `docker-compose.yml` ya no contiene secretos, solo referencias `${VAR}` que Docker Compose sustituye desde ese archivo. Sin `.env`, `docker compose up` fallará (o arrancará con valores vacíos).

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | `postgresql://user:pass@localhost/db` |
| `SECRET_KEY` | Clave secreta para firmar JWT | cadena aleatoria larga |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Expiración del token en minutos | `1440` (24h) |
| `WHATSAPP_API_URL` | URL del servicio whatsapp-web.js | `http://127.0.0.1:3001` |
| `VPS_IP` | IP pública del VPS | `161.132.48.127` |
| `SSH_KEY_PATH` | Ruta de la clave privada SSH para MikroTik | `/root/.ssh/tuxtell_key` |
| `SSH_USER` | Usuario SSH en MikroTik | `tuxtell-api` |
| `WG_CONFIG_PATH` | Ruta del archivo de configuración WireGuard | `/etc/wireguard/wg0.conf` |
| `VPS_WG_PUBKEY` | Clave pública WireGuard del VPS | `z5Er...` |
| `PHONE_CONTACTO` | Número Yape/Plin para mensajes WhatsApp | `936511008` |

---

## Despliegue en producción

### Requisitos previos en el VPS
- Docker + Docker Compose
- WireGuard configurado y activo (`wg0`)
- Clave SSH para MikroTik en `/root/.ssh/tuxtell_key`
- Nginx con SSL Let's Encrypt para `tuxtell.duckdns.org`

### Primera instalación

```bash
git clone https://github.com/cristian2926/TUX-ISP.git /opt/tuxtell-isp
cd /opt/tuxtell-isp
cp .env.example .env   # y completa los valores reales
docker compose build
docker compose up -d
```

Acceder en: `https://tuxtell.duckdns.org`
API docs en: `https://tuxtell.duckdns.org/api/docs`

Credenciales por defecto: `admin@tuxtell.net` / `admin2024`

### Actualizar en producción

```bash
cd /opt/tuxtell-isp
git pull
docker compose build backend frontend
docker compose up -d
```

### Migraciones de base de datos

El esquema se gestiona con **Alembic** (`backend/alembic/`), ya no con SQL manual ni con `create_all` automático. `backend/docker-entrypoint.sh` corre `alembic upgrade head` antes de levantar la API en cada arranque del contenedor `backend`.

**Flujo en desarrollo**, cuando cambies un modelo en `backend/app/models.py`:

```bash
cd backend
alembic revision --autogenerate -m "descripcion del cambio"
# revisar el archivo generado en alembic/versions/ antes de aplicarlo
alembic upgrade head
```

**Primer deploy con este flujo, sobre una base existente** (creada antes con `create_all`, sin tabla `alembic_version`): hay que "sellar" la base en la revisión baseline SIN ejecutar el `CREATE TABLE` (las tablas ya existen), una sola vez:

```bash
docker compose exec backend alembic stamp head
```

Si en vez de eso corres `alembic upgrade head` sobre una base que ya tiene las tablas, va a fallar con "la tabla ya existe" — usa `stamp` esa primera vez, `upgrade head` para todo lo demás en adelante.

En Linux (VPS), después de clonar/copiar el repo, asegúrate de que el script tenga permiso de ejecución (el bind mount `./backend:/app` puede no preservarlo):

```bash
chmod +x backend/docker-entrypoint.sh
```

---

## Configuración MikroTik por zona

Cada zona se conecta al VPS mediante un túnel WireGuard. El usuario SSH `tuxtell-api` ejecuta los comandos PPPoE.

### WireGuard en RouterOS v7

```routeros
/interface wireguard add name=wg-tuxtell private-key="<TU_PRIVATE_KEY>"
/interface wireguard peers add \
  interface=wg-tuxtell \
  public-key="<VPS_WG_PUBKEY>" \
  endpoint-address=<VPS_IP> \
  endpoint-port=51820 \
  allowed-address=10.10.0.0/24 \
  persistent-keepalive=25s
/ip address add address=<ZONA_WG_IP>/24 interface=wg-tuxtell
```

La clave pública del VPS (`VPS_WG_PUBKEY`) está disponible en el panel Zonas → botón WG de cada zona.

### Usuario SSH API

```routeros
/user add name=tuxtell-api group=full
/user ssh-keys import user=tuxtell-api public-key-file=tuxtell_key.pub
```

---

## API — Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login, devuelve JWT |
| GET | `/api/clientes` | Lista paginada con filtros |
| POST | `/api/clientes` | Crear cliente + secreto PPPoE en MikroTik |
| GET | `/api/clientes/{id}/pppoe-status` | Estado sesión PPPoE en tiempo real |
| GET | `/api/clientes/{id}/calendario-pagos` | Calendario anual de pagos |
| POST | `/api/clientes/{id}/cortar` | Cortar + aviso WhatsApp + MikroTik disable |
| POST | `/api/clientes/{id}/reactivar` | Reactivar + MikroTik enable + fecha_vencimiento |
| POST | `/api/pagos` | Registrar pago + WhatsApp confirmación |
| GET | `/api/zonas/{id}/wireguard-status` | Estado WireGuard (ping/SSH/handshake) |
| POST | `/api/zonas/{id}/exec` | Ejecutar comando RouterOS via SSH |
| POST | `/api/whatsapp/aviso-cobro/{id}` | Aviso de cobro individual |
| POST | `/api/whatsapp/broadcast-cobros` | Aviso masivo a clientes sin pago |
| GET | `/api/health` | Health check |

---

## Ciclo de facturación

```
Instalación → fecha_vencimiento = instalacion + 30 días
Pago registrado → WhatsApp confirmación al cliente
Reactivación → fecha_vencimiento = hoy + 30 días
Prórroga → fecha_vencimiento se extiende manualmente
Corte temporal → mes marcado en amarillo, no se cobra (monto = 0)
```

---

## Seguridad

- Autenticación JWT, expiración en 24 horas, renovación automática si el token es válido
- Todas las rutas requieren token (excepto `/api/auth/login`)
- CORS restringido a `https://tuxtell.duckdns.org` y `localhost:5173` (desarrollo)
- Contraseñas hasheadas con bcrypt
- Acceso MikroTik via SSH con clave pública, sin contraseña
- WireGuard cifra todo el tráfico VPS ↔ MikroTik
