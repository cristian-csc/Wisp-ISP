from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, exists, func
from typing import Optional, List
from datetime import date, datetime, timedelta
import calendar
import logging
import ipaddress
import re

import paramiko
import httpx

from ..database import get_db
from .. import models, schemas, lineas
from .auth import get_current_user, get_password_hash, require_roles, zonas_asignadas
from ..config import settings
from ..mensajeria import cabeceras_bot
from ..billing import monto_mensual, detalle_monto
from ..facturacion import con_dia, dia_de_pago, primer_vencimiento
from .whatsapp import wa_request

router = APIRouter()
logger = logging.getLogger(__name__)


# ── RouterOS input sanitization ───────────────────────────────────────────────

_PPPOE_USER_RE = re.compile(r'^[a-zA-Z0-9._@-]{1,100}$')
_IPV4_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')


def _ros_str(value: str) -> str:
    """Escape a value for use inside a RouterOS double-quoted string argument.
    Strips characters that could break out of the string or chain commands."""
    return str(value).replace('\\', '').replace('"', '').replace('\n', '').replace('\r', '').replace(';', '').replace('[', '').replace(']', '')


def _validate_pppoe_user(username: str) -> str:
    if not _PPPOE_USER_RE.match(username):
        raise HTTPException(status_code=400, detail="Usuario PPPoE contiene caracteres no permitidos")
    return username


def _validate_ip(ip: str) -> str:
    if ip and not _IPV4_RE.match(ip):
        raise HTTPException(status_code=400, detail="IP estática no es una dirección IPv4 válida")
    return ip


# ── SSH MikroTik ──────────────────────────────────────────────────────────────

# La llave se lee una vez y se guarda: abrir y descifrar un archivo RSA en
# cada llamada cuesta, y esto se llama varias veces por pantalla.
_LLAVE_SSH: dict[str, object] = {}

# Los tipos que puede tener la llave, en el orden en que conviene probarlos.
_TIPOS_LLAVE = (
    paramiko.RSAKey,
    paramiko.Ed25519Key,
    paramiko.ECDSAKey,
)


def _cargar_llave(ruta: str):
    """La llave privada, ya leída, diciendo claramente si no se puede leer.

    Antes se le pasaba a paramiko la RUTA y que él adivinara el tipo. El
    problema no es que adivine mal: es que prueba los cuatro tipos en bucle y
    se queda con el error de la ÚLTIMA vuelta. Con una llave RSA buena la
    carga a la primera, intenta autenticar, el router la rechaza... y luego
    falla al leerla como Ed25519, que es el error que acababa saliendo:
    «Invalid key». Mentía — la llave estaba bien, lo que fallaba era la
    autenticación — y mandó a buscar el problema donde no estaba.
    """
    if ruta in _LLAVE_SSH:
        return _LLAVE_SSH[ruta]

    motivos = []
    for tipo in _TIPOS_LLAVE:
        try:
            llave = tipo.from_private_key_file(ruta)
            _LLAVE_SSH[ruta] = llave
            return llave
        except Exception as e:
            motivos.append("%s: %s" % (tipo.__name__.replace("Key", ""), e))

    raise ValueError(
        "No se pudo leer la llave SSH de %s. Se probó como %s. Si tiene "
        "contraseña, el sistema no puede usarla: hace falta una sin "
        "contraseña." % (ruta, ", ".join(motivos))
    )


def _mikrotik_exec(host: str, commands: list[str]) -> dict:
    """
    SSH al MikroTik en {host} (IP WireGuard) y ejecuta cada comando RouterOS.
    Retorna {"ok": bool, "results": [...], "error": str}.
    Nunca lanza excepción — el cliente se guarda en BD aunque falle MikroTik.
    """
    try:
        llave = _cargar_llave(settings.SSH_KEY_PATH)
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            ssh.connect(
                hostname=host,
                username=settings.SSH_USER,
                pkey=llave,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
            )
        except paramiko.AuthenticationException:
            # El router contesta pero no acepta la llave. Decir qué mirar
            # ahorra la tarde que costó averiguarlo la primera vez.
            raise ValueError(
                "El router %s rechazó la llave del usuario «%s». La llave se "
                "leyó bien, así que no es un problema de formato: o la pública "
                "que tiene el router no es la pareja de esta privada, o ese "
                "usuario solo acepta conexiones desde otra dirección "
                "(/user print detail en el router lo dice)." % (host, settings.SSH_USER)
            ) from None
        results = []
        for cmd in commands:
            try:
                _, stdout, stderr = ssh.exec_command(cmd, timeout=10)
                results.append({
                    "cmd": cmd,
                    "out": stdout.read().decode(errors="ignore").strip(),
                    "err": stderr.read().decode(errors="ignore").strip(),
                    "rc": stdout.channel.recv_exit_status(),
                })
            except Exception as e:
                results.append({"cmd": cmd, "err": str(e), "rc": -1})
        ssh.close()
        return {"ok": True, "results": results}
    except Exception as e:
        logger.warning("MikroTik SSH %s falló: %s", host, e)
        return {"ok": False, "error": str(e), "results": []}


MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]


def _ultimos_n_meses(n: int) -> list[str]:
    hoy = date.today()
    result = []
    for i in range(n - 1, -1, -1):
        m = hoy.month - i
        y = hoy.year
        while m <= 0:
            m += 12
            y -= 1
        result.append(f"{y}-{m:02d}")
    return result

def _wa_send(phone: str, message: str):
    try:
        with httpx.Client(timeout=8) as c:
            c.post(f"{settings.WHATSAPP_API_URL}/send",
                   json={"phone": phone, "message": message},
                   headers=cabeceras_bot())
    except Exception as e:
        logger.warning("WhatsApp send falló: %s", e)


def _get_wg_ip(db: Session, zona_id: int) -> Optional[str]:
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    return zona.ip_wireguard if zona else None


def _lista_corte(db: Session, zona_id) -> str:
    """Nombre de la lista del firewall donde el router mete a los cortados.

    No es igual en todos los routers: el de SUCASCO la llama "CORTE MOROSO",
    con espacio, y sus reglas de redirección miran ese nombre exacto. Si el
    sistema usara otro, metería la IP en una lista que ninguna regla consulta:
    el corte no cortaría nada y no daría ningún error.

    El valor por defecto es el que usa la empresa hoy.
    """
    zona = db.query(models.Zona).filter(models.Zona.id == zona_id).first()
    nombre = (zona.lista_corte or "").strip() if zona else ""
    return _ros_str(nombre or "CORTE MOROSO")


_RE_IPV4 = re.compile("(?<![0-9.])([0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3})(?![0-9.])")


def _ips_del_pool(zona) -> tuple[list, set, dict, str]:
    """Qué IP caben en el pool PPPoE de la zona y cuáles ya están ocupadas.

    Devuelve (todas_las_del_pool, ocupadas, error). El router es la única
    fuente de verdad: el pool se lee de él, no se deduce de la IP de la LAN,
    porque no tiene por qué empezar en .2 ni llegar hasta .254.

    Ocupada quiere decir cualquiera de estas dos cosas:
      - está fijada en un secreto PPPoE (así da de alta la empresa: una IP
        fija por cliente, que es lo que permite cortar por IP);
      - el router la tiene entregada ahora mismo (`/ip pool used`), que es el
        caso de un cliente sin IP fija que está conectado. Si no la miráramos,
        podríamos asignar a un cliente nuevo una IP que otro está usando.
    """
    if not zona or not zona.ip_wireguard:
        return [], set(), {}, "La zona no tiene túnel WireGuard configurado."
    pool = (zona.pool_pppoe or "").strip()
    if not pool:
        return [], set(), {}, "La zona no tiene configurado el nombre del pool PPPoE."
    pool_safe = _ros_str(pool)

    r = _mikrotik_exec(zona.ip_wireguard, [
        f':put [/ip pool get [find name="{pool_safe}"] ranges]',
        # Nombre e IP juntos: saber que una IP esta tomada no basta, hay que
        # saber de quien es. Un cliente migrado ya tiene la suya en el router,
        # y si no se distingue, el panel le prohibe quedarse con ella y le da
        # otra distinta — y entonces el corte por IP apunta a la direccion
        # equivocada.
        ':foreach s in=[/ppp secret find] do={:put ([/ppp secret get $s name] . "=" . [/ppp secret get $s remote-address])}',
        f'/ip pool used print where pool="{pool_safe}"',
    ])
    if not r.get("ok"):
        return [], set(), {}, r.get("error", "No se pudo conectar con el router")
    res = r.get("results") or []
    if len(res) < 3:
        return [], set(), {}, "El router no respondió a todas las consultas."

    # Si la consulta de secretos falla y no devuelve nada, no se puede saber
    # qué IP están tomadas. Mejor no contestar que ofrecer una ocupada: eso
    # dejaría a dos clientes sin servicio.
    if (res[1].get("err") or "").strip() and not (res[1].get("out") or "").strip():
        return [], set(), {}, "El router no pudo listar los secretos PPPoE; no se puede saber qué IP están libres."

    return _interpretar_pool(
        pool,
        (res[0].get("out") or ""),
        bool(res[0].get("err")),
        (res[1].get("out") or ""),
        (res[2].get("out") or ""),
    )


def _interpretar_pool(pool, salida_rangos, error_rangos, salida_secretos, salida_usadas):
    """Convierte la salida cruda del router en (todas, ocupadas, duenos, error).

    `duenos` dice qué secreto PPPoE tiene fijada cada IP. Hace falta para
    distinguir "ocupada por otro" de "ocupada por este mismo cliente", que es
    el caso de todos los clientes migrados: ya tienen su IP en el router antes
    de existir en el panel.

    Separado de la conexión para poder probarlo con salidas reales guardadas.
    """
    salida_rangos = salida_rangos.strip()
    if not salida_rangos or error_rangos:
        return [], set(), {}, f'El router no tiene ningún pool llamado "{pool}".'

    # ranges puede traer varios tramos separados por coma, y un tramo puede
    # ser un rango (a-b) o una sola IP.
    todas = []
    for tramo in salida_rangos.split(","):
        ips = _RE_IPV4.findall(tramo)
        if len(ips) >= 2:
            try:
                ini = ipaddress.IPv4Address(ips[0])
                fin = ipaddress.IPv4Address(ips[1])
            except ValueError:
                continue
            if int(fin) - int(ini) > 4096:
                return [], set(), "El pool es demasiado grande para listarlo."
            todas.extend(str(ipaddress.IPv4Address(n)) for n in range(int(ini), int(fin) + 1))
        elif len(ips) == 1:
            try:
                ipaddress.IPv4Address(ips[0])
            except ValueError:
                continue
            todas.append(ips[0])
    if not todas:
        return [], set(), {}, f'No se entendió el rango del pool "{pool}" ({salida_rangos}).'

    # Cada linea viene como "usuario=1.2.3.4". Si el router es viejo y solo
    # manda la IP, el dueno queda desconocido y se trata como ocupada a secas,
    # que es como se comportaba antes.
    ocupadas = set()
    duenos: dict = {}
    for linea in salida_secretos.splitlines():
        m = _RE_IPV4.search(linea)
        if not m:
            continue
        ip = m.group(1)
        ocupadas.add(ip)
        if "=" in linea:
            nombre = linea.split("=", 1)[0].strip()
            if nombre:
                duenos[ip] = nombre
    # Las entregadas ahora mismo. Si esta consulta falla seguimos adelante:
    # las fijas, que son la mayoría, ya las tenemos.
    for linea in salida_usadas.splitlines():
        m = _RE_IPV4.search(linea)
        if m:
            ocupadas.add(m.group(1))

    return todas, ocupadas, duenos, ""


def _alcance_clientes(
    query,
    db: Session,
    current_user,
    solo_mis_instalaciones: bool = False,
    solo_mis_registros: bool = False,
):
    """Recorta una consulta de clientes a lo que ese rol tiene derecho a ver.

    Esta en un solo sitio a proposito: la lista y el contador por estado tienen
    que recortar igual, o los numeros de las tarjetas no cuadrarian con lo que
    sale debajo en la tabla.
    """
    # Quien da de alta a un cliente queda en vendedor_id, sea vendedora o
    # tecnico. Para una vendedora eso ya es todo su alcance; para un tecnico
    # hay que pedirlo, porque lo normal es que vea su zona entera.
    if solo_mis_registros:
        return query.filter(models.Cliente.vendedor_id == current_user.id)

    if current_user.rol == models.RolUsuario.tecnico:
        if solo_mis_instalaciones:
            # "Mis instalaciones" — lo que este tecnico instalo de verdad, no
            # todo lo que pasa por su zona (ahi puede haber instalado otro
            # tecnico que tambien cubre esa misma zona).
            return query.filter(models.Cliente.tecnico_instalador_id == current_user.id)
        return query.filter(
            models.Cliente.zona_id.in_(zonas_asignadas(db, current_user) or [-1])
        )
    if current_user.rol in (models.RolUsuario.vendedor_campo, models.RolUsuario.atencion_cliente):
        return query.filter(models.Cliente.vendedor_id == current_user.id)
    return query


def _check_zona_access(db: Session, current_user: models.Usuario, zona_id: int):
    """Un técnico solo puede ver/operar clientes de sus zonas asignadas."""
    if current_user.rol == models.RolUsuario.tecnico:
        if zona_id not in zonas_asignadas(db, current_user):
            raise HTTPException(status_code=403, detail="No tiene acceso a esta zona")


def _crear_secreto_pppoe(db: Session, cliente: "models.Cliente") -> dict:
    """Crea el secreto PPPoE en el MikroTik de la zona del cliente.

    Antes de crear, verifica si ya existe un secreto con ese nombre (típico
    en clientes migrados que ya estaban dados de alta en el MikroTik antes
    de pasar por este sistema). Si ya existe, NO intenta crear uno nuevo
    (eso fallaría por duplicado) — lo adopta tal cual está, sin necesidad de
    entrar al MikroTik a borrar nada a mano.
    """
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if not wg_ip:
        return {"ok": False, "error": "Zona sin IP WireGuard", "ya_existia": False}

    user = _ros_str(cliente.usuario_pppoe)

    check = _mikrotik_exec(wg_ip, [f'/ppp secret print where name="{user}"'])
    if not check["ok"]:
        return {"ok": False, "error": check.get("error", "No se pudo conectar al MikroTik"), "ya_existia": False}
    if check["results"] and check["results"][0]["out"].strip():
        return {"ok": True, "ya_existia": True, "error": None}

    plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
    perfil = _ros_str(plan.codigo if plan else "default")
    pwd = _ros_str(cliente.password_pppoe)
    comment = _ros_str(cliente.nombre)
    # Sin IP fija no se manda remote-address: el perfil del router la saca del
    # pool. Antes se mandaba 0.0.0.0, que no es "ninguna", es una direccion.
    if cliente.ip_estatica:
        remote = f'remote-address={_validate_ip(cliente.ip_estatica)} '
    else:
        remote = ''
    cmd = (
        f'/ppp secret add name="{user}" '
        f'password="{pwd}" '
        f'profile="{perfil}" '
        f'{remote}'
        f'service=pppoe '
        f'comment="{comment}"'
    )
    result = _mikrotik_exec(wg_ip, [cmd])
    if result["ok"] and result["results"] and result["results"][0].get("err"):
        # La conexión SSH funcionó pero el comando en sí falló (ej: duplicado
        # detectado en una carrera, permisos, etc.) — no lo reportamos como éxito.
        return {"ok": False, "error": result["results"][0]["err"], "ya_existia": False}
    return {**result, "ya_existia": False}


# ── Qué le falta a una ficha ──────────────────────────────────────────────────
# Dos huecos distintos, separados a proposito.
#
# Los datos de planta --caja, borne y equipo-- se pueden llenar desde la
# oficina cuando estan apuntados en papel, que es el caso de casi toda la
# migracion. Una foto no: exige que alguien este parado en la casa del
# cliente. Si los juntaramos en un solo pendiente, la lista se llenaria de
# cosas que la oficina no puede resolver, nunca bajaria, y se dejaria de
# mirar.
#
# Por eso tampoco "sin fotos" bloquea: un cliente de hace tres anos sin fotos
# no es el error de nadie, es como entro. Es un aviso en su ficha y nada mas.


def _datos_de_ficha(db: Session, cliente_ids: list[int]) -> dict[int, tuple[bool, bool, bool]]:
    """Para cada cliente: (tiene borne, tiene ONU, tiene alguna foto).

    Tres consultas en total, no tres por cliente: la pagina entera de una vez.
    """
    if not cliente_ids:
        return {}
    con_borne = {
        r[0] for r in db.query(models.Borne.cliente_id)
        .filter(models.Borne.cliente_id.in_(cliente_ids)).all()
    }
    con_onu = {
        r[0] for r in db.query(models.Onu.cliente_id)
        .filter(models.Onu.cliente_id.in_(cliente_ids)).all()
    }
    con_foto = {
        r[0] for r in db.query(models.Evidencia.cliente_id)
        .filter(models.Evidencia.cliente_id.in_(cliente_ids)).all()
    }
    return {
        cid: (cid in con_borne, cid in con_onu, cid in con_foto)
        for cid in cliente_ids
    }


def _marcas_de_ficha(cliente: models.Cliente, datos: tuple[bool, bool, bool]) -> tuple[bool, bool]:
    """(le faltan datos de planta, no tiene fotos).

    Solo cuentan una vez instalado: a un cliente que todavia espera al tecnico
    no le falta nada, le falta el tecnico. Y solo la fibra tiene planta que
    registrar --un inalambrico va por antena y un satelital ni pasa por la
    red--, asi que para los demas nunca falta nada.
    """
    tiene_borne, tiene_onu, tiene_foto = datos
    instalado = cliente.fecha_instalacion is not None
    por_fibra = cliente.tipo_conexion == models.TipoConexion.fibra_optica
    faltan = bool(instalado and por_fibra and (not tiene_borne or not tiene_onu))
    return faltan, bool(instalado and not tiene_foto)


def _sin_planta_sql():
    """Clientes de fibra ya instalados a los que les falta el borne o la ONU.

    Se filtra en la consulta y no despues de paginar: si se descartaran filas
    ya traidas, la pagina 1 vendria con tres clientes y el total mentiria.
    """
    sin_borne = ~exists().where(models.Borne.cliente_id == models.Cliente.id)
    sin_onu = ~exists().where(models.Onu.cliente_id == models.Cliente.id)
    return and_(
        models.Cliente.tipo_conexion == models.TipoConexion.fibra_optica,
        models.Cliente.fecha_instalacion.isnot(None),
        or_(sin_borne, sin_onu),
    )


# ── Listado ───────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
def list_clientes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    zona_id: Optional[int] = None,
    estado: Optional[str] = None,
    tipo_conexion: Optional[str] = None,
    solo_mis_instalaciones: bool = False,
    solo_mis_registros: bool = False,
    # Los dos de la migracion: ver quienes vienen del sistema viejo, y ver a
    # cuales les falta todavia la caja, el borne o el equipo.
    migrado: Optional[bool] = None,
    faltan_datos: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    )

    # Sin filtro, se comporta como siempre (todos los tipos mezclados) — lo
    # necesita el buscador de cliente de Pagos, que debe encontrar también a
    # los satelitales. El módulo "Clientes" (fibra+inalámbrico) y el de
    # "Clientes Satelital" son quienes piden el filtro explícitamente.
    if tipo_conexion:
        tipos = [t.strip() for t in tipo_conexion.split(",") if t.strip()]
        query = query.filter(models.Cliente.tipo_conexion.in_(tipos))

    query = _alcance_clientes(
        query, db, current_user, solo_mis_instalaciones, solo_mis_registros
    )

    if search:
        query = query.filter(
            or_(
                models.Cliente.nombre.ilike(f"%{search}%"),
                models.Cliente.dni.ilike(f"%{search}%"),
                models.Cliente.ruc.ilike(f"%{search}%"),
                models.Cliente.usuario_pppoe.ilike(f"%{search}%"),
                models.Cliente.telefono.ilike(f"%{search}%"),
                models.Cliente.ip_estatica.ilike(f"%{search}%"),
            )
        )
    if zona_id:
        query = query.filter(models.Cliente.zona_id == zona_id)
    if estado:
        query = query.filter(models.Cliente.estado == estado)
    if migrado is not None:
        query = query.filter(models.Cliente.migrado == migrado)
    if faltan_datos:
        query = query.filter(_sin_planta_sql())

    total = query.count()
    clientes = query.offset((page - 1) * per_page).limit(per_page).all()

    # Batch-query pagos de los últimos 6 meses para todos los clientes de esta página
    hoy = date.today()
    meses_6 = _ultimos_n_meses(6)
    mes_actual_date = hoy.replace(day=1)
    cliente_ids = [c.id for c in clientes]

    pagos_batch = db.query(models.Pago.cliente_id, models.Pago.mes_pagado, models.Pago.estado).filter(
        models.Pago.cliente_id.in_(cliente_ids),
        models.Pago.mes_pagado.in_(meses_6),
    ).all()

    pagos_por_cliente: dict[int, dict[str, str]] = {}
    for p in pagos_batch:
        pagos_por_cliente.setdefault(p.cliente_id, {})[p.mes_pagado] = str(p.estado)

    marcas = _datos_de_ficha(db, cliente_ids)

    items = []
    for c in clientes:
        item = schemas.ClienteListItem.model_validate(c).model_dump(mode="json")
        item["monto_mensual"] = monto_mensual(c, c.plan)
        item["monto_mensual_detalle"] = detalle_monto(c, c.plan)
        item["faltan_datos"], item["sin_fotos"] = _marcas_de_ficha(
            c, marcas.get(c.id, (False, False, False))
        )
        c_pagos = pagos_por_cliente.get(c.id, {})
        meses_status = []
        for mes in meses_6:
            y, m = int(mes[:4]), int(mes[5:])
            mes_date = date(y, m, 1)
            if c.fecha_instalacion and mes_date < date(c.fecha_instalacion.year, c.fecha_instalacion.month, 1):
                meses_status.append({"mes": mes, "estado": "no_aplica"})
            elif mes in c_pagos:
                meses_status.append({"mes": mes, "estado": c_pagos[mes]})
            elif mes_date < mes_actual_date:
                meses_status.append({"mes": mes, "estado": "vencido"})
            else:
                meses_status.append({"mes": mes, "estado": "pendiente"})
        item["meses_pago"] = meses_status
        items.append(item)

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "items": items,
    }


# ── Registrar cliente (captación por vendedor/técnico) ────────────────────────
# No toca MikroTik todavía — eso pasa recién en /aprobar. El usuario/clave
# PPPoE se derivan del DNI (regla de negocio: el DNI es lo que se registra
# como usuario y contraseña PPPoE).

@router.get("/verificar-dni/{dni}")
def verificar_dni(
    dni: str,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente, models.RolUsuario.vendedor_campo, models.RolUsuario.tecnico)),
):
    """Qué líneas tiene ya ese DNI, para preguntarlo ANTES de registrar.

    El formulario llama aquí en cuanto se termina de escribir el documento.
    Si el DNI está libre no pasa nada y se sigue llenando la ficha; si no,
    la pantalla ofrece lo único que tiene sentido ofrecer: «esta persona ya
    tiene servicio, ¿es otra línea para ella?».

    Preguntarlo aquí, y no al guardar, es lo que convierte un rechazo seco
    en una decisión. Quien registra se entera antes de llenar la ficha
    entera, y de paso ve el nombre con el que esa persona ya está anotada
    — que es como se descubre un DNI mal tecleado.
    """
    existentes = lineas.lineas_del_dni(db, dni)
    if not existentes:
        return {"dni": dni, "existe": False, "lineas": [], "puede_agregar": True}

    usadas = max(c.linea for c in existentes)
    zonas = {
        z.id: z.nombre
        for z in db.query(models.Zona)
        .filter(models.Zona.id.in_([c.zona_id for c in existentes if c.zona_id]))
        .all()
    }

    return {
        "dni": dni,
        "existe": True,
        "titular": existentes[0].nombre,
        "telefono": existentes[0].telefono_whatsapp or existentes[0].telefono,
        "puede_agregar": usadas < lineas.MAX_LINEAS,
        "proxima_linea": usadas + 1 if usadas < lineas.MAX_LINEAS else None,
        "lineas": [
            {
                "id": c.id,
                "linea": c.linea,
                "nombre": c.nombre,
                "usuario_pppoe": c.usuario_pppoe,
                "estado": c.estado.value if c.estado else None,
                "zona": zonas.get(c.zona_id),
                "direccion": c.direccion,
                "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            }
            for c in existentes
        ],
    }


@router.post("", status_code=201)
def create_cliente(
    data: schemas.ClienteCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente, models.RolUsuario.vendedor_campo, models.RolUsuario.tecnico)),
):
    # Un DNI que ya existe no es necesariamente un error: puede ser el mismo
    # cliente contratando otra línea. La diferencia la marca quien registra,
    # y tiene que decirla a propósito — por descuido no se crea una línea.
    existentes = lineas.lineas_del_dni(db, data.dni)
    if existentes and not data.linea_adicional:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un cliente con ese DNI"
            if data.tipo_documento == models.TipoDocumento.dni
            else "Ese DNI de responsable ya está registrado en otro cliente",
        )

    if existentes:
        try:
            linea = lineas.siguiente_linea(db, data.dni)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        linea = 1

    # El RUC se repite entre las líneas de una misma empresa, así que ya no
    # alcanza con que exista: estorba solo si está a nombre de OTRO titular.
    if data.ruc and db.query(models.Cliente).filter(
        models.Cliente.ruc == data.ruc,
        models.Cliente.dni != data.dni,
    ).first():
        raise HTTPException(status_code=400, detail="Ya existe un cliente con ese RUC")

    dump = data.model_dump()
    dump.pop("linea_adicional", None)
    dump["linea"] = linea
    # Las credenciales salen SIEMPRE del DNI, nunca del RUC: un RUC es público
    # y cualquiera podría usarlo para entrar al portal del cliente.
    #
    # El usuario lleva además la letra de la línea — 70111222b la segunda—
    # porque el MikroTik no admite dos secretos con el mismo nombre. La
    # contraseña no la lleva: no necesita ser única, y es un dato que el
    # cliente termina dictando por teléfono.
    dump["usuario_pppoe"] = lineas.usuario_de_linea(data.dni, linea)
    dump["password_pppoe"] = data.dni
    dump["vendedor_id"] = current_user.id

    cliente = models.Cliente(**dump)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    nota_linea = (
        f" Es su {lineas.ordinal(linea)} línea; usuario {cliente.usuario_pppoe}."
        if linea > 1
        else ""
    )
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Cliente registrado por {current_user.nombre} — pendiente de aprobación.{nota_linea}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente.id).first()

    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return {"cliente": out}


@router.get("/{cliente_id}/ips-disponibles")
def ips_disponibles(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Las IP del pool que estan libres en el router de la zona del cliente.

    Se consulta al aprobar, para elegir la IP de una lista en vez de
    escribirla a mano. Importa acertar: el corte de servicio mete esa IP en
    una lista del firewall, asi que una IP equivocada corta a otro cliente, y
    una IP repetida deja a los dos sin servicio.
    """
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.tipo_conexion == models.TipoConexion.satelital:
        raise HTTPException(status_code=400, detail="Un cliente satelital no usa la red propia.")

    zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
    todas, ocupadas, duenos, error = _ips_del_pool(zona)
    if error:
        raise HTTPException(status_code=502, detail=error)

    # La IP que el router ya tiene fijada a ESTE cliente no esta ocupada para
    # el: es suya. Es el caso de todos los migrados, que ya existian en el
    # MikroTik antes que en el panel. Sin esto, el sistema le prohibe quedarse
    # con la suya y le da otra distinta, y a partir de ahi el corte por IP
    # apunta a una direccion que no es la de este cliente.
    suya_en_el_router = next(
        (ip for ip, dueno in duenos.items() if dueno == cliente.usuario_pppoe),
        None,
    )
    if suya_en_el_router:
        ocupadas = ocupadas - {suya_en_el_router}

    # Tambien las que este sistema ya tiene apuntadas en la misma zona: puede
    # haber un cliente dado de alta en el panel cuyo secreto aun no se creo en
    # el router, y esa IP no debe ofrecerse dos veces.
    reservadas = {
        ip for (ip,) in db.query(models.Cliente.ip_estatica).filter(
            models.Cliente.zona_id == cliente.zona_id,
            models.Cliente.ip_estatica != None,
            models.Cliente.id != cliente.id,
        ).all() if ip
    }
    ocupadas = ocupadas | reservadas

    libres = [ip for ip in todas if ip not in ocupadas]
    return {
        "zona": zona.nombre,
        "pool": zona.pool_pppoe,
        "total_pool": len(todas),
        "ocupadas": len(todas) - len(libres),
        "total_libres": len(libres),
        "ip_actual": cliente.ip_estatica,
        # La que el router ya le tiene puesta, si es un cliente migrado. La
        # pantalla la propone antes que ninguna otra: cambiarsela obligaria a
        # tocar el router, y dejarla distinta romperia el corte por IP.
        "ip_en_el_router": suya_en_el_router,
        "sugerida": suya_en_el_router or (libres[0] if libres else None),
        # La lista completa puede ser larguisima en un pool grande y no aporta
        # nada: con las primeras hay de sobra para elegir.
        "disponibles": libres[:200],
    }


# ── Aprobar / rechazar instalación ────────────────────────────────────────────

@router.post("/{cliente_id}/aprobar")
def aprobar_cliente(
    cliente_id: int,
    data: Optional[schemas.ClienteAprobarRequest] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="El cliente no está pendiente de aprobación")

    ip_elegida = (data.ip_estatica if data else None)
    if ip_elegida and cliente.tipo_conexion != models.TipoConexion.satelital:
        ip_elegida = _validate_ip(ip_elegida)

        # Que no se la estemos quitando a otro cliente de la misma zona.
        otro = db.query(models.Cliente).filter(
            models.Cliente.zona_id == cliente.zona_id,
            models.Cliente.ip_estatica == ip_elegida,
            models.Cliente.id != cliente.id,
        ).first()
        if otro:
            raise HTTPException(
                status_code=400,
                detail=f"La IP {ip_elegida} ya está asignada a {otro.nombre}.",
            )

        # Y que siga libre en el router: entre que se abrió la pantalla y se
        # pulsó aprobar, otro pudo haberla tomado.
        zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
        todas, ocupadas, duenos, error = _ips_del_pool(zona)
        if not error:
            # Si esa IP la tiene el secreto de este mismo cliente, es suya.
            if duenos.get(ip_elegida) == cliente.usuario_pppoe:
                ocupadas = ocupadas - {ip_elegida}
            if ip_elegida not in todas:
                raise HTTPException(
                    status_code=400,
                    detail=f"La IP {ip_elegida} no pertenece al pool {zona.pool_pppoe} del router.",
                )
            # Su propia IP no cuenta como ocupada: puede venir de un
            # cliente migrado que ya tenia secreto, o de una reaprobacion.
            if ip_elegida != cliente.ip_estatica and ip_elegida in ocupadas:
                raise HTTPException(
                    status_code=400,
                    detail=f"La IP {ip_elegida} acaba de ocuparse en el router. Elija otra.",
                )
        # Si el router no contesta no se bloquea la aprobación: hoy tampoco se
        # bloquea, y la creación del secreto ya avisa de que no hubo contacto.

        cliente.ip_estatica = ip_elegida

    cliente.estado = models.EstadoCliente.aprobado
    cliente.aprobado_por_id = current_user.id
    cliente.fecha_aprobacion = datetime.utcnow()

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=(
            f"Instalación aprobada por {current_user.nombre}."
            + (f" IP asignada: {cliente.ip_estatica}." if cliente.ip_estatica else "")
        ),
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # Un cliente satelital no tiene PPPoE ni pasa por ningún MikroTik — el
    # servicio lo presta Starlink directamente, no la red propia.
    if cliente.tipo_conexion == models.TipoConexion.satelital:
        return {
            "ok": True,
            "estado": "aprobado",
            "mikrotik_ok": True,
            "mikrotik_ya_existia": False,
            "mikrotik_msg": "No aplica — cliente satelital, no usa la red propia.",
        }

    mt_result = _crear_secreto_pppoe(db, cliente)
    if mt_result.get("ya_existia"):
        mikrotik_msg = "El secreto PPPoE ya existía en el MikroTik (cliente migrado) — se vinculó sin crear uno nuevo."
    else:
        mikrotik_msg = mt_result.get("error", "Secreto PPPoE creado correctamente.")

    return {
        "ok": True,
        "estado": "aprobado",
        "mikrotik_ok": mt_result["ok"],
        "mikrotik_ya_existia": mt_result.get("ya_existia", False),
        "mikrotik_msg": mikrotik_msg,
    }


@router.post("/{cliente_id}/activar-satelital")
def activar_satelital(
    cliente_id: int,
    data: schemas.ClienteActivarSatelitalRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin)
    ),
):
    """Activa un cliente satelital ya aprobado — no hay fibra que tender, así
    que no pasa por /instalar (caja NAP/borne/ONU): acá se registra el equipo
    Starlink entregado y el cliente queda activo de una vez."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.tipo_conexion != models.TipoConexion.satelital:
        raise HTTPException(status_code=400, detail="Este cliente no es satelital")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado")

    cliente.estado = models.EstadoCliente.activo
    cliente.fecha_instalacion = date.today()
    cliente.fecha_ultima_activacion = date.today()
    cliente.cuenta_starlink_email = data.cuenta_starlink_email
    cliente.estado_equipo = data.estado_equipo
    cliente.equipo_marca = data.equipo_marca
    cliente.equipo_modelo = data.equipo_modelo
    cliente.equipo_serial = data.equipo_serial
    cliente.equipo_valor = data.equipo_valor
    cliente.equipo_fecha_entrega = data.equipo_fecha_entrega

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=f"Cliente satelital activado por {current_user.nombre} — equipo {data.equipo_marca} {data.equipo_modelo or ''}".strip(),
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    db.refresh(cliente)

    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente_id).first()
    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return out


@router.post("/{cliente_id}/rechazar")
def rechazar_cliente(
    cliente_id: int,
    data: schemas.ClienteRechazarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="El cliente no está pendiente de aprobación")

    cliente.estado = models.EstadoCliente.rechazado
    cliente.motivo_rechazo = data.motivo

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Instalación rechazada por {current_user.nombre}: {data.motivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    return {"ok": True, "estado": "rechazado"}


# ── Instalación física (técnico) ──────────────────────────────────────────────

@router.post("/{cliente_id}/instalar")
def instalar_cliente(
    cliente_id: int,
    data: schemas.ClienteInstalarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado para instalación")
    _check_zona_access(db, current_user, cliente.zona_id)

    # El dia en que el servicio quedo funcionando. El tecnico puede correrla
    # hacia atras --se instalo el lunes y recien hoy se registra-- pero no
    # hacia adelante ni mas de una semana atras: de aqui sale el dia de pago,
    # y una fecha inventada le cambia el cobro al cliente todos los meses.
    # Se comprueba aca, antes que la caja y la ONU, porque es lo barato y
    # porque si esta mal el tecnico tiene que ver ESTE error y no otro.
    hoy = date.today()
    activacion = data.fecha_activacion or hoy
    if activacion > hoy:
        raise HTTPException(
            status_code=400,
            detail="La fecha de activación no puede ser futura.",
        )
    if (hoy - activacion).days > 7:
        raise HTTPException(
            status_code=400,
            detail="La fecha de activación no puede ser de hace más de 7 días. "
                   "Si hay que corregirla más atrás, lo hace un administrador "
                   "desde la ficha del cliente.",
        )

    # Quien no lleva planta que registrar, y por que, son dos casos distintos.
    #
    # Un cliente inalambrico llega por antena y PPPoE: no tiene fibra, ni caja
    # NAP, ni borne, ni ONU. Pedirselos no era un requisito mal puesto, era un
    # callejon sin salida: no existe ningun numero valido que darle.
    #
    # Un cliente migrado si la tiene, pero nadie la anoto cuando se instalo
    # hace anos. Exigirsela al tecnico ahora seria pedirle que invente el
    # dato, y un dato inventado es peor que uno vacio: un borne marcado al
    # azar deja el mapa mintiendo dos veces --dice ocupado uno que esta libre
    # y libre el que de verdad esta ocupado-- y manda al proximo tecnico a un
    # viaje perdido.
    #
    # Opcional no es prohibido: si el tecnico esta delante de la caja y sabe
    # el borne, lo pone y se guarda igual. Lo que falte queda pendiente y se
    # ve en la ficha del cliente.
    por_fibra = cliente.tipo_conexion == models.TipoConexion.fibra_optica
    exige_planta = por_fibra and not cliente.migrado
    caja = None
    borne = None
    onu = None

    if exige_planta and (
        data.caja_nap_id is None or data.numero_borne is None or data.onu_id is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Una instalación de fibra necesita caja NAP, borne y ONU.",
        )

    if por_fibra and data.caja_nap_id is not None and data.numero_borne is not None:
        caja = db.query(models.CajaNap).filter(models.CajaNap.id == data.caja_nap_id).first()
        if not caja:
            raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
        borne = db.query(models.Borne).filter(
            models.Borne.caja_nap_id == caja.id,
            models.Borne.numero == data.numero_borne,
        ).first()
        if not borne:
            raise HTTPException(status_code=404, detail="Borne no encontrado en esa caja")
        if borne.estado != models.EstadoBorne.libre:
            raise HTTPException(status_code=400, detail="El borne no está libre")

    if por_fibra and data.onu_id is not None:
        onu = db.query(models.Onu).filter(models.Onu.id == data.onu_id).first()
        if not onu:
            raise HTTPException(status_code=404, detail="ONU no encontrada")
        if onu.estado != models.EstadoOnu.asignado_tecnico or (
            current_user.rol == models.RolUsuario.tecnico and onu.tecnico_id != current_user.id
        ):
            raise HTTPException(status_code=400, detail="La ONU no está disponible en el inventario de este técnico")

    cliente.estado = models.EstadoCliente.activo
    cliente.fecha_instalacion = hoy
    cliente.fecha_ultima_activacion = activacion
    # Un mes de servicio, no treinta dias: sumar 30 a un 31 de enero da el 2
    # de marzo, y a partir de ahi el cliente ya no paga el dia que le dijeron.
    # Ver app/facturacion.py, que tiene la regla entera y por que es asi.
    cliente.fecha_vencimiento = primer_vencimiento(activacion)
    cliente.tecnico_instalador_id = current_user.id
    cliente.metros_cable = data.metros_cable

    if borne is not None:
        borne.estado = models.EstadoBorne.ocupado
        borne.cliente_id = cliente.id
        borne.codigo_precinto = data.codigo_precinto
        borne.potencia_optica_dbm = data.potencia_optica_dbm

    if onu is not None:
        onu.estado = models.EstadoOnu.instalado
        onu.cliente_id = cliente.id
        onu.fecha_instalacion = hoy

    partes = []
    if caja is not None and borne is not None:
        partes.append(f"Caja {caja.codigo}, borne {borne.numero}")
    if onu is not None:
        partes.append(f"ONU {onu.numero_serie}")

    if partes:
        detalle = f"Instalado por {current_user.nombre} — " + ", ".join(partes) + "."
    elif por_fibra:
        # Un migrado sin nada que anotar. Queda dicho en el historial para que
        # dentro de un ano se sepa por que esta ficha esta a medias.
        detalle = (
            f"Instalado por {current_user.nombre} — cliente migrado, "
            f"sin datos de planta registrados."
        )
    else:
        detalle = f"Instalado por {current_user.nombre} — enlace inalámbrico."

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=detalle,
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    db.refresh(cliente)

    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        nombre = cliente.nombre.split()[0]
        monto = monto_mensual(cliente, plan)
        msg = (
            f"🟢 *WISP* — Servicio Activado\n\n"
            f"Hola *{nombre}* 🎉, tu instalación se completó y tu servicio ya está *activo*.\n\n"
            f"📶 Plan: *{plan.nombre if plan else 'Internet'}*\n"
            f"💰 Cuota mensual: *S/ {monto:.2f}*\n"
            f"📆 Próximo vencimiento: *{cliente.fecha_vencimiento.strftime('%d/%m/%Y')}*\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {"ok": True, "estado": "activo"}


@router.post("/{cliente_id}/no-instalar")
def no_instalar_cliente(
    cliente_id: int,
    data: schemas.ClienteNoInstalarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.estado != models.EstadoCliente.aprobado:
        raise HTTPException(status_code=400, detail="El cliente no está aprobado para instalación")
    _check_zona_access(db, current_user, cliente.zona_id)

    cliente.estado = models.EstadoCliente.no_instalado
    cliente.motivo_no_instalado = data.motivo

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Instalación no efectuada — {current_user.nombre}: {data.motivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()
    return {"ok": True, "estado": "no_instalado"}


@router.put("/{cliente_id}/datos-de-instalacion")
def completar_datos_de_instalacion(
    cliente_id: int,
    data: schemas.ClienteDatosInstalacionRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.tecnico)
    ),
):
    """Registrar la caja, el borne y el equipo de un cliente ya instalado.

    Para eso se hizo: los clientes migrados quedaron activos sin planta
    porque nadie la anoto hace anos, y el flujo de instalacion no sirve para
    arreglarlo --solo corre sobre clientes "aprobados"--. Aqui se apunta lo
    que el tecnico ve el dia que por fin pasa por la casa.

    Tambien corrige: si se habia puesto un borne equivocado, el viejo se
    libera. Lo que no se vale es usarlo para cambiar un equipo averiado, que
    eso tiene su propio camino por averias y deja el rastro del cambio.
    """
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _check_zona_access(db, current_user, cliente.zona_id)

    if cliente.fecha_instalacion is None:
        raise HTTPException(
            status_code=400,
            detail="El cliente todavía no está instalado — estos datos se registran al instalarlo.",
        )
    if cliente.tipo_conexion != models.TipoConexion.fibra_optica:
        raise HTTPException(
            status_code=400,
            detail="Solo los clientes de fibra tienen caja NAP, borne y ONU.",
        )
    if (data.caja_nap_id is None) != (data.numero_borne is None):
        raise HTTPException(
            status_code=400,
            detail="La caja y el borne van juntos: el número de borne solo identifica algo dentro de su caja.",
        )

    cambios = []

    if data.caja_nap_id is not None:
        caja = db.query(models.CajaNap).filter(models.CajaNap.id == data.caja_nap_id).first()
        if not caja:
            raise HTTPException(status_code=404, detail="Caja NAP no encontrada")
        nuevo_borne = db.query(models.Borne).filter(
            models.Borne.caja_nap_id == caja.id,
            models.Borne.numero == data.numero_borne,
        ).first()
        if not nuevo_borne:
            raise HTTPException(status_code=404, detail="Borne no encontrado en esa caja")
        # Libre, o ya suyo: reenviar el mismo dato no puede fallar.
        if nuevo_borne.cliente_id not in (None, cliente.id):
            raise HTTPException(
                status_code=400,
                detail="Ese borne ya está ocupado por otro cliente.",
            )
        if nuevo_borne.estado == models.EstadoBorne.danado:
            raise HTTPException(status_code=400, detail="Ese borne está marcado como dañado.")

        anterior = db.query(models.Borne).filter(
            models.Borne.cliente_id == cliente.id,
            models.Borne.id != nuevo_borne.id,
        ).first()
        if anterior is not None:
            codigo_anterior = anterior.caja_nap.codigo if anterior.caja_nap else "?"
            anterior.cliente_id = None
            anterior.estado = models.EstadoBorne.libre
            anterior.codigo_precinto = None
            cambios.append(f"borne liberado {codigo_anterior} #{anterior.numero}")

        nuevo_borne.cliente_id = cliente.id
        nuevo_borne.estado = models.EstadoBorne.ocupado
        if data.codigo_precinto is not None:
            nuevo_borne.codigo_precinto = data.codigo_precinto
        if data.potencia_optica_dbm is not None:
            nuevo_borne.potencia_optica_dbm = data.potencia_optica_dbm
        cambios.append(f"caja {caja.codigo}, borne {nuevo_borne.numero}")

    if data.onu_id is not None:
        onu = db.query(models.Onu).filter(models.Onu.id == data.onu_id).first()
        if not onu:
            raise HTTPException(status_code=404, detail="ONU no encontrada")
        if onu.cliente_id not in (None, cliente.id):
            raise HTTPException(
                status_code=400,
                detail="Ese equipo ya figura instalado en otro cliente.",
            )
        if onu.cliente_id is None:
            # El tecnico solo puede usar lo que lleva encima. El admin
            # tambien el almacen: esta en la oficina completando fichas con
            # los papeles del sistema viejo delante, y el equipo de un
            # cliente migrado acaba de darse de alta ahi --nunca estuvo
            # asignado a nadie--. Exigirle que se lo asigne antes a un
            # tecnico que no va a ir a ningun lado seria un tramite inventado.
            if current_user.rol == models.RolUsuario.tecnico:
                disponible = (
                    onu.estado == models.EstadoOnu.asignado_tecnico
                    and onu.tecnico_id == current_user.id
                )
                problema = "La ONU no está disponible en el inventario de este técnico"
            else:
                disponible = onu.estado in (
                    models.EstadoOnu.en_almacen,
                    models.EstadoOnu.asignado_tecnico,
                )
                problema = (
                    "Ese equipo no está disponible: figura como "
                    f"{onu.estado.value.replace('_', ' ')}."
                )
            if not disponible:
                raise HTTPException(status_code=400, detail=problema)

        vieja = db.query(models.Onu).filter(
            models.Onu.cliente_id == cliente.id,
            models.Onu.id != onu.id,
        ).first()
        if vieja is not None:
            # Vuelve al almacen, no se borra: aunque fuera un dato puesto a
            # ojo, que existio tiene que quedar en el historial.
            vieja.cliente_id = None
            vieja.tecnico_id = None
            vieja.estado = models.EstadoOnu.en_almacen
            cambios.append(f"equipo anterior {vieja.numero_serie} devuelto al almacén")

        onu.cliente_id = cliente.id
        onu.estado = models.EstadoOnu.instalado
        if onu.fecha_instalacion is None:
            onu.fecha_instalacion = cliente.fecha_instalacion or date.today()
        cambios.append(f"equipo {onu.numero_serie}")

    if data.metros_cable is not None:
        cliente.metros_cable = data.metros_cable
        cambios.append(f"{data.metros_cable:g} m de cable")

    if not cambios:
        raise HTTPException(status_code=400, detail="No se envió ningún dato que registrar.")

    db.add(models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.nota,
        descripcion=f"Datos de instalación registrados por {current_user.nombre} — "
                    + ", ".join(cambios) + ".",
        usuario_id=current_user.id,
    ))
    db.commit()

    faltan, sin_fotos = _marcas_de_ficha(
        cliente, _datos_de_ficha(db, [cliente.id]).get(cliente.id, (False, False, False))
    )
    return {"ok": True, "faltan_datos": faltan, "sin_fotos": sin_fotos}


# ── Notificaciones ────────────────────────────────────────────────────────────
# No hay una tabla de notificaciones aparte — se calculan en vivo a partir de
# lo que ya existe (clientes pendientes de aprobar, instalaciones recientes,
# averías demoradas, instalaciones fallidas, estado de WhatsApp). Así nunca
# quedan desincronizadas de la realidad: en cuanto se resuelve lo que las
# generó, la notificación desaparece sola.

def _sin_tz(dt: Optional[datetime]) -> Optional[datetime]:
    return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt


@router.get("/resumen-estados")
def resumen_estados(
    tipo_conexion: Optional[str] = Query(None),
    zona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Cuantos clientes hay en cada estado, en UNA consulta.

    Antes la pantalla pedia una lista entera por cada tarjeta solo para leer su
    total: cuatro llamadas, y nueve si se quieren todos los estados. Con mil
    clientes eso es absurdo. Esto es un GROUP BY y vuelve en una.

    Recorta por rol igual que la lista, para que las tarjetas no digan 40
    cuando debajo se ven 7.
    """
    query = db.query(
        models.Cliente.estado, func.count(models.Cliente.id)
    )
    query = _alcance_clientes(query, db, current_user)
    if tipo_conexion:
        tipos = [t.strip() for t in tipo_conexion.split(",") if t.strip()]
        query = query.filter(models.Cliente.tipo_conexion.in_(tipos))
    if zona_id:
        query = query.filter(models.Cliente.zona_id == zona_id)

    conteos = dict(query.group_by(models.Cliente.estado).all())
    # Todos los estados salen siempre, aunque esten a cero: el filtro necesita
    # poder ofrecerlos igual, y un hueco en el diccionario obligaria al
    # frontend a adivinar.
    por_estado = {
        e.value: int(conteos.get(e, 0)) for e in models.EstadoCliente
    }
    return {"total": sum(por_estado.values()), "por_estado": por_estado}


@router.get("/notificaciones", response_model=List[schemas.NotificacionOut])
async def get_notificaciones(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(
        require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)
    ),
):
    ahora = datetime.utcnow()
    hace_7_dias = date.today() - timedelta(days=7)
    hace_14_dias = ahora - timedelta(days=14)
    hace_24_horas = ahora - timedelta(hours=24)
    notificaciones = []

    # 1) Clientes pendientes de aprobación (cubre también "la vendedora
    # registró un cliente" — es el mismo evento visto desde dos ángulos).
    pendientes = db.query(models.Cliente).options(
        joinedload(models.Cliente.vendedor)
    ).filter(
        models.Cliente.estado == models.EstadoCliente.pendiente_aprobacion,
    ).order_by(models.Cliente.creado_en.desc()).limit(20).all()

    for c in pendientes:
        quien = c.vendedor.nombre if c.vendedor else "alguien"
        notificaciones.append(schemas.NotificacionOut(
            tipo="pendiente_aprobacion",
            titulo="Nuevo cliente pendiente de aprobación",
            detalle=f"{c.nombre} — registrado por {quien}",
            url=f"/clientes/{c.id}",
            fecha=_sin_tz(c.creado_en) or ahora,
        ))

    # 2) Instalaciones completadas recientemente (el técnico instaló).
    instalados = db.query(models.Cliente).options(
        joinedload(models.Cliente.tecnico_instalador)
    ).filter(
        models.Cliente.estado == models.EstadoCliente.activo,
        models.Cliente.fecha_instalacion.isnot(None),
        models.Cliente.fecha_instalacion >= hace_7_dias,
    ).order_by(models.Cliente.fecha_instalacion.desc()).limit(20).all()

    for c in instalados:
        quien = c.tecnico_instalador.nombre if c.tecnico_instalador else "un técnico"
        notificaciones.append(schemas.NotificacionOut(
            tipo="instalado",
            titulo="Instalación completada",
            detalle=f"{c.nombre} — instalado por {quien}",
            url=f"/clientes/{c.id}",
            fecha=datetime.combine(c.fecha_instalacion, datetime.min.time()),
        ))

    # 3) Instalaciones que no se pudieron hacer — se pierden de vista fácil
    # si nadie las reprograma.
    no_instalados = db.query(models.Cliente).filter(
        models.Cliente.estado == models.EstadoCliente.no_instalado,
        models.Cliente.actualizado_en.isnot(None),
        models.Cliente.actualizado_en >= hace_14_dias,
    ).order_by(models.Cliente.actualizado_en.desc()).limit(20).all()

    for c in no_instalados:
        notificaciones.append(schemas.NotificacionOut(
            tipo="no_instalado",
            titulo="Instalación no efectuada — necesita seguimiento",
            detalle=f"{c.nombre} — {c.motivo_no_instalado or 'sin motivo registrado'}",
            url=f"/clientes/{c.id}",
            fecha=_sin_tz(c.actualizado_en) or ahora,
        ))

    # 4) Averías reportadas que llevan más de 24h sin resolverse.
    demoradas = db.query(models.Averia).options(
        joinedload(models.Averia.cliente),
        joinedload(models.Averia.caja_nap),
    ).filter(
        models.Averia.estado.in_([models.EstadoAveria.pendiente, models.EstadoAveria.asignada]),
        models.Averia.fecha_reporte <= hace_24_horas,
    ).order_by(models.Averia.fecha_reporte.asc()).limit(20).all()

    for a in demoradas:
        if a.cliente:
            zona_id, afectado = a.cliente.zona_id, a.cliente.nombre
        elif a.caja_nap:
            zona_id, afectado = a.caja_nap.zona_id, f"Caja {a.caja_nap.codigo}"
        else:
            continue
        fecha_reporte = _sin_tz(a.fecha_reporte) or ahora
        horas = max(int((ahora - fecha_reporte).total_seconds() // 3600), 24)
        estado_label = "asignada, pero sigue sin resolverse" if a.estado == models.EstadoAveria.asignada else "sin asignar"
        notificaciones.append(schemas.NotificacionOut(
            tipo="averia_demorada",
            titulo="Avería sin atender",
            detalle=f"{afectado} — reportada hace {horas} h, {estado_label}",
            url=f"/averias/zona/{zona_id}",
            fecha=fecha_reporte,
        ))

    # 5) Vendedoras de campo en ruta — reemplaza el "mandar ubicación al
    # grupo de WhatsApp" como aviso de que alguien salió a trabajar. Se
    # limita a las últimas 24h para que una jornada olvidada sin finalizar
    # no se quede avisando para siempre.
    en_ruta = db.query(models.JornadaVendedor).options(
        joinedload(models.JornadaVendedor.vendedor),
        joinedload(models.JornadaVendedor.zona),
    ).filter(
        models.JornadaVendedor.estado == models.EstadoJornada.activa,
        models.JornadaVendedor.iniciado_en >= hace_24_horas,
    ).order_by(models.JornadaVendedor.iniciado_en.desc()).limit(20).all()

    for j in en_ruta:
        quien = j.vendedor.nombre if j.vendedor else "Una vendedora"
        zona_txt = f" — zona {j.zona.nombre}" if j.zona else ""
        notificaciones.append(schemas.NotificacionOut(
            tipo="jornada_iniciada",
            titulo="Jornada de campo iniciada",
            detalle=f"{quien} está en ruta{zona_txt}",
            url="/jornadas",
            fecha=_sin_tz(j.iniciado_en) or ahora,
        ))

    # 6) WhatsApp desconectado — si nadie lo nota, los recordatorios de pago
    # simplemente dejan de salir en silencio.
    try:
        status = await wa_request("GET", "/status")
        conectado = bool(status.get("connected"))
    except Exception:
        conectado = False

    if not conectado:
        notificaciones.append(schemas.NotificacionOut(
            tipo="whatsapp_desconectado",
            titulo="WhatsApp desconectado",
            detalle="Los recordatorios de pago y avisos automáticos no se están enviando.",
            url="/configuracion/whatsapp",
            fecha=ahora,
        ))

    notificaciones.sort(key=lambda n: n.fecha, reverse=True)
    return notificaciones[:30]


# ── Obtener cliente ───────────────────────────────────────────────────────────

@router.get("/{cliente_id}")
def get_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
        joinedload(models.Cliente.vendedor),
        joinedload(models.Cliente.aprobado_por),
        joinedload(models.Cliente.tecnico_instalador),
        joinedload(models.Cliente.borne).joinedload(models.Borne.caja_nap),
    ).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _check_zona_access(db, current_user, cliente.zona_id)
    if current_user.rol in (models.RolUsuario.vendedor_campo, models.RolUsuario.atencion_cliente):
        if cliente.vendedor_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene acceso a este cliente")
    out = schemas.ClienteOut.model_validate(cliente).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente, cliente.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente, cliente.plan)
    out["faltan_datos"], out["sin_fotos"] = _marcas_de_ficha(
        cliente, _datos_de_ficha(db, [cliente.id]).get(cliente.id, (False, False, False))
    )
    return out


# ── Actualizar cliente ────────────────────────────────────────────────────────

@router.put("/{cliente_id}")
def update_cliente(
    cliente_id: int,
    data: schemas.ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _check_zona_access(db, current_user, cliente.zona_id)

    update_data = data.model_dump(exclude_unset=True)

    # Las fechas mandan el dinero: mueven cuando se le cobra y cuando se le
    # corta. Solo un administrador las toca, y cada cambio queda escrito con
    # su nombre, de que fecha a cual. Si alguien corre una fecha de pago, se
    # sabe quien fue.
    _FECHAS = {
        "fecha_instalacion": "instalación",
        "fecha_ultima_activacion": "activación",
        "fecha_vencimiento": "vencimiento",
    }
    cambios_de_fecha = []
    for campo, etiqueta in _FECHAS.items():
        if campo not in update_data:
            continue
        if current_user.rol != models.RolUsuario.admin:
            raise HTTPException(
                status_code=403,
                detail="Solo un administrador puede corregir las fechas del cliente.",
            )
        antes = getattr(cliente, campo)
        despues = update_data[campo]
        if antes != despues:
            cambios_de_fecha.append(
                "%s: %s → %s"
                % (
                    etiqueta,
                    antes.strftime("%d/%m/%Y") if antes else "vacía",
                    despues.strftime("%d/%m/%Y") if despues else "vacía",
                )
            )

    # Si se corrige la activacion y no se dice nada del vencimiento, el dia de
    # pago cambia y el vencimiento viejo deja de cuadrar: se recalcula al
    # mismo dia del mes que ya tenia apuntado.
    if (
        "fecha_ultima_activacion" in update_data
        and update_data["fecha_ultima_activacion"]
        and "fecha_vencimiento" not in update_data
        and cliente.fecha_vencimiento
    ):
        nuevo_dia = dia_de_pago(update_data["fecha_ultima_activacion"])
        if nuevo_dia != cliente.fecha_vencimiento.day:
            update_data["fecha_vencimiento"] = con_dia(
                cliente.fecha_vencimiento.year,
                cliente.fecha_vencimiento.month,
                nuevo_dia,
            )
            cambios_de_fecha.append(
                "vencimiento recalculado al día %d por el cambio de activación"
                % nuevo_dia
            )

    # Un cliente satelital no tiene secreto PPPoE — no hay nada que
    # sincronizar en ningún MikroTik.
    if cliente.tipo_conexion != models.TipoConexion.satelital:
        cmds = []
        wg_ip = _get_wg_ip(db, cliente.zona_id)

        user = _ros_str(cliente.usuario_pppoe)
        if "password_pppoe" in update_data:
            cmds.append(f'/ppp secret set [find name="{user}"] password="{_ros_str(update_data["password_pppoe"])}"')

        if "plan_id" in update_data:
            plan = db.query(models.Plan).filter(models.Plan.id == update_data["plan_id"]).first()
            if plan:
                cmds.append(f'/ppp secret set [find name="{user}"] profile="{_ros_str(plan.codigo)}"')

        if cmds and wg_ip:
            _mikrotik_exec(wg_ip, cmds)

    if "pin_app" in update_data and update_data["pin_app"]:
        update_data["pin_app"] = get_password_hash(update_data["pin_app"])

    for key, value in update_data.items():
        setattr(cliente, key, value)

    # Las fechas mueven el dinero, asi que el cambio queda firmado.
    if cambios_de_fecha:
        db.add(models.Historial(
            cliente_id=cliente.id,
            tipo=models.TipoHistorial.nota,
            descripcion="Fechas corregidas por %s — %s."
                        % (current_user.nombre, "; ".join(cambios_de_fecha)),
            usuario_id=current_user.id,
        ))

    db.commit()
    db.refresh(cliente)
    cliente_full = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona),
        joinedload(models.Cliente.plan),
    ).filter(models.Cliente.id == cliente_id).first()
    out = schemas.ClienteOut.model_validate(cliente_full).model_dump(mode="json")
    out["monto_mensual"] = monto_mensual(cliente_full, cliente_full.plan)
    out["monto_mensual_detalle"] = detalle_monto(cliente_full, cliente_full.plan)
    return out


# ── Eliminar cliente + MikroTik ───────────────────────────────────────────────

@router.delete("/{cliente_id}")
def delete_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Esto borra de verdad: el cliente, su historial, sus fotos y SUS PAGOS.
    # No hay papelera ni deshacer. Por eso solo alcanza a quien nunca llego a
    # tener servicio -- se registro, no se pudo instalar, y no deberia quedar
    # ocupando sitio.
    #
    # A un cliente que si estuvo conectado no se le borra: su historial de
    # cobros es la respuesta a "yo ya pague ese mes", y una vez borrado no
    # hay forma de recuperarlo. Para ese hay retiro, que lo cierra y conserva
    # todo.
    if cliente.fecha_instalacion is not None:
        raise HTTPException(
            status_code=400,
            detail="Este cliente llegó a instalarse, así que no se borra: con él se irían "
                   "sus pagos y su historial. Para darlo de baja usa el retiro de equipos, "
                   "que cierra el servicio y conserva el registro.",
        )

    pagos = db.query(models.Pago).filter(models.Pago.cliente_id == cliente_id).count()
    if pagos:
        raise HTTPException(
            status_code=400,
            detail=f"Este cliente tiene {pagos} pago(s) registrados y no se puede borrar. "
                   "Un cobro no se borra nunca: si fue un error, anula el pago.",
        )

    usuario = _ros_str(cliente.usuario_pppoe)
    wg_ip = _get_wg_ip(db, cliente.zona_id)

    # Liberar borne/ONU asignados — no se destruyen, vuelven a disponibles
    borne = db.query(models.Borne).filter(models.Borne.cliente_id == cliente_id).first()
    if borne:
        borne.cliente_id = None
        borne.estado = models.EstadoBorne.libre
        borne.codigo_precinto = None
        borne.potencia_optica_dbm = None

    for onu in db.query(models.Onu).filter(models.Onu.cliente_id == cliente_id).all():
        onu.cliente_id = None
        onu.fecha_instalacion = None
        onu.estado = models.EstadoOnu.asignado_tecnico if onu.tecnico_id else models.EstadoOnu.en_almacen

    # Eliminar registros que no tienen sentido sin el cliente
    averia_ids = [a.id for a in db.query(models.Averia.id).filter(models.Averia.cliente_id == cliente_id).all()]
    if averia_ids:
        db.query(models.Evidencia).filter(models.Evidencia.averia_id.in_(averia_ids)).delete(synchronize_session=False)
        db.query(models.Averia).filter(models.Averia.cliente_id == cliente_id).delete(synchronize_session=False)
    db.query(models.Evidencia).filter(models.Evidencia.cliente_id == cliente_id).delete()
    orden_retiro_ids = [o.id for o in db.query(models.OrdenRetiro.id).filter(models.OrdenRetiro.cliente_id == cliente_id).all()]
    if orden_retiro_ids:
        db.query(models.Evidencia).filter(models.Evidencia.orden_retiro_id.in_(orden_retiro_ids)).delete(synchronize_session=False)
    db.query(models.OrdenRetiro).filter(models.OrdenRetiro.cliente_id == cliente_id).delete()
    db.query(models.Historial).filter(models.Historial.cliente_id == cliente_id).delete()
    db.query(models.Pago).filter(models.Pago.cliente_id == cliente_id).delete()
    db.delete(cliente)
    db.commit()

    # Eliminar secreto PPPoE del MikroTik
    mt_result = {"ok": False}
    if wg_ip:
        cmd = f'/ppp secret remove [find name="{usuario}"]'
        mt_result = _mikrotik_exec(wg_ip, [cmd])

    return {"ok": True, "mikrotik_ok": mt_result["ok"]}


# ── Cortar servicio + MikroTik ────────────────────────────────────────────────

def cortar_cliente(db: Session, cliente: models.Cliente, motivo: str, usuario_id: Optional[int] = None) -> dict:
    """Lógica real del corte — la usa tanto el endpoint manual (admin/atención
    al cliente) como el job automático del scheduler (sin usuario autenticado,
    de ahí que usuario_id sea opcional)."""
    if cliente.tipo_conexion == models.TipoConexion.satelital:
        raise HTTPException(status_code=400, detail="No se puede cortar un cliente satelital — el servicio lo presta Starlink directamente")

    cliente.estado = models.EstadoCliente.suspendido
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.corte,
        descripcion=motivo,
        usuario_id=usuario_id,
    )
    db.add(historial)
    db.commit()

    # WhatsApp primero — cliente lo recibe mientras aún tiene internet
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        zona = db.query(models.Zona).filter(models.Zona.id == cliente.zona_id).first()
        nombre = cliente.nombre.split()[0]
        hoy = date.today()
        mes_label = f"{MESES[hoy.month]} {hoy.year}"
        tiendas = f"🏪 *Tiendas autorizadas:*\n{zona.tiendas_pago}\n" if zona and zona.tiendas_pago else ""
        monto = monto_mensual(cliente, plan) if plan else 0
        msg = (
            f"🔴 *WISP* — Servicio Suspendido\n\n"
            f"Estimado *{nombre}*, su servicio de internet ha sido *suspendido* por falta de pago.\n\n"
            f"📅 Mes pendiente: *{mes_label}*\n"
            f"💰 Monto: *S/ {monto:.2f}*\n\n"
            f"Para reactivar su servicio:\n"
            f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}\n"
            f"{tiendas}"
            f"📞 *Llamadas:* {settings.PHONE_CONTACTO}\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    # Bloquear en MikroTik después del WhatsApp
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip:
        user = _ros_str(cliente.usuario_pppoe)
        cmds = []
        if cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            lista = _lista_corte(db, cliente.zona_id)
            cmds.append(
                f'/ip firewall address-list add list=\"{lista}\" '
                f'address={ip_safe} comment="{user}"'
            )
        cmds.append(f'/ppp active remove [find name="{user}"]')
        mt_result = _mikrotik_exec(wg_ip, cmds)

    return {"ok": True, "estado": "suspendido", "mikrotik_ok": mt_result["ok"]}


@router.post("/{cliente_id}/cortar")
def cortar_servicio(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cortar_cliente(db, cliente, "Servicio cortado por administrador", current_user.id)


# ── Pausar servicio (a pedido del cliente, no por falta de pago) ─────────────

def _agregar_meses(d: date, meses: int) -> date:
    mes = d.month - 1 + meses
    anio = d.year + mes // 12
    mes = mes % 12 + 1
    dia = min(d.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


@router.post("/{cliente_id}/pausar")
def pausar_servicio(
    cliente_id: int,
    data: schemas.ClientePausarRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """Pausa temporal pedida por el propio cliente (ej. viaje) — distinta de
    un corte por falta de pago: no es morosidad, así que no debe aparecer en
    las listas de cortados/sin pago ni mandar el aviso de corte."""
    if data.meses < 1:
        raise HTTPException(status_code=400, detail="La pausa debe ser de al menos 1 mes")

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    hoy = date.today()
    pausa_hasta = _agregar_meses(hoy, data.meses)
    cliente.estado = models.EstadoCliente.pausado
    cliente.pausa_hasta = pausa_hasta

    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.corte,
        descripcion=f"Servicio pausado a pedido del cliente por {data.meses} mes(es) — hasta {pausa_hasta.strftime('%d/%m/%Y')}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # WhatsApp primero — cliente lo recibe mientras aún tiene internet
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        nombre = cliente.nombre.split()[0]
        msg = (
            f"⏸️ *WISP* — Pausa Confirmada\n\n"
            f"Hola *{nombre}* 👋, confirmamos la pausa temporal de tu servicio como la solicitaste.\n\n"
            f"📅 Hasta: *{pausa_hasta.strftime('%d/%m/%Y')}*\n\n"
            f"Tu servicio se reactivará automáticamente al terminar este periodo, o antes si nos avisas.\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    # Bloquear en MikroTik (misma mecánica que un corte, pero sin el motivo de morosidad)
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip:
        user = _ros_str(cliente.usuario_pppoe)
        cmds = []
        if cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            lista = _lista_corte(db, cliente.zona_id)
            cmds.append(
                f'/ip firewall address-list add list=\"{lista}\" '
                f'address={ip_safe} comment="{user}"'
            )
        cmds.append(f'/ppp active remove [find name="{user}"]')
        mt_result = _mikrotik_exec(wg_ip, cmds)

    return {"ok": True, "estado": "pausado", "pausa_hasta": pausa_hasta.isoformat(), "mikrotik_ok": mt_result["ok"]}


# ── Reactivar servicio + MikroTik ─────────────────────────────────────────────

@router.post("/{cliente_id}/reactivar")
def reactivar_servicio(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    estaba_pausado = cliente.estado == models.EstadoCliente.pausado

    hoy = date.today()
    cliente.estado = models.EstadoCliente.activo
    # Reactivar solo reconecta — NO perdona deuda. Si ya tenía una fecha de
    # vencimiento (aunque esté vencida), se deja tal cual: si seguía
    # atrasado antes del corte, sigue atrasado después de reactivar, y
    # vuelve a aparecer en "Control de clientes" hasta que se le registre
    # el pago de verdad. Solo se pone un valor por defecto si nunca tuvo uno.
    if not cliente.fecha_vencimiento:
        cliente.fecha_vencimiento = hoy + timedelta(days=30)
    debe_pendiente = cliente.fecha_vencimiento <= hoy
    cliente.fecha_ultima_activacion = hoy
    cliente.pausa_hasta = None
    nota_deuda = " — OJO: sigue con un mes pendiente de pago, no se registró ningún pago al reactivar" if debe_pendiente else ""
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.activacion,
        descripcion=f"Servicio reactivado — vencimiento: {cliente.fecha_vencimiento.strftime('%d/%m/%Y')}{nota_deuda}",
        usuario_id=current_user.id,
    )
    db.add(historial)
    db.commit()

    # Desbloquear en MikroTik
    mt_result = {"ok": False}
    wg_ip = _get_wg_ip(db, cliente.zona_id)
    if wg_ip and cliente.ip_estatica:
        ip_safe = _validate_ip(cliente.ip_estatica)
        lista = _lista_corte(db, cliente.zona_id)
        cmd = (
            f'/ip firewall address-list remove '
            f'[find where list=\"{lista}\" address={ip_safe}]'
        )
        mt_result = _mikrotik_exec(wg_ip, [cmd])
    elif wg_ip:
        mt_result = {"ok": True}  # Sin IP estática no hay nada que remover

    # WhatsApp automático
    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        plan = db.query(models.Plan).filter(models.Plan.id == cliente.plan_id).first()
        nombre = cliente.nombre.split()[0]
        if estaba_pausado:
            cierre = "Esperamos que hayas disfrutado tu pausa 🙌"
        elif debe_pendiente:
            cierre = (
                f"⚠️ Aún tienes un pago pendiente — regulariza pronto para evitar un nuevo corte.\n"
                f"📱 *Yape / Plin:* {settings.PHONE_CONTACTO}"
            )
        else:
            cierre = "¡Gracias por su pago! 🙏"
        msg = (
            f"✅ *WISP* — Servicio Reactivado\n\n"
            f"Hola *{nombre}* 🎉, su servicio de internet ha sido *reactivado* exitosamente.\n\n"
            f"📶 Plan: *{plan.nombre if plan else 'Internet'}*\n"
            f"🌐 Ya puede navegar con normalidad.\n\n"
            f"{cierre}\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {"ok": True, "estado": "activo", "mikrotik_ok": mt_result["ok"]}


# ── Compromiso de pago ────────────────────────────────────────────────────────

@router.post("/{cliente_id}/compromiso-pago")
def dar_compromiso_pago(
    cliente_id: int,
    data: schemas.CompromisoPagoRequest,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin, models.RolUsuario.atencion_cliente)),
):
    """El cliente pidió plazo ('espérame hasta el 25'). Mientras el compromiso
    esté vigente, el job de corte automático lo saltea. Si ya estaba cortado,
    se reactiva de una vez — la deuda (fecha_vencimiento) no se toca, solo se
    le da chance de pagar sin que lo corten antes de esa fecha."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if data.fecha_limite <= date.today():
        raise HTTPException(status_code=400, detail="La fecha límite debe ser posterior a hoy")

    estaba_suspendido = cliente.estado == models.EstadoCliente.suspendido
    cliente.compromiso_pago_hasta = data.fecha_limite

    nota_reactivo = " — se reactivó el servicio" if estaba_suspendido else ""
    historial = models.Historial(
        cliente_id=cliente.id,
        tipo=models.TipoHistorial.compromiso_pago,
        descripcion=f"Compromiso de pago hasta el {data.fecha_limite.strftime('%d/%m/%Y')}{nota_reactivo}",
        usuario_id=current_user.id,
    )
    db.add(historial)

    mt_result = {"ok": False}
    if estaba_suspendido:
        cliente.estado = models.EstadoCliente.activo
        cliente.fecha_ultima_activacion = date.today()
        wg_ip = _get_wg_ip(db, cliente.zona_id)
        if wg_ip and cliente.ip_estatica:
            ip_safe = _validate_ip(cliente.ip_estatica)
            lista = _lista_corte(db, cliente.zona_id)
            cmd = f'/ip firewall address-list remove [find where list=\"{lista}\" address={ip_safe}]'
            mt_result = _mikrotik_exec(wg_ip, [cmd])
        elif wg_ip:
            mt_result = {"ok": True}

    db.commit()

    phone = cliente.telefono_whatsapp or cliente.telefono
    if phone:
        nombre = cliente.nombre.split()[0]
        reactivado = "✅ Mientras tanto, su servicio fue reactivado.\n\n" if estaba_suspendido else ""
        msg = (
            f"🤝 *WISP* — Compromiso de Pago\n\n"
            f"Hola *{nombre}*, quedó registrado su compromiso de pago hasta el "
            f"*{data.fecha_limite.strftime('%d/%m/%Y')}*.\n\n"
            f"{reactivado}"
            f"Si no se registra el pago antes de esa fecha, el servicio será suspendido.\n\n"
            f"_WISP — Internet para todos_ 🌐"
        )
        _wa_send(phone, msg)

    return {
        "ok": True,
        "estado": cliente.estado.value,
        "compromiso_pago_hasta": str(cliente.compromiso_pago_hasta),
        "mikrotik_ok": mt_result["ok"],
    }


# ── Líneas del titular ────────────────────────────────────────────────────────

@router.get("/{cliente_id}/lineas")
def lineas_del_titular(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Las otras líneas registradas con el mismo DNI que este cliente.

    Cada línea es una ficha aparte, con su plan, su fecha de pago y su
    recibo — así es como funciona el negocio y así se queda. Lo que falta
    es que, estando en una, se vea que la persona tiene las otras: sin eso,
    quien atiende en caja cobra la que tiene delante y no se entera de que
    la segunda línea venció anteayer.

    Devuelve la lista vacía cuando el cliente tiene una sola línea, que es
    el caso de casi todos.
    """
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not cliente.dni:
        return {"lineas": []}

    hermanas = lineas.lineas_del_dni(db, cliente.dni, excluir_id=cliente_id)
    if not hermanas:
        return {"lineas": []}

    zonas = {
        z.id: z.nombre
        for z in db.query(models.Zona)
        .filter(models.Zona.id.in_([c.zona_id for c in hermanas if c.zona_id]))
        .all()
    }
    planes = {
        p.id: p.nombre
        for p in db.query(models.Plan)
        .filter(models.Plan.id.in_([c.plan_id for c in hermanas if c.plan_id]))
        .all()
    }

    return {
        "lineas": [
            {
                "id": c.id,
                "linea": c.linea,
                "usuario_pppoe": c.usuario_pppoe,
                "estado": c.estado.value if c.estado else None,
                "zona": zonas.get(c.zona_id),
                "plan": planes.get(c.plan_id),
                "direccion": c.direccion,
                "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            }
            for c in hermanas
        ]
    }


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/historial", response_model=List[schemas.HistorialOut])
def get_historial(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    return db.query(models.Historial).filter(
        models.Historial.cliente_id == cliente_id
    ).order_by(models.Historial.creado_en.desc()).all()


# ── Calendario de pagos ───────────────────────────────────────────────────────

@router.get("/{cliente_id}/calendario-pagos")
def get_calendario_pagos(
    cliente_id: int,
    anio: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    hoy = date.today()
    if not anio:
        anio = hoy.year

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    pagos = db.query(models.Pago).filter(
        models.Pago.cliente_id == cliente_id,
        models.Pago.mes_pagado.like(f"{anio}-%"),
    ).all()

    pagos_dict = {p.mes_pagado: p.estado for p in pagos}
    calendario = []
    instalacion = cliente.fecha_instalacion.replace(day=1) if cliente.fecha_instalacion else None

    for mes in range(1, 13):
        mes_str = f"{anio}-{mes:02d}"
        mes_date = date(anio, mes, 1)

        if instalacion and mes_date < instalacion:
            estado = "no_aplica"
        elif mes_date > hoy.replace(day=1):
            estado = "futuro"
        elif mes_str in pagos_dict:
            estado = pagos_dict[mes_str].value if hasattr(pagos_dict[mes_str], 'value') else str(pagos_dict[mes_str])
        else:
            estado = "vencido" if mes_date < hoy.replace(day=1) else "pendiente"

        calendario.append({"mes": mes_str, "estado": estado})

    return calendario


# ── Estado PPPoE en tiempo real ───────────────────────────────────────────────

@router.get("/{cliente_id}/pppoe-status")
def get_pppoe_status(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = db.query(models.Cliente).options(
        joinedload(models.Cliente.zona)
    ).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    zona = cliente.zona
    if not zona or not zona.ip_wireguard:
        return {"conectado": False, "uptime": None, "ip_remota": None, "error": "Zona sin WireGuard"}

    result = _mikrotik_exec(zona.ip_wireguard, [
        f'/ppp active print detail where name="{_ros_str(cliente.usuario_pppoe)}"'
    ])

    if not result["ok"]:
        return {"conectado": False, "uptime": None, "ip_remota": None, "error": "Sin conexión al MikroTik"}

    output = result["results"][0]["out"] if result["results"] else ""
    conectado = bool(output.strip())

    uptime = None
    ip_remota = None
    if conectado:
        m = re.search(r'uptime=(\S+)', output)
        if m:
            uptime = m.group(1)
        m = re.search(r'\baddress=(\S+)', output)
        if m:
            ip_remota = m.group(1)

    return {"conectado": conectado, "uptime": uptime, "ip_remota": ip_remota, "error": None}
