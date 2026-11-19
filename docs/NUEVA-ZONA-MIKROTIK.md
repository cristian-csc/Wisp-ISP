# Añadir un MikroTik nuevo al sistema

Guía para dar de alta una zona en WISP Control: desde el router recién
comprado hasta ver clientes conectándose por PPPoE.

Son cinco pasos. **Hazlos en orden**: cada uno se apoya en el anterior, y
saltarse uno produce fallos que parecen de otra cosa.

---

## Antes de empezar: ten esto a la mano

| Dato | Ejemplo | De dónde sale |
|---|---|---|
| IP del túnel para el router | `10.20.0.4` | La eliges tú, libre dentro de `10.20.0.0/24` |
| IP pública de la VPS | — | `VPS_IP` del `.env` |
| Clave pública WireGuard de la VPS | — | Panel: Zonas → botón **WG** de cualquier zona |
| Nombre del pool de IPs | `pppoe_pool` | Lo decides al configurar el router |
| Código de cada plan | `FIBRA100` | Panel: Planes |

---

## Cómo encaja todo

```
Servidor de la OFICINA                      VPS
┌──────────────────────────┐        ┌────────────────┐
│ Aquí corre el sistema    │        │ Solo el túnel  │
│ (wisp_backend)           │        │ WireGuard      │
│ Llave: la del backend    │        │ Llave: tu      │
│   ← la que el panel usa  │        │  acceso manual │
└───────────┬──────────────┘        └───────┬────────┘
            └──────── túnel 10.20.0.0/24 ───┘
                          │
                   MikroTik nuevo
```

Dos cosas que ahorran horas de confusión:

**El sistema solo usa la llave del servidor de la oficina.** Que entres por
`ssh` desde la VPS no demuestra que el panel vaya a funcionar. Son dos
máquinas con dos llaves distintas.

**Las llaves pertenecen a las máquinas, no a los routers.** No generas
llaves nuevas por cada MikroTik: le enseñas las dos que ya existen.

---

## Paso 1 — El túnel WireGuard

### En la VPS

Añade el peer del router nuevo a `wg0`, con su IP y su clave pública.

### En el MikroTik

```
/interface/wireguard/add name=wg-wisp listen-port=51820
/interface/wireguard/peers/add interface=wg-wisp \
  public-key="<CLAVE-PUBLICA-DE-LA-VPS>" \
  endpoint-address=<IP-PUBLICA-VPS> endpoint-port=51820 \
  allowed-address=10.20.0.0/24 persistent-keepalive=25s
/ip/address/add address=10.20.0.X/24 interface=wg-wisp
```

El `allowed-address=10.20.0.0/24` es importante: con `/32` el router solo
hablaría con la VPS y **la oficina no lo alcanzaría**.

### Comprobar — desde la OFICINA, no desde la VPS

```bash
ping -c 3 10.20.0.X
sudo wg show
```

En `allowed ips` del peer tiene que entrar esa IP. Si ves `10.20.0.2/32`, el
túnel está arriba pero esa dirección **no tiene camino**: amplíalo a
`10.20.0.0/24`.

> Es la trampa clásica de WireGuard: el túnel funciona y aun así no llegas,
> porque solo transporta las direcciones declaradas.

---

## Paso 2 — El usuario y las llaves SSH

### Crear el usuario en el router

```
/user/add name=wisp-api group=full
```

Si este usuario no existe, el import del paso siguiente no tiene a quién
asignar la llave y falla casi en silencio.

> Si quieres restringirlo por dirección (`address=`), **incluye la IP del
> servidor de la oficina**, no solo la de la VPS. Una restricción que deja
> fuera a la oficina produce exactamente el mismo síntoma que una llave
> equivocada.

### Subir las llaves públicas

Desde el **servidor de la oficina**:

```bash
# la pública del backend, derivada de su privada
sudo ssh-keygen -y -f /root/.ssh/<llave-del-backend> | sudo tee /root/.ssh/oficina.pub

sudo scp /root/.ssh/oficina.pub <tu-usuario>@10.20.0.X:/oficina.pub
sudo ssh <tu-usuario>@10.20.0.X \
  "/user ssh-keys import public-key-file=oficina.pub user=wisp-api"
```

Repite con la pública de la VPS si quieres seguir entrando desde allí.
**Importar añade, no reemplaza**: lo que ya estaba sigue valiendo.

Al generar llaves nuevas, ponles comentario (`ssh-keygen -C "oficina"`): el
router lo muestra en la columna KEY-OWNER y así se distinguen. Sin eso, dos
llaves distintas se ven idénticas en `/user ssh-keys print`.

---

## Paso 3 — Lo que el router necesita para dar servicio

Aquí está lo que no es evidente. **El sistema no configura el router: lo
usa.** Da por hecho que estas cuatro cosas ya existen, y si falta alguna, el
cliente se crea en el panel pero no navega.

### 3.1 El pool de direcciones

```
/ip/pool/add name=pppoe_pool ranges=192.168.20.2-192.168.30.254
```

El nombre lo escribirás tal cual en la zona. Consúltalo con `/ip pool print`.

### 3.2 Un perfil PPP por cada plan

**El sistema asigna a cada cliente el perfil cuyo nombre es el _código_ del
plan.** Si el plan en el panel se llama `FIBRA100`, el router necesita un
perfil llamado exactamente `FIBRA100`.

```
/ppp/profile/add name=FIBRA100 local-address=192.168.20.1 \
  remote-address=pppoe_pool rate-limit=100M/100M
```

Crea uno por cada plan que vayas a vender en esa zona. Luego el panel te lo
verifica solo: **Planes → Verificación** compara los planes contra los
perfiles reales de cada router y te dice cuáles faltan.

### 3.3 El servidor PPPoE

```
/interface/pppoe-server/server/add service-name=wisp \
  interface=<interfaz-hacia-los-clientes> default-profile=FIBRA100 \
  authentication=pap,chap disabled=no
```

### 3.4 La lista de corte — y su regla

El sistema, al suspender a un moroso con IP fija, hace dos cosas:

```
/ip firewall address-list add list="CORTE MOROSO" address=<ip> comment=<usuario>
/ppp active remove [find name=<usuario>]
```

**Añade la IP a la lista y tira la sesión. Nada más.** La regla que bloquea
esa lista tiene que existir ya en el router:

```
/ip/firewall/filter/add chain=forward src-address-list="CORTE MOROSO" \
  action=drop comment="Corte por morosidad"
```

> Sin esa regla, cortar a un cliente solo lo desconecta un momento y vuelve
> a navegar. Es el fallo más difícil de notar: el panel dice «suspendido»,
> el router obedeció, y el cliente sigue con internet.

Si usas otro nombre de lista, escríbelo en el campo **Lista de corte** de la
zona. Vacío = `CORTE MOROSO`.

---

## Paso 4 — La zona en el panel

**Zonas → Nueva zona** (o Editar, si ya existe):

| Campo | Qué va | Error común |
|---|---|---|
| **IP WireGuard** | `10.20.0.X` | Poner la IP **pública** del router |
| **Pool PPPoE** | El nombre exacto del paso 3.1 | Mayúsculas distintas: `PPPOE` ≠ `pppoe_pool` |
| **Lista de corte** | La del paso 3.4, o vacío | — |
| Usuario/clave MikroTik | Opcional | **No se usan para conectar**: el sistema entra por SSH con llave. Son solo referencia |

Sin el pool, el sistema **ni intenta conectarse** — y entonces no verás
ningún error de red, porque nunca hubo red de por medio.

Comprueba que se guardó de verdad; desde la pantalla no siempre se nota:

```bash
docker exec wisp_postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT nombre, ip_wireguard, pool_pppoe, lista_corte FROM zonas"'
```

---

## Paso 5 — Verificar, en tres niveles

Hazlos en este orden: cada uno descarta una capa.

**1. ¿Llega la red?** Desde la oficina:

```bash
ping -c 3 10.20.0.X
```

**2. ¿Entra el sistema?** Esta es la única prueba que vale: corre el código
del backend, dentro del contenedor, con su llave.

```bash
cd ~/Wisp-ISP
docker exec wisp_backend python -c "
from app.routers.clientes import _mikrotik_exec
r = _mikrotik_exec('10.20.0.X', ['/system/identity/print'])
print(r['ok'], r.get('error', '')[:90])
"
```

Tiene que decir `True`. Ignora las advertencias de `TripleDES`: son ruido de
la librería.

**3. ¿Están los planes?** Panel → **Planes → Verificación**. Te dice qué
perfiles faltan en el router nuevo.

Y de remate, **Zonas → la zona → botón WG**: ping, SSH y último handshake en
una pantalla.

---

## Qué toca el sistema y qué no

Conviene saberlo para no buscar donde no es:

| El sistema SÍ | El sistema NO |
|---|---|
| Crea y borra `/ppp secret` de clientes | Crea perfiles PPP |
| Cambia el perfil al cambiar de plan | Crea el pool |
| Añade/quita IPs de la lista de corte | Crea reglas de firewall |
| Tira sesiones activas al cortar | Configura el PPPoE server |
| Lee el pool para asignar IPs libres | Toca el túnel WireGuard del router |

En resumen: **el sistema administra clientes, no configura routers.** La
plantilla de red la dejas tú una vez, y el panel trabaja encima.

---

## Cuando algo falla

| Lo que ves | Lo que suele ser |
|---|---|
| El ping no sale desde la oficina | `allowed ips` no cubre esa IP |
| «rechazó la llave del usuario» | La pública del backend no está en ese router, o el usuario tiene `address=` limitado (`/user print detail`) |
| «no se pudo leer la llave» | `SSH_KEY_PATH` apunta a una ruta que no existe, o la llave tiene contraseña — el sistema no puede usarla |
| «no tiene configurado el pool» | Falta el paso 4 |
| El panel dice túnel conectado pero no trae datos | El ping funciona y el SSH no: mira la llave, no la red |
| El cliente se crea pero no navega | Falta el perfil PPP con el código del plan (paso 3.2) |
| Suspendes a un moroso y sigue navegando | Falta la regla de firewall de la lista de corte (paso 3.4) |

> **Una historia que conviene recordar.** Hubo una época en que el sistema
> decía `Invalid key` cuando el problema era la autenticación: la llave
> estaba perfecta. Era un defecto de la librería, que prueba cuatro tipos de
> llave en bucle y se queda con el error de la última vuelta. Ya está
> corregido —ahora distingue «no se puede leer» de «el router la rechaza»—
> pero si ves ese texto en una versión vieja: no mires la llave, mira quién
> la rechaza.

---

## Resumen para pegar en la pared

```
1. Túnel      peer en la VPS + wireguard en el router + allowed-address /24
              verificar con ping DESDE LA OFICINA
2. Acceso     usuario wisp-api + importar las dos llaves públicas
3. Red        pool · un perfil PPP por plan · servidor PPPoE · regla de corte
4. Panel      zona con IP del túnel y nombre exacto del pool
5. Probar     ping → prueba dentro del contenedor → Planes/Verificación
```
