import ipaddress
import logging
import secrets
import string
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..database import get_db
from .. import acceso, mensajeria, models, schemas
from ..config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Freno contra fuerza bruta en el login ────────────────────────────────────
# Sin esto, un atacante puede probar miles de contraseñas por minuto. Se cuenta
# por (IP + usuario) para que el ataque a una cuenta no deje fuera a las demás
# personas que trabajan desde la misma oficina.
#
# Los contadores viven en la tabla freno_login, no en memoria del proceso.
# Hasta el 2026-11-26 eran dos diccionarios de modulo, con dos consecuencias:
# un reinicio del backend los ponia a cero —y el freno de solicitudes de
# codigo es el unico que protege la via de recuperacion de cuenta—, y con
# varios trabajadores de uvicorn el conteo se repartia, de modo que el tope
# real era `tope x procesos`. Hallazgo B-6 de la auditoria.
#
# La base ya estaba ahi: tiene healthcheck, respaldo nocturno y la carga de
# esto son unas pocas filas diminutas por intento de login. Redis haria el
# mismo trabajo mas rapido, pero habria que anadir un servicio al compose,
# vigilarlo y respaldarlo, para un volumen que PostgreSQL ni nota.


_REDES_CONFIABLES: Optional[tuple] = None


def _redes_de_confianza() -> tuple:
    """Las redes de PROXIES_DE_CONFIANZA, ya interpretadas.

    Se calcula una vez y se guarda: esto corre en cada intento de login.
    """
    global _REDES_CONFIABLES
    if _REDES_CONFIABLES is None:
        redes = []
        for trozo in settings.PROXIES_DE_CONFIANZA.split(","):
            trozo = trozo.strip()
            if not trozo:
                continue
            try:
                redes.append(ipaddress.ip_network(trozo, strict=False))
            except ValueError:
                logger.warning(
                    "PROXIES_DE_CONFIANZA: «%s» no es una red válida, se ignora", trozo
                )
        _REDES_CONFIABLES = tuple(redes)
    return _REDES_CONFIABLES


def _ip_del_cliente(request: Request) -> str:
    """La IP real del visitante, y solo si se puede saber de verdad.

    Detrás de Nginx o de Cloudflare la conexión llega del proxy y la IP del
    visitante viene en una cabecera. Pero una cabecera la escribe cualquiera:
    hasta el 2026-11-23 esta función se creía `cf-connecting-ip` sin más, y
    como el freno del login cuenta los fallos por (IP + usuario), bastaba
    cambiar esa cabecera en cada intento para tener siempre un contador nuevo.
    El freno existía y no frenaba nada; se podían probar contraseñas sin
    límite, y la contraseña del cliente son los ocho dígitos de su DNI.

    Ahora la cabecera solo se cree si la conexión viene de un proxy de
    confianza (ver PROXIES_DE_CONFIANZA en app/config.py). Si llega directa
    de internet —por ejemplo al puerto 8000, saltándose Nginx— se usa la IP
    de la conexión, que no se puede falsificar sin controlar el enrutado.
    """
    peer = request.client.host if request.client else None
    if peer:
        try:
            es_proxy = any(
                ipaddress.ip_address(peer) in red for red in _redes_de_confianza()
            )
        except ValueError:
            es_proxy = False
        if es_proxy:
            valor = request.headers.get(settings.IP_CABECERA_CONFIABLE)
            if valor:
                # X-Forwarded-For puede traer varias: la que añadió nuestro
                # proxy es la ÚLTIMA. Las de delante las puso el visitante y
                # no valen nada. (Con x-real-ip, que es el valor por defecto,
                # viene una sola y esto no cambia nada.)
                return valor.split(",")[-1].strip()
    return peer or "desconocida"


def _claves_del_intento(request: Request, usuario: str) -> list[tuple[tuple[str, str], int]]:
    """Los dos contadores que vigilan un intento, con su tope cada uno.

    1. (IP + usuario): el freno normal. Separa por IP para que el ataque a
       una cuenta no deje fuera a la oficina entera.
    2. (cuenta sola): la red de seguridad. El primero no sirve de nada contra
       un ataque repartido entre muchas direcciones —una botnet, o un móvil
       cambiando de red—, porque cada IP nueva estrena contador. Este cuenta
       los fallos de la cuenta vengan de donde vengan.

    El segundo tope va alto (LOGIN_MAX_INTENTOS_CUENTA) a propósito: tiene el
    efecto secundario de que alguien puede dejar una cuenta bloqueada un rato
    a base de fallar a propósito, y eso es molesto. Con 32 fallos en cinco
    minutos nadie llega por error, y un ataque sí.
    """
    quien = (usuario or "").strip().lower()
    return [
        ((_ip_del_cliente(request), quien), settings.LOGIN_MAX_INTENTOS),
        (("*cuenta*", quien), settings.LOGIN_MAX_INTENTOS_CUENTA),
    ]


def _clave_texto(clave: tuple[str, str]) -> str:
    """La clave compuesta, tal como se guarda en la tabla."""
    return f"{clave[0]}|{clave[1]}"


def _fila_del_freno(db: Session, clave: tuple[str, str], crear: bool = False):
    """La fila de esa clave, bloqueada para escritura si hay que tocarla.

    `with_for_update()` es lo que hace que esto siga siendo correcto con varios
    trabajadores de uvicorn: sin el, dos peticiones simultaneas leerian el
    mismo contador y una de las dos escrituras se perderia. SQLite —las
    pruebas— lo ignora, y da igual, porque alli no hay concurrencia real.
    """
    consulta = db.query(models.FrenoLogin).filter(
        models.FrenoLogin.clave == _clave_texto(clave)
    )
    if crear:
        consulta = consulta.with_for_update()
    return consulta.first()


def _podar_freno(db: Session, ahora: float) -> None:
    """Borra las filas que ya no cuentan para nada.

    Sustituye al recorte que hacia el diccionario al pasar de 5000 claves. Se
    llama de vez en cuando desde _anotar_fallo y, a fondo, desde el trabajo
    nocturno del planificador.
    """
    viejo = ahora - max(
        settings.LOGIN_BLOQUEO_SEGUNDOS, settings.LOGIN_VENTANA_SEGUNDOS
    ) - 60
    db.query(models.FrenoLogin).filter(
        models.FrenoLogin.actualizado_en < viejo
    ).delete(synchronize_session=False)


def _segundos_de_espera(db: Session, clave: tuple[str, str], tope: int) -> int:
    """0 si puede intentar; si no, los segundos que le faltan para volver."""
    if tope <= 0:
        return 0
    fila = _fila_del_freno(db, clave)
    if fila is None or not fila.bloqueado_hasta:
        return 0
    ahora = time.time()
    if ahora >= fila.bloqueado_hasta:
        # Cumplio el castigo: vuelve a empezar de cero.
        db.delete(fila)
        db.commit()
        return 0
    return max(int(fila.bloqueado_hasta - ahora), 1)


def _anotar_fallo(db: Session, clave: tuple[str, str], tope: int, _reintento: bool = False) -> None:
    """Apunta un intento fallido y bloquea si se paso del limite.

    Se cuentan los fallos de los ultimos LOGIN_VENTANA_SEGUNDOS; al llegar al
    tope la clave queda bloqueada LOGIN_BLOQUEO_SEGUNDOS enteros contados
    desde ese momento.
    """
    if tope <= 0:
        return
    ahora = time.time()
    fila = _fila_del_freno(db, clave, crear=True)
    if fila is None:
        fila = models.FrenoLogin(
            clave=_clave_texto(clave), momentos=[], actualizado_en=ahora,
        )
        db.add(fila)

    recientes = [
        t for t in (fila.momentos or [])
        if ahora - t < settings.LOGIN_VENTANA_SEGUNDOS
    ]
    recientes.append(ahora)
    # Lista nueva, no .append() sobre la vieja: SQLAlchemy no detecta el cambio
    # dentro de una columna JSON si se muta en el sitio, y la escritura se
    # perderia sin ruido.
    fila.momentos = recientes
    fila.actualizado_en = ahora
    if len(recientes) >= tope:
        fila.bloqueado_hasta = ahora + settings.LOGIN_BLOQUEO_SEGUNDOS

    # Poda oportunista, barata: una de cada tantas escrituras. El trabajo
    # nocturno hace la de verdad.
    if int(ahora) % 20 == 0:
        _podar_freno(db, ahora)

    try:
        db.commit()
    except IntegrityError:
        # Dos peticiones a la vez con la misma clave y sin fila previa: ambas
        # vieron "no existe" y ambas insertaron. with_for_update() no puede
        # bloquear una fila que todavia no esta. Pasa solo en el primer fallo
        # de una clave y solo con varios trabajadores —que es justamente el
        # caso que este cambio viene a soportar—, asi que se reintenta una vez:
        # a la segunda la fila ya existe y se toma el camino normal, con su
        # bloqueo de fila.
        db.rollback()
        if _reintento:
            # Si vuelve a chocar hay algo mas raro, y perder un intento
            # contado es mejor que devolver un 500 a quien esta entrando.
            logger.warning("No se pudo anotar el intento fallido de %s", clave[0])
            return
        _anotar_fallo(db, clave, tope, _reintento=True)


def _limpiar_intentos(db: Session, claves: list[tuple[tuple[str, str], int]]) -> None:
    """Entro bien: se olvidan los fallos de los contadores que lo vigilaban."""
    textos = [_clave_texto(c) for c, _ in claves]
    db.query(models.FrenoLogin).filter(
        models.FrenoLogin.clave.in_(textos)
    ).delete(synchronize_session=False)
    db.commit()


def _anotar_fallos(db: Session, claves: list[tuple[tuple[str, str], int]]) -> None:
    for clave, tope in claves:
        _anotar_fallo(db, clave, tope)


def _frenar_o_seguir(
    db: Session, request: Request, usuario: str,
) -> list[tuple[tuple[str, str], int]]:
    claves = _claves_del_intento(request, usuario)
    espera = max((_segundos_de_espera(db, c, t) for c, t in claves), default=0)
    if espera:
        logger.warning(
            "Login bloqueado por demasiados intentos — ip: %s", claves[0][0][0]
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Demasiados intentos fallidos. Vuelve a intentarlo en {espera // 60 + 1} minuto(s).",
            headers={"Retry-After": str(espera)},
        )
    return claves


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def rol_de_la_cuenta(db: Session, usuario: models.Usuario) -> Optional[models.Rol]:
    """El rol asignado; una cuenta sin asignar usa el de su tipo de cuenta."""
    consulta = db.query(models.Rol)
    if usuario.rol_id is not None:
        return consulta.filter(models.Rol.id == usuario.rol_id).first()
    return consulta.filter(models.Rol.clave == usuario.rol.value).first()


def modulos_del_rol(db: Session, rol_id: int) -> set[str]:
    filas = (
        db.query(models.Modulo.clave)
        .join(models.RolModulo, models.RolModulo.modulo_id == models.Modulo.id)
        .filter(models.RolModulo.rol_id == rol_id, models.Modulo.activo.is_(True))
        .all()
    )
    return {clave for clave, in filas}


def _sin_permiso() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tiene permisos para esta acción",
    )


def usuario_del_token(token: str, db: Session) -> models.Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if user is None or not user.activo:
        raise credentials_exception
    return user


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = usuario_del_token(token, db)
    ruta = getattr(request.scope.get("route"), "path", "")
    if (request.method, ruta) in acceso.LECTURAS:
        rol = rol_de_la_cuenta(db, user)
        if rol is not None and not acceso.permite_lectura(
            rol.es_superadmin, modulos_del_rol(db, rol.id), request.method, ruta,
        ):
            raise _sin_permiso()
    return user


def require_roles(*roles: models.RolUsuario):
    """Dependencia que exige que el usuario autenticado tenga uno de los roles dados.
    Uso: current_user: models.Usuario = Depends(require_roles(RolUsuario.admin))

    Hasta el 2026-11-10 existía `super_admin`, que pasaba cualquier chequeo
    que incluyera `admin`. Se eliminó junto con `subadmin`: ahora `admin` es
    el rol más alto y no hay herencia entre roles, cada endpoint lista
    exactamente quién entra. Los módulos del rol se suman a esa lista según
    las reglas de app/acceso.py."""
    def dependency(
        request: Request,
        current_user: models.Usuario = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> models.Usuario:
        permitidos = {r.value for r in roles}
        rol = rol_de_la_cuenta(db, current_user)
        if rol is None:
            permitido = current_user.rol.value in permitidos
        else:
            permitido = acceso.permite_con_roles(
                current_user.rol.value,
                rol.es_superadmin,
                modulos_del_rol(db, rol.id),
                permitidos,
                request.method,
                getattr(request.scope.get("route"), "path", ""),
            )
        if not permitido:
            raise _sin_permiso()
        return current_user
    return dependency


def _resolver_rol(
    db: Session,
    rol_id: Optional[int],
    tipo: Optional[models.RolUsuario],
) -> tuple[models.RolUsuario, Optional[int]]:
    """El tipo de cuenta y el rol que le corresponden a un usuario."""
    if rol_id is None:
        rol = db.query(models.Rol).filter(models.Rol.clave == tipo.value).first()
        return tipo, rol.id if rol else None
    rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    if rol is None or rol.perfil_base is None:
        raise HTTPException(status_code=400, detail="Ese rol no se puede asignar a una cuenta del personal")
    return models.RolUsuario(rol.perfil_base), rol.id


def zonas_asignadas(db: Session, usuario: models.Usuario) -> list[int]:
    """IDs de zona asignadas a un técnico. Vacío si el usuario no es técnico
    (no se usa para filtrar en ese caso — el admin ve todas las zonas)."""
    return [
        tz.zona_id for tz in
        db.query(models.TecnicoZona).filter(models.TecnicoZona.tecnico_id == usuario.id).all()
    ]


def get_current_cliente(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependencia para endpoints exclusivos de clientes en la app móvil."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        role: str = payload.get("role")
        cliente_id: int = payload.get("cliente_id")
        if role != "cliente" or cliente_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise credentials_exception
    return cliente


@router.post("/login", response_model=schemas.Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    clave = _frenar_o_seguir(db, request, form_data.username)
    user = db.query(models.Usuario).filter(models.Usuario.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        _anotar_fallos(db, clave)
        logger.warning("Login fallido — ip: %s", clave[0])
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if not user.activo:
        _anotar_fallos(db, clave)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta desactivada")
    _limpiar_intentos(db, clave)
    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


def _cliente_por_usuario(db: Session, usuario: str) -> Optional[models.Cliente]:
    """La ficha de cliente que corresponde a un usuario escrito a mano.

    Quien tiene más de una línea puede entrar a cualquiera de ellas
    escribiendo su usuario completo — 70111222b para la segunda —, y con el
    DNI pelado entra a la primera. Antes, con el DNI repetido en la base, la
    consulta devolvía una línea cualquiera: el mismo cliente podía ver un día
    una y al día siguiente otra, sin tocar nada.
    """
    return db.query(models.Cliente).filter(
        or_(
            models.Cliente.dni == usuario,
            models.Cliente.usuario_pppoe == usuario,
        )
    ).order_by(models.Cliente.linea).first()


def _datos_publicos_del_cliente(cliente: models.Cliente) -> set[str]:
    """Lo que de este cliente NO puede valer como contraseña.

    Su documento está en el recibo, en el contrato y en cualquier foto del
    DNI; su teléfono, en la factura. No son secretos y por tanto no sirven
    para proteger nada.
    """
    posibles = (
        cliente.dni, cliente.ruc, cliente.telefono, cliente.telefono_whatsapp,
    )
    return {(p or "").strip() for p in posibles if (p or "").strip()}


@router.post("/cliente/login", response_model=schemas.ClienteTokenResponse)
def cliente_login(request: Request, data: schemas.ClienteLoginRequest, db: Session = Depends(get_db)):
    """Login para clientes en la app móvil, contra la contraseña que el
    cliente eligió.

    Hasta el 2026-11-23, mientras el cliente no cambiara su contraseña, ésta
    era su propio DNI. Eso se eliminó: ocho dígitos que están en su recibo no
    son una credencial, y cualquiera que los tuviera entraba a su cuenta y
    veía su dirección, su teléfono y su historial de pagos. Un cliente que
    todavía no tiene contraseña propia no entra por aquí: pide un código a su
    WhatsApp (ver /cliente/solicitar-codigo) y con él elige una.
    """
    usuario = data.usuario.strip()
    clave_freno = _frenar_o_seguir(db, request, f"cliente:{usuario}")
    cliente = _cliente_por_usuario(db, usuario)

    if not cliente:
        _anotar_fallos(db, clave_freno)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrecta",
        )

    if not cliente.pin_app:
        # No es un fallo de contraseña: es una cuenta que todavía no tiene.
        # Se responde 409 y no 401 para que la app sepa distinguirlo y lleve a
        # la persona a pedir su código en vez de decirle que se equivocó.
        # No se anota como intento fallido: no hay nada que adivinar aquí.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Todavía no tienes una contraseña. Pide tu código para crearla.",
        )

    if not pwd_context.verify(data.pin.strip(), cliente.pin_app):
        _anotar_fallos(db, clave_freno)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrecta",
        )
    _limpiar_intentos(db, clave_freno)

    if cliente.estado == models.EstadoCliente.anulado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta no disponible",
        )

    token = create_access_token({
        "sub": f"cliente:{cliente.id}",
        "role": "cliente",
        "cliente_id": cliente.id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "cliente",
        "cliente_id": cliente.id,
        "nombre": cliente.nombre,
        # Caso heredado: hasta hoy /cliente/cambiar-pin aceptaba que la
        # contraseña nueva fuera el propio DNI, así que hay clientes con una
        # contraseña propia que no protege nada. El código ya no lo permite,
        # pero esas cuentas siguen ahí: se detectan aquí, que es el único
        # momento en que se tiene la contraseña en claro para compararla, y la
        # app los manda a cambiarla antes de mostrarles nada.
        "debe_cambiar_pin": data.pin.strip() in _datos_publicos_del_cliente(cliente),
    }


# ── Alta y recuperación de la contraseña del cliente ─────────────────────────
#
# El documento del cliente no abre nada por sí solo. Para estrenar su cuenta
# —o si olvidó su contraseña— escribe su documento y el sistema le manda un
# código al WhatsApp que YA tiene registrado en su ficha. Hacen falta las dos
# cosas: saber el documento y tener el teléfono.

_CODIGO_VALIDO_MINUTOS = 10
_CODIGO_MAX_INTENTOS = 5


def _generar_codigo() -> str:
    """Seis dígitos de secrets, no de random: random es predecible."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _ya_vencio(expira_en: datetime) -> bool:
    """¿Pasó ya esa fecha? Comparando siempre en UTC.

    `DateTime(timezone=True)` NO garantiza que la fecha vuelva con zona: eso
    depende del motor. PostgreSQL la devuelve con tzinfo=UTC, pero SQLite la
    guarda como texto sin zona y la devuelve «naive». Comparar una con zona
    contra otra sin ella es un TypeError, así que la pantalla de canje del
    código se caía con un 500 en cualquier instalación sobre SQLite — y en
    las pruebas, que usan SQLite en memoria.

    Se normaliza lo que venga: sin zona, se interpreta como UTC, que es lo que
    se escribió. Así el mismo código vale para los dos motores y no depende de
    un detalle del driver.
    """
    if expira_en.tzinfo is None:
        expira_en = expira_en.replace(tzinfo=timezone.utc)
    return expira_en <= datetime.now(timezone.utc)


@router.post("/cliente/solicitar-codigo", response_model=schemas.SolicitarCodigoResponse)
def solicitar_codigo_cliente(
    request: Request,
    data: schemas.SolicitarCodigoRequest,
    db: Session = Depends(get_db),
):
    """Manda al WhatsApp del cliente un código de un solo uso.

    La respuesta es siempre la misma forma, haya cliente o no: así este
    endpoint no se convierte en un comprobador de «¿este DNI es cliente de
    la empresa?». Cuando sí hay cliente se devuelve su número tapado
    (9****7069) para que la persona sepa en qué teléfono mirar.

    Pasa por el mismo freno que el login, con una clave propia: sin eso
    alguien podría pedir códigos en bucle y llenar de mensajes el WhatsApp de
    un cliente, además de gastar el número de la empresa.
    """
    usuario = data.usuario.strip()
    clave_freno = _frenar_o_seguir(db, request, f"codigo:{usuario}")
    _anotar_fallos(db, clave_freno)   # cada solicitud cuenta, acertada o no

    generico = (
        "Si el documento está registrado, en unos segundos llegará un código "
        "al WhatsApp de la cuenta."
    )
    cliente = _cliente_por_usuario(db, usuario)
    if not cliente or cliente.estado == models.EstadoCliente.anulado:
        return {"enviado": True, "telefono": None, "mensaje": generico}

    telefono = mensajeria.telefono_de(cliente)
    if not telefono:
        # Sin teléfono no hay a dónde mandarlo. Se dice, porque aquí callar no
        # protege nada y deja a la persona esperando un mensaje que no llega.
        return {
            "enviado": False,
            "telefono": None,
            "mensaje": "Tu cuenta no tiene un número de WhatsApp registrado. "
                       "Acércate a la oficina para que te demos acceso.",
        }

    codigo = _generar_codigo()
    ahora = datetime.now(timezone.utc)
    fila = (
        db.query(models.CodigoAccesoCliente)
        .filter(models.CodigoAccesoCliente.cliente_id == cliente.id)
        .first()
    )
    if fila is None:
        fila = models.CodigoAccesoCliente(cliente_id=cliente.id)
        db.add(fila)
    # Pedir uno nuevo invalida el anterior y reinicia los intentos.
    fila.codigo_hash = get_password_hash(codigo)
    fila.expira_en = ahora + timedelta(minutes=_CODIGO_VALIDO_MINUTOS)
    fila.intentos = 0
    db.commit()

    nombre = (cliente.nombre or "").split()[0] if cliente.nombre else ""
    ok, detalle = mensajeria.enviar_texto(
        telefono,
        f"Hola{' ' + nombre if nombre else ''}, tu código para entrar a la app de "
        f"{settings.EMPRESA_NOMBRE} es *{codigo}*.\n\n"
        f"Vence en {_CODIGO_VALIDO_MINUTOS} minutos y es de un solo uso. "
        "Si no lo pediste tú, no lo compartas con nadie.",
    )
    if not ok:
        # El código queda guardado: el bot puede estar caído un momento y la
        # persona reintentar. Lo que no se hace es mentir diciendo que se envió.
        logger.warning("No se pudo enviar el código de acceso a %s: %s",
                       mensajeria.oculta(telefono), detalle)
        return {
            "enviado": False,
            "telefono": mensajeria.oculta(telefono),
            "mensaje": "No se pudo enviar el mensaje en este momento. "
                       "Vuelve a intentarlo en un minuto.",
        }

    logger.info("Código de acceso enviado — cliente id %d, a %s",
                cliente.id, mensajeria.oculta(telefono))
    return {
        "enviado": True,
        "telefono": mensajeria.oculta(telefono),
        "mensaje": generico,
    }


@router.post("/cliente/verificar-codigo", response_model=schemas.ClienteTokenResponse)
def verificar_codigo_cliente(
    request: Request,
    data: schemas.VerificarCodigoRequest,
    db: Session = Depends(get_db),
):
    """Comprueba el código, le pone al cliente la contraseña que eligió y lo
    deja dentro."""
    usuario = data.usuario.strip()
    clave_freno = _frenar_o_seguir(db, request, f"codigo:{usuario}")

    # El mismo mensaje para «no existe», «caducó» y «no es el código»: cada
    # distinción es una pista para quien está probando.
    invalido = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="El código no es válido o ya venció. Pide uno nuevo.",
    )

    cliente = _cliente_por_usuario(db, usuario)
    if not cliente or cliente.estado == models.EstadoCliente.anulado:
        _anotar_fallos(db, clave_freno)
        raise invalido

    nueva = data.pin_nuevo.strip()
    if len(nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 8 caracteres",
        )
    if nueva in _datos_publicos_del_cliente(cliente):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esa contraseña no se puede usar: es un dato que aparece en tus "
                   "recibos y cualquiera que lo vea podría entrar. Elige otra.",
        )

    fila = (
        db.query(models.CodigoAccesoCliente)
        .filter(models.CodigoAccesoCliente.cliente_id == cliente.id)
        .first()
    )
    if fila is None:
        _anotar_fallos(db, clave_freno)
        raise invalido

    if _ya_vencio(fila.expira_en) or fila.intentos >= _CODIGO_MAX_INTENTOS:
        db.delete(fila)
        db.commit()
        _anotar_fallos(db, clave_freno)
        raise invalido

    if not pwd_context.verify(data.codigo.strip(), fila.codigo_hash):
        fila.intentos += 1
        db.commit()
        _anotar_fallos(db, clave_freno)
        raise invalido

    # Acertó: la contraseña es suya y el código se gasta.
    cliente.pin_app = get_password_hash(nueva)
    db.delete(fila)
    db.commit()
    _limpiar_intentos(db, clave_freno)

    logger.info("Cliente id %d estrenó su contraseña con un código de WhatsApp", cliente.id)
    token = create_access_token({
        "sub": f"cliente:{cliente.id}",
        "role": "cliente",
        "cliente_id": cliente.id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "cliente",
        "cliente_id": cliente.id,
        "nombre": cliente.nombre,
        "debe_cambiar_pin": False,
    }


@router.get("/me", response_model=schemas.UsuarioOut)
def get_me(current_user: models.Usuario = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=schemas.UsuarioOut)
def update_me(
    data: schemas.UsuarioSelfUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Autoservicio: cualquier usuario autenticado puede actualizar su propio
    teléfono/dirección — son datos de contacto, la persona misma es quien
    sabe que cambiaron. Nombre, DNI, fecha de ingreso, rol y activo quedan
    fuera a propósito — eso lo controla solo el administrador."""
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/password")
def change_password(
    data: schemas.ChangePassword,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not verify_password(data.password_actual, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    if len(data.password_nueva) < 8:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe tener al menos 8 caracteres")
    current_user.hashed_password = get_password_hash(data.password_nueva)
    db.commit()
    return {"ok": True}


@router.get("/usuarios", response_model=list[schemas.UsuarioOut])
def list_usuarios(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    return db.query(models.Usuario).order_by(models.Usuario.nombre).all()


@router.post("/usuarios", response_model=schemas.UsuarioOut)
def create_usuario(
    data: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if db.query(models.Usuario).filter(models.Usuario.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    tipo, rol_id = _resolver_rol(db, data.rol_id, data.rol)
    user = models.Usuario(
        nombre=data.nombre,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        rol=tipo,
        rol_id=rol_id,
        telefono=data.telefono,
        dni=data.dni,
        direccion=data.direccion,
        fecha_ingreso=data.fecha_ingreso,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def update_usuario(
    usuario_id: int,
    data: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Editar nombre/rol o activar/desactivar un usuario (técnico, vendedor, etc.).
    Desactivar corta el acceso al instante — get_current_user revisa `activo`
    contra la BD en cada request, no depende de que expire el token."""
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    cambios = data.model_dump(exclude_unset=True)
    rol_id, tipo = cambios.pop("rol_id", None), cambios.pop("rol", None)
    if rol_id is not None or tipo is not None:
        user.rol, user.rol_id = _resolver_rol(db, rol_id, tipo)
    for key, value in cambios.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.put("/usuarios/{usuario_id}/password")
def restablecer_password(
    usuario_id: int,
    data: schemas.ResetPassword,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Le pone una contraseña nueva a otro usuario.

    Hace falta para cuando alguien del equipo olvida la suya: sin esto la
    única salida era tocar la base de datos a mano, o que la gente se preste
    cuentas entre sí, que es peor. El administrador NO puede ver la
    contraseña anterior — solo la reemplaza.
    """
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if len(data.password_nueva) < 8:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe tener al menos 8 caracteres")
    user.hashed_password = get_password_hash(data.password_nueva)
    db.commit()
    # Queda constancia de quién restableció a quién, sin la contraseña.
    logger.warning(
        "Contraseña restablecida — usuario destino id %d, hecho por %s (id %d)",
        user.id, current_user.email, current_user.id,
    )
    return {"ok": True}


@router.delete("/usuarios/{usuario_id}")
def delete_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Solo se puede borrar un usuario que de verdad nunca hizo nada — si
    tiene clientes, pagos, averías, etc. a su nombre, ese historial vale
    demasiado para perderlo por error. Para esos casos basta con
    desactivarlo (el switch de 'Activo'), nunca borrarlo."""
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")

    referencias = []

    def contar(query, etiqueta):
        n = query.count()
        if n:
            referencias.append(f"{n} {etiqueta}")

    contar(db.query(models.Cliente).filter(models.Cliente.vendedor_id == usuario_id), "cliente(s) registrados")
    contar(db.query(models.Cliente).filter(models.Cliente.tecnico_instalador_id == usuario_id), "instalación(es) realizadas")
    contar(db.query(models.Cliente).filter(models.Cliente.aprobado_por_id == usuario_id), "aprobación(es) de clientes")
    contar(db.query(models.Pago).filter(models.Pago.registrado_por == usuario_id), "pago(s) registrados")
    contar(db.query(models.Averia).filter(models.Averia.tecnico_asignado_id == usuario_id), "avería(s) atendidas")
    contar(db.query(models.OrdenRetiro).filter(models.OrdenRetiro.tecnico_asignado_id == usuario_id), "retiro(s) de equipo")
    contar(db.query(models.Historial).filter(models.Historial.usuario_id == usuario_id), "registro(s) de historial")
    contar(db.query(models.Gasto).filter(models.Gasto.registrado_por == usuario_id), "gasto(s) registrados")
    contar(db.query(models.Onu).filter(models.Onu.tecnico_id == usuario_id), "ONU(s) en su inventario")
    contar(db.query(models.MensajeMasivo).filter(models.MensajeMasivo.creado_por_id == usuario_id), "mensaje(s) masivo(s) enviados")
    contar(db.query(models.Evidencia).filter(models.Evidencia.subido_por_id == usuario_id), "evidencia(s) subidas")

    if referencias:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar — tiene historial real asociado: " + ", ".join(referencias) +
            ". Si ya no trabaja aquí, desactívalo en vez de eliminarlo.",
        )

    db.query(models.TecnicoZona).filter(models.TecnicoZona.tecnico_id == usuario_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}
