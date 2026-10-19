import re
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import date, datetime
from .models import (
    EstadoCliente, EstadoPago, TipoHistorial, TipoConexion, EstadoEquipo,
    RolUsuario, EstadoBorne, EstadoOnu, WifiVersion, EstadoOrdenRetiro,
    EstadoAveria, TipoEvidencia, EstadoMensajeMasivo,
)

_PPPOE_RE = re.compile(r'^[a-zA-Z0-9._@-]{1,100}$')
_IPV4_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
_DNI_RE = re.compile(r'^\d{8}$')


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UsuarioBase(BaseModel):
    nombre: str
    email: EmailStr
    rol: RolUsuario

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioOut(UsuarioBase):
    id: int
    activo: bool
    creado_en: datetime
    email: str  # se relaja el formato solo al leer: la creación (UsuarioCreate) sigue exigiendo EmailStr
    class Config:
        from_attributes = True

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[RolUsuario] = None
    activo: Optional[bool] = None

class ChangePassword(BaseModel):
    password_actual: str
    password_nueva: str


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
    nombre: str
    ip_wireguard: str
    ip_lan: Optional[str] = None
    usuario_mikrotik: Optional[str] = None
    password_mikrotik: Optional[str] = None
    wg_public_key: Optional[str] = None
    router_mikrotik: Optional[str] = None
    ip_router: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    tiendas_pago: Optional[str] = None

class ZonaCreate(ZonaBase):
    pass

class ZonaOut(ZonaBase):
    id: int
    activo: bool
    creado_en: datetime
    total_clientes: Optional[int] = 0
    clientes_activos: Optional[int] = 0
    class Config:
        from_attributes = True

class ZonaDatosUpdate(BaseModel):
    """Datos que puede corregir el admin del negocio: nombre, descripción,
    tiendas de pago, ubicación del servidor y las credenciales del MikroTik
    (usuario/clave/IP LAN/router) — es su propio router, lo administra él.
    Lo que NUNCA toca es el túnel WireGuard (ip_wireguard/wg_public_key) ni
    la terminal SSH: eso es la conexión al hub central que solo super_admin
    (Desarrollador) conoce y mantiene — ahí si algo se rompe, se cae el
    acceso remoto a toda la zona, no solo a un router."""
    nombre: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    descripcion: Optional[str] = None
    tiendas_pago: Optional[str] = None
    ip_lan: Optional[str] = None
    usuario_mikrotik: Optional[str] = None
    password_mikrotik: Optional[str] = None
    router_mikrotik: Optional[str] = None
    ip_router: Optional[str] = None

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
    nombre: str
    dni: str
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zona_id: int
    plan_id: int
    cantidad_tv: int = 0
    tipo_conexion: TipoConexion = TipoConexion.fibra_optica
    notas: Optional[str] = None

    @field_validator('dni')
    @classmethod
    def validate_dni(cls, v: str) -> str:
        if not _DNI_RE.match(v):
            raise ValueError('DNI debe tener exactamente 8 dígitos')
        return v


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
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
    tipo_conexion: Optional[TipoConexion] = None
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


class ClienteRechazarRequest(BaseModel):
    motivo: str

class ClienteNoInstalarRequest(BaseModel):
    motivo: str

class ClientePausarRequest(BaseModel):
    meses: int

class CompromisoPagoRequest(BaseModel):
    fecha_limite: date

class ClienteInstalarRequest(BaseModel):
    caja_nap_id: int
    numero_borne: int
    onu_id: int
    metros_cable: Optional[float] = None
    potencia_optica_dbm: Optional[float] = None
    codigo_precinto: Optional[str] = None


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
    dni: Optional[str] = None
    telefono: Optional[str] = None
    telefono_whatsapp: Optional[str] = None
    direccion: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    usuario_pppoe: str
    password_pppoe: str
    ip_estatica: Optional[str] = None
    pin_app: Optional[str] = None
    zona_id: int
    plan_id: int
    cantidad_tv: int
    fecha_instalacion: Optional[date] = None
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
    class Config:
        from_attributes = True

class ClienteListItem(BaseModel):
    id: int
    nombre: str
    dni: Optional[str] = None
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
    class Config:
        from_attributes = True


# ── Mufas ─────────────────────────────────────────────────────────────────────
# Empalme del cable troncal — no tiene puertos de cliente. De una mufa salen
# una o más cajas NAP.

class TrazadoPunto(BaseModel):
    lat: float
    lng: float

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
    pass

class ClienteNombre(BaseModel):
    id: int
    nombre: str
    class Config:
        from_attributes = True

class PagoOut(PagoBase):
    id: int
    creado_en: datetime
    ruta_comprobante: Optional[str] = None
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
    usuario: str   # usuario_pppoe del cliente
    pin: str       # DDMM de fecha_instalacion (ej. "2508")

class CambiarPinRequest(BaseModel):
    pin_actual: str
    pin_nuevo: str

class ClienteTokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    cliente_id: int
    nombre: str

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
