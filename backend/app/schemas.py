import re
from pydantic import BaseModel, EmailStr, Field, StrictBool, field_validator, model_validator
from typing import Literal, Optional, List
from datetime import date, datetime
from .models import (
    EstadoCliente, EstadoPago, TipoHistorial, TipoConexion, EstadoEquipo,
    RolUsuario, EstadoBorne, EstadoOnu, WifiVersion, EstadoOrdenRetiro,
    EstadoAveria, TipoEvidencia, EstadoMensajeMasivo, TipoDocumento,
)

_PPPOE_RE = re.compile(r'^[a-zA-Z0-9._@-]{1,100}$')
_IPV4_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
_DNI_RE = re.compile(r'^\d{8}$')
_RUC_RE = re.compile(r'^(10|15|17|20)\d{9}$')


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UsuarioBase(BaseModel):
    nombre: str
    # Se exige formato de correo a propósito. Por decisión de la empresa las
    # cuentas del personal son `nombre.apellido@wispfibra.com`, aunque esos
    # buzones no existan todavía: así no chocan con las cuentas de los
    # clientes, y el día que se contrate correo real en el dominio ya
    # coinciden. Validarlo evita el error que no tiene arreglo: un
    # `cristian@wispfibra` sin el .com quedaría como una cuenta con la que
    # nadie puede entrar, y el usuario no se puede editar después.
    email: EmailStr
    rol: RolUsuario

class UsuarioCreate(UsuarioBase):
    # Se indica uno de los dos: rol_id es el rol elegido en pantalla.
    rol: Optional[RolUsuario] = None
    rol_id: Optional[int] = None
    password: str
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    fecha_ingreso: Optional[date] = None

    @model_validator(mode="after")
    def exige_un_rol(self):
        if self.rol is None and self.rol_id is None:
            raise ValueError("Selecciona un rol")
        return self

class UsuarioOut(UsuarioBase):
    id: int
    rol_id: Optional[int] = None
    rol_nombre: Optional[str] = None
    activo: bool
    creado_en: datetime
    # Al LEER se relaja: la cuenta `admin` que crea el sistema en el primer
    # arranque no tiene formato de correo, y sin esto la lista de usuarios
    # reventaría al devolverla.
    email: str
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    fecha_ingreso: Optional[date] = None
    class Config:
        from_attributes = True

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[RolUsuario] = None
    rol_id: Optional[int] = None
    activo: Optional[bool] = None
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    fecha_ingreso: Optional[date] = None

class ChangePassword(BaseModel):
    password_actual: str
    password_nueva: str

class ResetPassword(BaseModel):
    """Restablecimiento hecho por un administrador: no pide la anterior
    porque justamente el caso de uso es que el usuario la olvidó."""
    password_nueva: str

class UsuarioSelfUpdate(BaseModel):
    """Lo único que un usuario puede cambiar de sí mismo — ver update_me()."""
    telefono: Optional[str] = None
    direccion: Optional[str] = None


# ── Plan ──────────────────────────────────────────────────────────────────────

class DetalleMontoItem(BaseModel):
    concepto: str
    monto: float

class PlanBase(BaseModel):
    codigo: str
    nombre: str
    bajada_mbps: int
    subida_mbps: int
    precio: float
    incluye_tv: bool = False
    tv_incluidas: int = 0
    precio_tv_adicional: Optional[float] = None
    descripcion: Optional[str] = None
    tipo_conexion: TipoConexion = TipoConexion.fibra_optica
    costo_proveedor: Optional[float] = None

class PlanCreate(PlanBase):
    pass

class PlanOut(PlanBase):
    id: int
    activo: bool
    class Config:
        from_attributes = True


# ── Zona ──────────────────────────────────────────────────────────────────────

class ZonaBase(BaseModel):
    """Campos comunes de una zona. Ojo: la contraseña del MikroTik NO está
    aquí a propósito — vive solo en los esquemas de entrada, para que no
    pueda colarse en una respuesta por heredarla sin darse cuenta."""
    nombre: str
    # Opcional: la zona se crea primero y el túnel se añade después,
    # cuando el router ya está instalado y conectado.
    ip_wireguard: Optional[str] = None
    ip_lan: Optional[str] = None
    usuario_mikrotik: Optional[str] = None
    wg_public_key: Optional[str] = None
    router_mikrotik: Optional[str] = None
    ip_router: Optional[str] = None
    # Nombre del pool de direcciones del MikroTik del que salen las IP de los
    # clientes. Sin esto el sistema no puede crear perfiles que den servicio.
    pool_pppoe: Optional[str] = None
    # Lista del firewall donde el router mete a los cortados. Vacío = el valor
    # por defecto del sistema ("CORTE MOROSO").
    lista_corte: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    tiendas_pago: Optional[str] = None
    # Costo de instalación que cobra esta zona una sola vez. 0 = no cobra.
    costo_instalacion: float = 0

# ── Campos del túnel: se comprueban al entrar ────────────────────────────────
#
# ip_wireguard y wg_public_key acaban dentro de la línea de comando que
# configura el peer en la VPS (app/routers/zonas.py). Ahí ya se validan antes
# de armar el comando, que es donde de verdad importa; esto es el segundo
# cerrojo, y además hace que un dato mal escrito se rechace al guardarlo en
# vez de reventar más tarde, cuando alguien intente levantar el túnel.
#
# Va solo en los esquemas de ENTRADA, nunca en ZonaBase: si estuviera en la
# base, ZonaOut lo heredaría y una zona que ya tenga un valor raro guardado
# de antes dejaría de poder leerse.
_WG_PUBKEY_RE = re.compile(r'^[A-Za-z0-9+/]{43}=$')


def _valida_ip_wireguard(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not _IPV4_RE.match(v):
        raise ValueError('La IP de WireGuard debe ser una dirección IPv4 válida (ej. 10.10.0.2)')
    return v


def _valida_wg_pubkey(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not _WG_PUBKEY_RE.match(v):
        raise ValueError(
            'La clave pública de WireGuard son 44 caracteres en base64, los que '
            'imprime `wg genkey | wg pubkey`'
        )
    return v


class ZonaCreate(ZonaBase):
    # Solo de entrada: se guarda en el servidor y nunca se devuelve.
    password_mikrotik: Optional[str] = None

    @field_validator('ip_wireguard')
    @classmethod
    def validate_ip_wireguard(cls, v: Optional[str]) -> Optional[str]:
        return _valida_ip_wireguard(v)

    @field_validator('wg_public_key')
    @classmethod
    def validate_wg_public_key(cls, v: Optional[str]) -> Optional[str]:
        return _valida_wg_pubkey(v)

class ZonaOut(ZonaBase):
    id: int
    activo: bool
    creado_en: datetime
    total_clientes: Optional[int] = 0
    clientes_activos: Optional[int] = 0
    # Si el router tiene clave configurada, sin decir cuál.
    tiene_password_mikrotik: bool = False

    class Config:
        from_attributes = True

class ZonaDatosUpdate(BaseModel):
    """Datos que puede corregir el admin del negocio: nombre, descripción,
    tiendas de pago, ubicación del servidor y las credenciales del MikroTik
    (usuario/clave/IP LAN/router) — es su propio router, lo administra él.
    Lo que NUNCA toca es el túnel WireGuard (ip_wireguard/wg_public_key) ni
    la terminal SSH: esa es la conexión al hub central, y si algo se rompe
    ahí se cae el acceso remoto a toda la zona, no solo a un router."""
    nombre: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    tiendas_pago: Optional[str] = None
    ip_lan: Optional[str] = None
    usuario_mikrotik: Optional[str] = None
    password_mikrotik: Optional[str] = None
    # Costo de instalación de la zona (negocio). 0 = no cobra instalación.
    costo_instalacion: Optional[float] = None

    @field_validator('costo_instalacion')
    @classmethod
    def _costo_no_negativo(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError('El costo de instalación no puede ser negativo')
        return v
    router_mikrotik: Optional[str] = None
    ip_router: Optional[str] = None
    pool_pppoe: Optional[str] = None
    lista_corte: Optional[str] = None
    # El túnel se configura cuando el router ya está en sitio, así que se
    # puede completar después de haber creado la zona.
    ip_wireguard: Optional[str] = None
    wg_public_key: Optional[str] = None

    @field_validator('ip_wireguard')
    @classmethod
    def validate_ip_wireguard(cls, v: Optional[str]) -> Optional[str]:
        return _valida_ip_wireguard(v)

    @field_validator('wg_public_key')
    @classmethod
    def validate_wg_public_key(cls, v: Optional[str]) -> Optional[str]:
        return _valida_wg_pubkey(v)

class TecnicoZonaAsignar(BaseModel):
    tecnico_id: int
    zona_id: int

class TecnicoZonaOut(BaseModel):
    id: int
    tecnico_id: int
    zona_id: int
    class Config:
        from_attributes = True


# ── Cliente ───────────────────────────────────────────────────────────────────
# El registro inicial (vendedor/técnico) sólo captura datos del prospecto.
# usuario_pppoe/password_pppoe se derivan del DNI en el servidor — no los
# manda el cliente. estado/fecha_instalacion los controla el flujo de
# aprobación + instalación, no se pueden setear al crear.

class ClienteCreate(BaseModel):
    # Razón social cuando el cliente es empresa
    nombre: str
    tipo_documento: TipoDocumento = TipoDocumento.dni
    # El DNI del que salen las credenciales PPPoE: del titular si es persona,
    # del responsable si es empresa.
    dni: str
    # Solo empresas
    ruc: Optional[str] = None
    responsable_nombre: Optional[str] = None
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    # Los satelitales no llevan zona; fibra e inalámbrico sí (se valida abajo)
    zona_id: Optional[int] = None
    plan_id: int
    cantidad_tv: int = 0
    tipo_conexion: TipoConexion = TipoConexion.fibra_optica
    notas: Optional[str] = None
    # El cliente ya estaba conectado antes de que existiera este sistema. Lo
    # marca quien lo registra desde el panel, y con eso la instalacion acepta
    # cerrarse sin caja, borne ni equipo, que de el no hay.
    migrado: bool = False
    # Se envía en True cuando quien registra YA SABE que ese DNI tiene
    # servicio y aun así quiere dar de alta otra línea para la misma
    # persona. En False —lo normal— un DNI repetido se rechaza, que es la
    # red que protege de registrar dos veces al mismo cliente.
    linea_adicional: bool = False

    @field_validator('dni')
    @classmethod
    def validate_dni(cls, v: str) -> str:
        if not _DNI_RE.match(v):
            raise ValueError('DNI debe tener exactamente 8 dígitos')
        return v

    @field_validator('ruc')
    @classmethod
    def validate_ruc(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == '':
            return None
        if not _RUC_RE.match(v):
            raise ValueError('RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20')
        return v

    @model_validator(mode='after')
    def validar_zona(self):
        """La zona es obligatoria salvo para satelitales, que no pasan por
        ningún MikroTik ni caja NAP y por eso no pertenecen a una zona."""
        if self.tipo_conexion != TipoConexion.satelital and self.zona_id is None:
            raise ValueError('Selecciona la zona del cliente')
        if self.tipo_conexion == TipoConexion.satelital:
            self.zona_id = None
        return self

    @model_validator(mode='after')
    def validar_empresa(self):
        """Una empresa necesita RUC y responsable; una persona no los lleva."""
        if self.tipo_documento == TipoDocumento.ruc:
            if not self.ruc:
                raise ValueError('Para un cliente empresa el RUC es obligatorio')
            if not (self.responsable_nombre or '').strip():
                raise ValueError('Indica el nombre del responsable de la empresa')
        else:
            self.ruc = None
            self.responsable_nombre = None
        return self


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None
    responsable_nombre: Optional[str] = None
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    password_pppoe: Optional[str] = None
    ip_estatica: Optional[str] = None
    pin_app: Optional[str] = None
    zona_id: Optional[int] = None
    plan_id: Optional[int] = None
    cantidad_tv: Optional[int] = None
    fecha_vencimiento: Optional[date] = None
    # Solo un administrador puede tocarlas, y cada cambio queda en el
    # historial del cliente. Hacen falta para migrar: los datos vienen
    # copiados del sistema viejo y ahi se cometen erratas.
    fecha_instalacion: Optional[date] = None
    fecha_ultima_activacion: Optional[date] = None
    tipo_conexion: Optional[TipoConexion] = None
    # Se puede marcar despues de registrarlo: los clientes que ya estaban en
    # el sistema antes de que existiera la marca tambien vienen del mundo
    # viejo y hay que poder reconocerlos.
    migrado: Optional[bool] = None
    notas: Optional[str] = None
    cuenta_starlink_email: Optional[str] = None
    estado_equipo: Optional[EstadoEquipo] = None
    equipo_marca: Optional[str] = None
    equipo_modelo: Optional[str] = None
    equipo_serial: Optional[str] = None
    equipo_valor: Optional[float] = None
    equipo_fecha_entrega: Optional[date] = None

    @field_validator('ip_estatica')
    @classmethod
    def validate_ip_estatica(cls, v: Optional[str]) -> Optional[str]:
        if v and not _IPV4_RE.match(v):
            raise ValueError('Debe ser una dirección IPv4 válida')
        return v


class ClienteAprobarRequest(BaseModel):
    """La IP fija que se le asigna al cliente al aprobar la instalacion.

    Es opcional: si no viene, el cliente queda sin IP fija y el router le da
    una del pool. Con IP fija el corte por lista del firewall es fiable;
    sin ella, no.
    """
    ip_estatica: Optional[str] = None

    @field_validator('ip_estatica')
    @classmethod
    def validate_ip_estatica(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                return None
            if not _IPV4_RE.match(v):
                raise ValueError('Debe ser una direccion IPv4 valida')
        return v


class ClienteRechazarRequest(BaseModel):
    motivo: str

class ClienteNoInstalarRequest(BaseModel):
    motivo: str

class ClientePausarRequest(BaseModel):
    meses: int

class CompromisoPagoRequest(BaseModel):
    fecha_limite: date

class ClienteInstalarRequest(BaseModel):
    # Opcionales por dos razones distintas. Un cliente inalambrico va por
    # antena y PPPoE: no tiene fibra, ni caja NAP, ni ONU, y no hay ningun
    # numero valido que ponerle. Un cliente migrado si la tiene, pero nadie
    # la anoto cuando se instalo hace anos, y exigirsela al tecnico seria
    # pedirle que invente el dato.
    #
    # Para todos los demas siguen siendo obligatorios, y eso lo decide el
    # endpoint mirando la ficha del cliente, que es quien sabe cual es cual.
    # Opcional tampoco es prohibido: lo que el tecnico si traiga se guarda.
    caja_nap_id: Optional[int] = None
    numero_borne: Optional[int] = None
    onu_id: Optional[int] = None
    metros_cable: Optional[float] = None
    potencia_optica_dbm: Optional[float] = None
    codigo_precinto: Optional[str] = None
    # El dia en que el servicio quedo funcionando, que no siempre es hoy: se
    # tiende el cable un martes, la caja no tiene potencia y queda andando el
    # jueves. De esta fecha sale el dia de pago del cliente, asi que la pone
    # quien estuvo ahi. Si no viene, es hoy.
    fecha_activacion: Optional[date] = None


class ClienteDatosInstalacionRequest(BaseModel):
    """Completar o corregir la planta de un cliente que ya esta instalado.

    Es lo que le faltaba al sistema para que la migracion no fuera un callejon
    sin salida: el flujo de instalacion solo corre sobre clientes "aprobados",
    y uno migrado ya quedo activo. Sin esto, el dia que el tecnico por fin ve
    de que caja cuelga, no habia donde apuntarlo.

    Todo opcional: se manda lo que se sepa. Lo que no venga se queda como
    estaba, no se borra.
    """
    # La caja y el borne van juntos: un borne sin su caja no identifica nada,
    # el numero 3 existe en todas.
    caja_nap_id: Optional[int] = None
    numero_borne: Optional[int] = None
    onu_id: Optional[int] = None
    codigo_precinto: Optional[str] = None
    potencia_optica_dbm: Optional[float] = None
    metros_cable: Optional[float] = None


class ClienteActivarSatelitalRequest(BaseModel):
    """Activa un cliente satelital directo desde 'aprobado' — no hay fibra
    que tender, así que no pasa por /instalar (caja NAP/borne/ONU)."""
    cuenta_starlink_email: Optional[str] = None
    estado_equipo: EstadoEquipo = EstadoEquipo.comprado
    equipo_marca: str = "Starlink"
    equipo_modelo: Optional[str] = None
    equipo_serial: Optional[str] = None
    equipo_valor: Optional[float] = None
    equipo_fecha_entrega: Optional[date] = None


class ClienteBorneCajaOut(BaseModel):
    id: int
    codigo: str
    class Config:
        from_attributes = True

class ClienteBorneOut(BaseModel):
    numero: int
    codigo_precinto: Optional[str] = None
    potencia_optica_dbm: Optional[float] = None
    caja_nap: Optional[ClienteBorneCajaOut] = None
    class Config:
        from_attributes = True


class ClienteOut(BaseModel):
    id: int
    nombre: str
    tipo_documento: TipoDocumento = TipoDocumento.dni
    dni: Optional[str] = None
    # 1 salvo que el titular tenga más de una línea contratada.
    linea: int = 1
    ruc: Optional[str] = None
    responsable_nombre: Optional[str] = None
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    usuario_pppoe: str
    # password_pppoe y pin_app NO salen de aqui, y no es un olvido.
    #
    # GET /api/clientes esta en LECTURAS con _LEER_CLIENTES, que incluye los
    # modulos moviles de tecnicos y vendedoras (acceso.py:156). Mientras
    # estuvieron en este esquema, todo tecnico y toda vendedora recibia, en la
    # lista de clientes de su zona, la contrasena PPPoE en claro de cada
    # cliente y el hash bcrypt de la contrasena de su app. Hallazgo A-3.
    #
    # El dato sigue en el modelo: el backend lo necesita para configurar
    # /ppp secret en el router. Lo que no hace falta es mandarlo al navegador,
    # porque ninguna pantalla lo muestra. Si algun dia un tecnico necesita ver
    # la clave PPPoE para reconfigurar un equipo, va en un endpoint aparte, con
    # su propia regla en acceso.py y anotando en el historial quien la
    # consulto. pin_app no debe salir nunca.
    ip_estatica: Optional[str] = None
    zona_id: Optional[int] = None
    plan_id: int
    cantidad_tv: int
    fecha_instalacion: Optional[date] = None
    # El dia de pago sale de aqui, no de la instalacion: la ficha tiene que
    # poder mostrarla y un administrador corregirla. Ver app/facturacion.py.
    fecha_ultima_activacion: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    pausa_hasta: Optional[date] = None
    compromiso_pago_hasta: Optional[date] = None
    estado: EstadoCliente
    motivo_rechazo: Optional[str] = None
    motivo_no_instalado: Optional[str] = None
    vendedor_id: Optional[int] = None
    aprobado_por_id: Optional[int] = None
    tecnico_instalador_id: Optional[int] = None
    fecha_aprobacion: Optional[datetime] = None
    metros_cable: Optional[float] = None
    tipo_conexion: Optional[TipoConexion] = None
    notas: Optional[str] = None
    cuenta_starlink_email: Optional[str] = None
    estado_equipo: Optional[EstadoEquipo] = None
    equipo_marca: Optional[str] = None
    equipo_modelo: Optional[str] = None
    equipo_serial: Optional[str] = None
    equipo_valor: Optional[float] = None
    equipo_fecha_entrega: Optional[date] = None
    creado_en: datetime
    zona: Optional[ZonaOut] = None
    plan: Optional[PlanOut] = None
    vendedor: Optional[UsuarioOut] = None
    aprobado_por: Optional[UsuarioOut] = None
    tecnico_instalador: Optional[UsuarioOut] = None
    borne: Optional[ClienteBorneOut] = None
    monto_mensual: Optional[float] = None
    monto_mensual_detalle: Optional[List[DetalleMontoItem]] = None
    migrado: bool = False
    # Los calcula el endpoint, no salen de una columna. Ver _marcas_de_ficha
    # en routers/clientes.py: por que son dos y no uno.
    faltan_datos: bool = False
    sin_fotos: bool = False
    class Config:
        from_attributes = True

class ClienteListItem(BaseModel):
    id: int
    nombre: str
    tipo_documento: TipoDocumento = TipoDocumento.dni
    ruc: Optional[str] = None
    dni: Optional[str] = None
    # 1 salvo que el titular tenga mas de una linea contratada.
    linea: int = 1
    telefono: Optional[str] = None
    usuario_pppoe: str
    ip_estatica: Optional[str] = None
    estado: EstadoCliente
    tipo_conexion: Optional[TipoConexion] = None
    cantidad_tv: int = 0
    zona: Optional[ZonaOut] = None
    plan: Optional[PlanOut] = None
    vendedor_id: Optional[int] = None
    fecha_instalacion: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    pausa_hasta: Optional[date] = None
    compromiso_pago_hasta: Optional[date] = None
    monto_mensual: Optional[float] = None
    monto_mensual_detalle: Optional[List[DetalleMontoItem]] = None
    cuenta_starlink_email: Optional[str] = None
    migrado: bool = False
    faltan_datos: bool = False
    sin_fotos: bool = False
    class Config:
        from_attributes = True


# ── Mufas ─────────────────────────────────────────────────────────────────────
# Empalme del cable troncal — no tiene puertos de cliente. De una mufa salen
# una o más cajas NAP.

class TrazadoPunto(BaseModel):
    lat: float
    lng: float

class CorridaCreate(BaseModel):
    nombre: str
    color: Optional[str] = None
    # Metros de cable. Si no vienen, se calculan del trazado.
    metros: Optional[float] = None
    trazado: List[TrazadoPunto]

class CorridaUpdate(BaseModel):
    nombre: Optional[str] = None
    color: Optional[str] = None
    metros: Optional[float] = None
    trazado: Optional[List[TrazadoPunto]] = None

class CorridaOut(BaseModel):
    id: int
    mufa_id: int
    nombre: str
    color: str
    metros: Optional[float] = None
    trazado: Optional[List[TrazadoPunto]] = None
    class Config:
        from_attributes = True


class MufaCreate(BaseModel):
    codigo: str
    zona_id: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None

class MufaUpdate(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    trazado: Optional[List[TrazadoPunto]] = None

class MufaOut(BaseModel):
    id: int
    codigo: str
    zona_id: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    trazado: Optional[List[TrazadoPunto]] = None
    activo: bool
    creado_en: datetime
    total_cajas: Optional[int] = 0
    corridas: List[CorridaOut] = []
    class Config:
        from_attributes = True


# ── Cajas NAP / Bornes ────────────────────────────────────────────────────────

class BornePlanOut(BaseModel):
    nombre: str
    class Config:
        from_attributes = True

class BorneClienteOut(BaseModel):
    id: int
    nombre: str
    usuario_pppoe: str
    metros_cable: Optional[float] = None
    fecha_instalacion: Optional[date] = None
    plan: Optional[BornePlanOut] = None
    class Config:
        from_attributes = True

class BorneOut(BaseModel):
    id: int
    numero: int
    estado: EstadoBorne
    cliente_id: Optional[int] = None
    codigo_precinto: Optional[str] = None
    potencia_optica_dbm: Optional[float] = None
    cliente: Optional[BorneClienteOut] = None
    class Config:
        from_attributes = True

class BornePrecintoUpdate(BaseModel):
    codigo_precinto: Optional[str] = None

class BorneEstadoPppoe(BaseModel):
    borne_id: int
    cliente_id: int
    conectado: bool
    uptime: Optional[str] = None
    ip_remota: Optional[str] = None
    error: Optional[str] = None

class CajaNapCreate(BaseModel):
    codigo: str
    zona_id: int
    mufa_id: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    capacidad_bornes: int = 8
    descripcion: Optional[str] = None

class CajaNapUpdate(BaseModel):
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class CajaNapOut(BaseModel):
    id: int
    codigo: str
    zona_id: int
    mufa_id: Optional[int] = None
    # El codigo de la mufa viaja junto a la caja: quien la lea sabe de cual
    # cuelga sin tener que pedir la lista de mufas y cruzarla a mano.
    mufa_codigo: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    capacidad_bornes: int
    descripcion: Optional[str] = None
    activo: bool
    bornes: List[BorneOut] = []
    class Config:
        from_attributes = True

class BorneDanarRequest(BaseModel):
    danado: bool  # true = marcar dañado, false = volver a libre


# ── ONU (inventario) ──────────────────────────────────────────────────────────

class OnuCreate(BaseModel):
    numero_serie: str
    mac: Optional[str] = None
    marca: Optional[str] = None
    wifi_version: Optional[WifiVersion] = None

class OnuAsignarRequest(BaseModel):
    tecnico_id: int

class OnuMarcarRequest(BaseModel):
    estado: EstadoOnu  # danado | perdido | en_almacen (devolución)

class ZonaMiniOut(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class OnuClienteOut(BaseModel):
    id: int
    nombre: str
    zona: Optional[ZonaMiniOut] = None
    class Config:
        from_attributes = True

class OnuOut(BaseModel):
    id: int
    numero_serie: str
    mac: Optional[str] = None
    marca: Optional[str] = None
    wifi_version: Optional[WifiVersion] = None
    estado: EstadoOnu
    tecnico_id: Optional[int] = None
    cliente_id: Optional[int] = None
    cliente: Optional[OnuClienteOut] = None
    fecha_asignacion_tecnico: Optional[date] = None
    fecha_instalacion: Optional[date] = None
    class Config:
        from_attributes = True


# ── Orden de retiro ───────────────────────────────────────────────────────────

class OrdenRetiroClienteOut(BaseModel):
    id: int
    nombre: str
    dni: Optional[str] = None
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    estado: EstadoCliente
    zona: Optional[ZonaMiniOut] = None
    class Config:
        from_attributes = True

class OrdenRetiroCreate(BaseModel):
    cliente_id: int
    motivo: str
    tecnico_asignado_id: Optional[int] = None

class OrdenRetiroAsignar(BaseModel):
    tecnico_asignado_id: int

class OrdenRetiroCompletar(BaseModel):
    onu_retirada_id: Optional[int] = None
    retiro_roseta: bool = False
    retiro_patchcord: bool = False
    observaciones: Optional[str] = None
    # El técnico aprovecha la visita para dejar los datos al día. El número
    # importa: es al que le llega el mensaje de despedida.
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None

class OrdenRetiroOut(BaseModel):
    id: int
    cliente_id: int
    tecnico_asignado_id: Optional[int] = None
    motivo: str
    estado: EstadoOrdenRetiro
    fecha_solicitud: datetime
    fecha_retiro: Optional[datetime] = None
    onu_retirada_id: Optional[int] = None
    retiro_roseta: bool = False
    retiro_patchcord: bool = False
    observaciones: Optional[str] = None
    cliente: Optional[OrdenRetiroClienteOut] = None
    tecnico_asignado: Optional[UsuarioOut] = None
    # No es una relación de SQLAlchemy — el router la calcula (la ONU que hoy
    # está "instalado" en el cliente) y la asigna como atributo antes de serializar,
    # para que el técnico sepa cuál retirar sin tener que buscarla a mano.
    onu_actual: Optional[OnuOut] = None
    # Resultado del mensaje de despedida — lo llena el router al completar, para
    # que el técnico sepa en el acto si al cliente le llegó o no.
    whatsapp_enviado: Optional[bool] = None
    whatsapp_detalle: Optional[str] = None
    class Config:
        from_attributes = True


# ── Averías ───────────────────────────────────────────────────────────────────

class AveriaCreate(BaseModel):
    cliente_id: Optional[int] = None
    caja_nap_id: Optional[int] = None
    borne_id: Optional[int] = None
    motivo_reportado: str
    tecnico_asignado_id: Optional[int] = None

class AveriaAsignarRequest(BaseModel):
    tecnico_asignado_id: int

class AveriaEditar(BaseModel):
    motivo_reportado: str

class AveriaResolverRequest(BaseModel):
    diagnostico_solucion: str
    onu_reemplazada_id: Optional[int] = None  # ONU vieja retirada (queda dañada)
    onu_nueva_id: Optional[int] = None         # ONU nueva instalada (debe estar en stock del técnico)
    potencia_optica_dbm: Optional[float] = None

class AveriaClienteOut(BaseModel):
    id: int
    nombre: str
    dni: Optional[str] = None
    zona: Optional[ZonaMiniOut] = None
    class Config:
        from_attributes = True

class AveriaTecnicoOut(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class AveriaOnuOut(BaseModel):
    id: int
    numero_serie: str
    class Config:
        from_attributes = True

class AveriaCajaNapOut(BaseModel):
    id: int
    codigo: str
    zona: Optional[ZonaMiniOut] = None
    class Config:
        from_attributes = True

class AveriaOut(BaseModel):
    id: int
    cliente_id: Optional[int] = None
    caja_nap_id: Optional[int] = None
    borne_id: Optional[int] = None
    motivo_reportado: str
    diagnostico_solucion: Optional[str] = None
    estado: EstadoAveria
    tecnico_asignado_id: Optional[int] = None
    onu_reemplazada_id: Optional[int] = None
    onu_nueva_id: Optional[int] = None
    potencia_optica_dbm: Optional[float] = None
    fecha_reporte: datetime
    fecha_atencion: Optional[datetime] = None
    cliente: Optional[AveriaClienteOut] = None
    caja_nap: Optional[AveriaCajaNapOut] = None
    # Lo que de verdad paso con la averia. Se guardaba desde siempre, pero
    # no salía a ninguna pantalla: al cerrarla solo quedaban las fotos, y
    # una foto no dice que se hizo ni quien lo hizo.
    tecnico_asignado: Optional[AveriaTecnicoOut] = None
    onu_reemplazada: Optional[AveriaOnuOut] = None
    onu_nueva: Optional[AveriaOnuOut] = None
    class Config:
        from_attributes = True


# ── Evidencia ─────────────────────────────────────────────────────────────────

class EvidenciaOut(BaseModel):
    id: int
    averia_id: Optional[int] = None
    orden_retiro_id: Optional[int] = None
    cliente_id: Optional[int] = None
    tipo: TipoEvidencia
    ruta_archivo: str
    descripcion: Optional[str] = None
    creado_en: datetime
    class Config:
        from_attributes = True


# ── Pago ──────────────────────────────────────────────────────────────────────

class PagoBase(BaseModel):
    cliente_id: int
    monto: float
    mes_pagado: str
    fecha_pago: date
    metodo_pago: str = "efectivo"
    numero_operacion: Optional[str] = None
    estado: EstadoPago = EstadoPago.pagado
    notas: Optional[str] = None

class PagoCreate(PagoBase):
    """`monto` es lo que se cobra EN TOTAL, ya con el descuento aplicado — es lo
    que entra a caja. Con meses > 1 se reparte entre los meses cubiertos, para
    que cada mes quede con lo que le toca y la suma sea exacta.

    `descuento` es la rebaja que hizo la empresa, solo para dejar constancia:
    no se vuelve a restar de nada."""
    meses: int = Field(1, ge=1, le=12, description="Meses que paga de una vez")
    descuento: Optional[float] = Field(None, ge=0, description="Rebaja aplicada, en soles")
    # Costo de instalación a cobrar junto con ESTE pago. Si no se manda, el
    # servidor lo pone solo cuando corresponde (primer pago de un cliente
    # recién instalado de una zona que cobra instalación). Mandar 0 lo quita.
    cargo_instalacion: Optional[float] = Field(
        None, ge=0, description="Costo de instalación cobrado una sola vez, en soles"
    )

class ClienteNombre(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class AdelantoResumen(BaseModel):
    """Los meses que se cobraron juntos, para el recibo y el historial."""
    # Número del recibo del grupo: el id del primer mes cobrado. Es el mismo
    # que sale impreso en el PDF, se abra el recibo desde el mes que se abra.
    numero: int
    meses: int
    desde: str
    hasta: str
    total: float
    descuento: Optional[float] = None


class PagoOut(PagoBase):
    id: int
    creado_en: datetime
    ruta_comprobante: Optional[str] = None
    grupo_adelanto: Optional[str] = None
    descuento: Optional[float] = None
    # Costo de instalación cobrado con este pago (solo el primero del grupo).
    cargo_instalacion: Optional[float] = None
    # Solo viene con dato cuando el pago es parte de un cobro adelantado
    adelanto: Optional[AdelantoResumen] = None
    cliente: Optional[ClienteNombre] = None
    registrador: Optional[UsuarioOut] = None
    class Config:
        from_attributes = True


# ── Gasto ─────────────────────────────────────────────────────────────────────

class GastoBase(BaseModel):
    descripcion: str
    monto: float
    categoria: str = "Otros"
    fecha: date
    proveedor: Optional[str] = None
    numero_factura: Optional[str] = None
    comprobante: Optional[str] = None
    es_recurrente: bool = False
    notas: Optional[str] = None
    zona_id: Optional[int] = None

class GastoCreate(GastoBase):
    pass

class GastoOut(GastoBase):
    id: int
    creado_en: datetime
    class Config:
        from_attributes = True


# ── Historial ─────────────────────────────────────────────────────────────────

class HistorialOut(BaseModel):
    id: int
    cliente_id: int
    tipo: TipoHistorial
    descripcion: str
    creado_en: datetime
    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_clientes: int
    clientes_activos: int
    clientes_suspendidos: int
    ingresos_mes_actual: float
    ingresos_mes_anterior: float
    gastos_mes_actual: float
    total_zonas: int
    pagos_pendientes: int

class IngresoMensual(BaseModel):
    mes: str
    ingresos: float
    gastos: float


# ── Auth cliente (app móvil) ──────────────────────────────────────────────────

class ClienteLoginRequest(BaseModel):
    usuario: str   # DNI del cliente
    pin: str       # Contraseña: el mismo DNI por defecto, o la personalizada si la cambió

class CambiarPinRequest(BaseModel):
    pin_actual: str
    pin_nuevo: str

class SolicitarCodigoRequest(BaseModel):
    """El documento (o el usuario completo) de quien pide un código."""
    usuario: str

class SolicitarCodigoResponse(BaseModel):
    # Siempre true: la respuesta no dice si el documento está registrado o no.
    enviado: bool = True
    # El número al que se mandó, tapado (9****7069), para que la persona sepa
    # dónde mirar. None si no había a quién mandárselo.
    telefono: Optional[str] = None
    mensaje: str

class VerificarCodigoRequest(BaseModel):
    usuario: str
    codigo: str
    pin_nuevo: str

class ClienteTokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    cliente_id: int
    nombre: str
    # True mientras el cliente siga entrando con la contraseña por defecto,
    # que es su propio DNI: ocho dígitos que no son ningún secreto. La app lo
    # usa para llevarlo a cambiarla antes de dejarle ver nada.
    debe_cambiar_pin: bool = False

class NotificacionOut(BaseModel):
    tipo: str  # pendiente_aprobacion | instalado | no_instalado | averia_demorada | jornada_iniciada | whatsapp_desconectado
    titulo: str
    detalle: str
    url: str  # ruta del frontend a la que navega al hacer clic
    fecha: datetime


class MiCuentaOut(BaseModel):
    id: int
    nombre: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    estado: EstadoCliente
    plan: Optional[PlanOut] = None
    fecha_vencimiento: Optional[date] = None
    fecha_instalacion: Optional[date] = None
    class Config:
        from_attributes = True


# ── Mensajes masivos de WhatsApp ───────────────────────────────────────────────

class MensajeMasivoCreate(BaseModel):
    zona_ids: Optional[List[int]] = None  # None o [] = todas las zonas
    estados: List[EstadoCliente] = [EstadoCliente.activo]
    mensaje: str
    plantilla_nombre: Optional[str] = None

class MensajeMasivoOut(BaseModel):
    id: int
    mensaje: str
    plantilla_nombre: Optional[str] = None
    zona_ids: Optional[List[int]] = None
    estados_incluidos: List[str]
    total_destinatarios: int
    enviados: int
    fallidos: int
    estado: EstadoMensajeMasivo
    creado_por: Optional[UsuarioOut] = None
    creado_en: datetime
    finalizado_en: Optional[datetime] = None
    class Config:
        from_attributes = True


# ── Jornadas de vendedor de campo ──────────────────────────────────────────────

class UsuarioNombre(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class ZonaNombre(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class JornadaIniciarRequest(BaseModel):
    lat: float
    lng: float
    zona_id: Optional[int] = None

class JornadaPingRequest(BaseModel):
    lat: float
    lng: float

class JornadaFinalizarRequest(BaseModel):
    # Al CERRAR la jornada las coordenadas son opcionales a propósito: exigir un
    # GPS nuevo para terminar dejaba el botón colgado bajo techo, esperando un
    # fix que no llegaba. Si no vienen, el backend usa el último punto conocido.
    lat: Optional[float] = None
    lng: Optional[float] = None

class UbicacionVendedorOut(BaseModel):
    lat: float
    lng: float
    registrado_en: datetime
    class Config:
        from_attributes = True

class JornadaOut(BaseModel):
    id: int
    vendedor: Optional[UsuarioNombre] = None
    zona: Optional[ZonaNombre] = None
    estado: str
    lat_inicio: float
    lng_inicio: float
    monto_pasaje: Optional[float] = None
    monto_reclamado: Optional[float] = None
    nota_reclamo: Optional[str] = None
    reclamo_reintegrado: bool = False
    lat_fin: Optional[float] = None
    lng_fin: Optional[float] = None
    iniciado_en: datetime
    finalizado_en: Optional[datetime] = None
    ultima_ubicacion: Optional[UbicacionVendedorOut] = None
    class Config:
        from_attributes = True

class JornadaRecorridoOut(BaseModel):
    jornada: JornadaOut
    puntos: List[UbicacionVendedorOut]

class JornadaPasajeUpdate(BaseModel):
    monto_pasaje: Optional[float] = None

class ReclamoPasajeRequest(BaseModel):
    monto_reclamado: float
    nota: Optional[str] = None

class ResumenPasajeVendedor(BaseModel):
    vendedor_id: int
    nombre: str
    total_jornadas: int
    total_pasajes: float


# ── Roles y módulos ──────────────────────────────────────────────────────────

class RolResumenOut(BaseModel):
    id: int
    clave: str
    nombre: str
    es_superadmin: bool
    class Config:
        from_attributes = True


class MiModuloOut(BaseModel):
    clave: str
    nombre: str
    grupo: str
    grupo_id: int
    grupo_icono: Optional[str] = None
    plataforma: str
    ruta: Optional[str] = None
    icono: Optional[str] = None
    es_central: bool


class MisModulosOut(BaseModel):
    rol: RolResumenOut
    modulos: List[MiModuloOut]


class RolConCuentasOut(RolResumenOut):
    descripcion: Optional[str] = None
    es_sistema: bool
    perfil_base: Optional[str] = None
    # None en el rol cliente: los clientes no son cuentas del personal.
    cuentas_activas: Optional[int] = None
    total_modulos: int


class AsignacionModuloOut(BaseModel):
    rol_id: int
    orden: int
    es_central: bool
    class Config:
        from_attributes = True


class ModuloConRolesOut(BaseModel):
    id: int
    clave: str
    nombre: str
    grupo: str
    modulo_padre_id: int
    plataforma: str
    audiencia: str
    ruta: Optional[str] = None
    icono: Optional[str] = None
    orden: int
    asignaciones: List[AsignacionModuloOut]
    roles_disponibles: List[int]
    roles_fijos: List[int]


class CambioModulo(BaseModel):
    activo: StrictBool


class CambioModuloOut(BaseModel):
    rol_id: int
    modulo_id: int
    activo: bool


class ModuloDelPadreOut(BaseModel):
    id: int
    clave: str
    nombre: str
    icono: Optional[str] = None
    class Config:
        from_attributes = True


class ModuloPadreOut(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    plataforma: str
    orden: int
    modulos: List[ModuloDelPadreOut]
    class Config:
        from_attributes = True


class ModuloPadreCrear(BaseModel):
    nombre: str = Field(min_length=3, max_length=60)
    icono: Optional[str] = Field(default=None, max_length=80, pattern=r"^[a-z0-9:-]+$")
    plataforma: Literal["panel", "movil"] = "panel"

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, valor: str) -> str:
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("El nombre debe tener al menos 3 letras")
        return valor


class ModuloPadreEditar(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=3, max_length=60)
    icono: Optional[str] = Field(default=None, max_length=80, pattern=r"^[a-z0-9:-]+$")

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, valor: Optional[str]) -> Optional[str]:
        if valor is None:
            return valor
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("El nombre debe tener al menos 3 letras")
        return valor


class OrdenPadres(BaseModel):
    plataforma: Literal["panel", "movil"] = "panel"
    padre_ids: List[int]


class MoverModulo(BaseModel):
    modulo_padre_id: int


class RolCrear(BaseModel):
    nombre: str = Field(min_length=3, max_length=60)
    descripcion: Optional[str] = Field(default=None, max_length=255)
    perfil_base: Literal["atencion_cliente", "tecnico", "vendedor_campo"]

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, valor: str) -> str:
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("El nombre debe tener al menos 3 letras")
        return valor


class RolEditar(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=3, max_length=60)
    descripcion: Optional[str] = Field(default=None, max_length=255)

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, valor: Optional[str]) -> Optional[str]:
        if valor is None:
            return valor
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("El nombre debe tener al menos 3 letras")
        return valor


class OrdenModulos(BaseModel):
    plataforma: Literal["panel", "movil"]
    modulo_ids: List[int]


class OrdenModulosOut(OrdenModulos):
    rol_id: int


# ── Materiales de fibra ───────────────────────────────────────────────────────

class MaterialPresentacionOut(BaseModel):
    id: int
    nombre: str
    # Cuantas unidades base trae: una bolsa de tensadores, 10.
    equivale_a: float
    activo: bool
    class Config:
        from_attributes = True


class MaterialOut(BaseModel):
    id: int
    clave: str
    nombre: str
    unidad: Literal["metro", "unidad"]
    se_recupera: bool
    consumo_estandar: Optional[float] = None
    activo: bool
    # Calculado sumando movimientos; no existe como columna.
    en_almacen: float
    tiene_foto: bool = False
    presentaciones: List[MaterialPresentacionOut] = []


class MovimientoMaterialCreate(BaseModel):
    material_id: int
    tipo: Literal["entrada", "entrega", "devolucion", "ajuste"]
    # En la presentacion elegida si viene presentacion_id ("2 bolsas"), o en
    # la unidad del material si no ("45 metros").
    cantidad: float
    presentacion_id: Optional[int] = None
    tecnico_id: Optional[int] = None
    motivo: Optional[str] = Field(default=None, max_length=200)


class MovimientoMaterialOut(BaseModel):
    id: int
    material_id: int
    material_nombre: Optional[str] = None
    unidad: Optional[str] = None
    tipo: str
    cantidad: float
    tecnico_id: Optional[int] = None
    tecnico_nombre: Optional[str] = None
    cliente_id: Optional[int] = None
    presentacion: Optional[str] = None
    motivo: Optional[str] = None
    registrado_por: Optional[str] = None
    creado_en: Optional[datetime] = None


class SaldoTecnicoOut(BaseModel):
    tecnico_id: int
    tecnico_nombre: str
    material_id: int
    material_nombre: str
    unidad: str
    cantidad: float


class PresentacionInput(BaseModel):
    """Como se compra un material: un nombre y cuantas unidades base trae."""
    nombre: str = Field(min_length=1, max_length=60)
    equivale_a: float = Field(gt=0)


class MaterialCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    unidad: Literal["metro", "unidad"]
    se_recupera: bool = False
    consumo_estandar: Optional[float] = Field(default=None, ge=0)
    presentaciones: List[PresentacionInput] = []


class MaterialUpdate(BaseModel):
    """La unidad NO se puede cambiar: hay movimientos contados en ella, y
    pasar de metro a unidad convertiria 1800 metros en 1800 rosetas."""
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=80)
    se_recupera: Optional[bool] = None
    consumo_estandar: Optional[float] = Field(default=None, ge=0)
    activo: Optional[bool] = None


# ── Unidades vehiculares ───────────────────────────────────────────────────────

class UnidadBase(BaseModel):
    placa: str
    marca: Optional[str] = None
    modelo: Optional[str] = None
    activo: bool = True

    @field_validator("placa")
    @classmethod
    def _placa_limpia(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not v:
            raise ValueError("La placa es obligatoria")
        if len(v) > 20:
            raise ValueError("La placa es muy larga")
        return v


class UnidadCreate(UnidadBase):
    pass


class UnidadUpdate(BaseModel):
    placa: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("placa")
    @classmethod
    def _placa_limpia(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not v:
            raise ValueError("La placa no puede quedar vacía")
        return v


class UnidadOut(BaseModel):
    id: int
    placa: str
    marca: Optional[str] = None
    modelo: Optional[str] = None
    activo: bool
    tiene_foto: bool = False
    creado_en: datetime
    class Config:
        from_attributes = True


# ── Recargas de combustible ────────────────────────────────────────────────────

class RecargaCombustibleOut(BaseModel):
    id: int
    unidad_id: int
    monto: float
    fecha: date
    nota: Optional[str] = None
    tiene_foto_surtidor: bool = False
    tiene_foto_boleta: bool = False
    registrado_por: Optional[int] = None
    creado_en: datetime
    # Datos del vehículo y de quién cargó, para la tabla del admin (se llenan
    # en el router; no son columnas de la recarga).
    unidad_placa: Optional[str] = None
    registrado_por_nombre: Optional[str] = None
    class Config:
        from_attributes = True


class ReporteUnidadMes(BaseModel):
    unidad_id: int
    placa: str
    marca: Optional[str] = None
    modelo: Optional[str] = None
    total: float
    recargas: int
