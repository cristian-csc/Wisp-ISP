from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date,
    ForeignKey, Text, Enum as SAEnum, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class RolUsuario(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    subadmin = "subadmin"
    tecnico = "tecnico"
    vendedor_campo = "vendedor_campo"
    vendedor_tienda = "vendedor_tienda"


class EstadoCliente(str, enum.Enum):
    pendiente_aprobacion = "pendiente_aprobacion"
    rechazado = "rechazado"
    aprobado = "aprobado"
    no_instalado = "no_instalado"
    activo = "activo"
    anulado = "anulado"
    suspendido = "suspendido"
    pausado = "pausado"


class EstadoPago(str, enum.Enum):
    pagado = "pagado"
    pendiente = "pendiente"
    vencido = "vencido"
    corte_temporal = "corte_temporal"


class TipoHistorial(str, enum.Enum):
    activacion = "activacion"
    corte = "corte"
    pago = "pago"
    cambio_plan = "cambio_plan"
    cambio_onu = "cambio_onu"
    compromiso_pago = "compromiso_pago"
    nota = "nota"


class TipoConexion(str, enum.Enum):
    inalambrico = "inalambrico"
    fibra_optica = "fibra_optica"
    satelital = "satelital"


class EstadoEquipo(str, enum.Enum):
    prestado = "prestado"
    comprado = "comprado"
    sin_equipo = "sin_equipo"


class EstadoBorne(str, enum.Enum):
    libre = "libre"
    ocupado = "ocupado"
    danado = "danado"


class EstadoOnu(str, enum.Enum):
    en_almacen = "en_almacen"
    asignado_tecnico = "asignado_tecnico"
    instalado = "instalado"
    danado = "danado"
    perdido = "perdido"


class WifiVersion(str, enum.Enum):
    wifi5 = "wifi5"
    wifi6 = "wifi6"


class EstadoOrdenRetiro(str, enum.Enum):
    pendiente = "pendiente"
    completado = "completado"


class EstadoAveria(str, enum.Enum):
    pendiente = "pendiente"
    asignada = "asignada"
    en_proceso = "en_proceso"
    resuelta = "resuelta"


class TipoEvidencia(str, enum.Enum):
    instalacion = "instalacion"
    averia = "averia"
    retiro = "retiro"
    otro = "otro"


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    rol = Column(SAEnum(RolUsuario), nullable=False)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    zonas_asignadas = relationship("TecnicoZona", back_populates="tecnico")


class TecnicoZona(Base):
    __tablename__ = "tecnico_zona"

    id = Column(Integer, primary_key=True, index=True)
    tecnico_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=False, index=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    tecnico = relationship("Usuario", back_populates="zonas_asignadas")
    zona = relationship("Zona", back_populates="tecnicos_asignados")

    __table_args__ = (
        UniqueConstraint("tecnico_id", "zona_id", name="uq_tecnico_zona"),
    )


class Zona(Base):
    __tablename__ = "zonas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, unique=True)
    ip_lan = Column(String(20))
    usuario_mikrotik = Column(String(100))
    password_mikrotik = Column(String(255))
    router_mikrotik = Column(String(100))
    ip_wireguard = Column(String(20), nullable=False)
    wg_public_key = Column(String(255))
    ip_router = Column(String(20))
    lat = Column(Float)
    lng = Column(Float)
    descripcion = Column(Text)
    tiendas_pago = Column(Text)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    clientes = relationship("Cliente", back_populates="zona")
    tecnicos_asignados = relationship("TecnicoZona", back_populates="zona")
    cajas_nap = relationship("CajaNap", back_populates="zona")
    mufas = relationship("Mufa", back_populates="zona")
    gastos = relationship("Gasto", back_populates="zona")


class Mufa(Base):
    """Empalme/derivación del cable troncal — no tiene puertos de cliente.
    De una mufa salen una o más cajas NAP, que sí tienen bornes."""
    __tablename__ = "mufas"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=False, index=True)
    lat = Column(Float)
    lng = Column(Float)
    descripcion = Column(Text)
    # Trazado visual del tendido hasta esta mufa — lista de puntos
    # [{"lat": ..., "lng": ...}, ...] solo para graficar en el mapa, no es
    # medición de ingeniería (eso lo sigue manejando el ingeniero aparte).
    trazado = Column(JSON)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    zona = relationship("Zona", back_populates="mufas")
    cajas_nap = relationship("CajaNap", back_populates="mufa")


class CajaNap(Base):
    __tablename__ = "cajas_nap"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=False, index=True)
    mufa_id = Column(Integer, ForeignKey("mufas.id"), index=True)
    lat = Column(Float)
    lng = Column(Float)
    capacidad_bornes = Column(Integer, nullable=False, default=8)
    descripcion = Column(Text)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    zona = relationship("Zona", back_populates="cajas_nap")
    mufa = relationship("Mufa", back_populates="cajas_nap")
    bornes = relationship("Borne", back_populates="caja_nap", order_by="Borne.numero")


class Borne(Base):
    __tablename__ = "bornes"

    id = Column(Integer, primary_key=True, index=True)
    caja_nap_id = Column(Integer, ForeignKey("cajas_nap.id"), nullable=False, index=True)
    numero = Column(Integer, nullable=False)
    estado = Column(SAEnum(EstadoBorne), default=EstadoBorne.libre, nullable=False)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), index=True)
    codigo_precinto = Column(String(50))
    potencia_optica_dbm = Column(Float)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    caja_nap = relationship("CajaNap", back_populates="bornes")
    cliente = relationship("Cliente", back_populates="borne", uselist=False)

    __table_args__ = (
        UniqueConstraint("caja_nap_id", "numero", name="uq_caja_borne_numero"),
    )


class Plan(Base):
    __tablename__ = "planes"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    bajada_mbps = Column(Integer, nullable=False)
    subida_mbps = Column(Integer, nullable=False)
    precio = Column(Float, nullable=False)
    incluye_tv = Column(Boolean, default=False, nullable=False)
    tv_incluidas = Column(Integer, default=0, nullable=False)
    precio_tv_adicional = Column(Float)
    descripcion = Column(Text)
    activo = Column(Boolean, default=True)

    # A qué tipo de servicio aplica — un plan satelital (ej. "Starlink 170")
    # no tiene perfil PPPoE que sincronizar en el MikroTik, a diferencia de
    # los planes de fibra/inalámbrico.
    tipo_conexion = Column(SAEnum(TipoConexion), default=TipoConexion.fibra_optica, nullable=False)
    # Lo que la empresa le paga al proveedor (ej. Starlink) por este plan —
    # la ganancia es precio - costo_proveedor. Solo aplica a planes satelitales.
    costo_proveedor = Column(Float)

    clientes = relationship("Cliente", back_populates="plan")


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    dni = Column(String(15), unique=True, index=True)
    telefono = Column(String(20))
    telefono_whatsapp = Column(String(20))
    direccion = Column(Text)
    lat = Column(Float)
    lng = Column(Float)
    usuario_pppoe = Column(String(100), unique=True, nullable=False)
    password_pppoe = Column(String(100), nullable=False)
    ip_estatica = Column(String(20))
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=False)
    plan_id = Column(Integer, ForeignKey("planes.id"), nullable=False)
    cantidad_tv = Column(Integer, default=0, nullable=False)
    fecha_instalacion = Column(Date)
    fecha_vencimiento = Column(Date)
    pausa_hasta = Column(Date)
    compromiso_pago_hasta = Column(Date)
    estado = Column(SAEnum(EstadoCliente), default=EstadoCliente.pendiente_aprobacion, nullable=False, index=True)
    motivo_rechazo = Column(Text)
    motivo_no_instalado = Column(Text)

    # Captación / aprobación / instalación
    vendedor_id = Column(Integer, ForeignKey("usuarios.id"))
    aprobado_por_id = Column(Integer, ForeignKey("usuarios.id"))
    tecnico_instalador_id = Column(Integer, ForeignKey("usuarios.id"))
    fecha_aprobacion = Column(DateTime(timezone=True))
    metros_cable = Column(Float)

    # Tipo de servicio
    tipo_conexion = Column(SAEnum(TipoConexion), default=TipoConexion.inalambrico)

    # Equipo entregado (legacy — el tracking nuevo por número de serie vive en Onu)
    estado_equipo = Column(SAEnum(EstadoEquipo), default=EstadoEquipo.sin_equipo)
    equipo_marca = Column(String(100))
    equipo_modelo = Column(String(100))
    equipo_serial = Column(String(100))
    equipo_descripcion = Column(Text)
    equipo_fecha_entrega = Column(Date)
    equipo_valor = Column(Float)

    # Solo para tipo_conexion=satelital — el correo con el que está
    # registrada la cuenta/equipo de Starlink ante el proveedor.
    cuenta_starlink_email = Column(String(150))

    notas = Column(Text)
    pin_app = Column(String(255))  # PIN hasheado para login en app móvil
    fecha_ultima_activacion = Column(Date)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), onupdate=func.now())

    zona = relationship("Zona", back_populates="clientes")
    plan = relationship("Plan", back_populates="clientes")
    pagos = relationship("Pago", back_populates="cliente", order_by="Pago.fecha_pago.desc()")
    historial = relationship("Historial", back_populates="cliente", order_by="Historial.creado_en.desc()")
    borne = relationship("Borne", back_populates="cliente", uselist=False)
    onus = relationship("Onu", back_populates="cliente")
    averias = relationship("Averia", back_populates="cliente", order_by="Averia.fecha_reporte.desc()")
    vendedor = relationship("Usuario", foreign_keys=[vendedor_id])
    aprobado_por = relationship("Usuario", foreign_keys=[aprobado_por_id])
    tecnico_instalador = relationship("Usuario", foreign_keys=[tecnico_instalador_id])


class Onu(Base):
    __tablename__ = "onus"

    id = Column(Integer, primary_key=True, index=True)
    numero_serie = Column(String(100), unique=True, nullable=False, index=True)
    mac = Column(String(50))
    marca = Column(String(100))
    wifi_version = Column(SAEnum(WifiVersion))
    estado = Column(SAEnum(EstadoOnu), default=EstadoOnu.en_almacen, nullable=False, index=True)
    tecnico_id = Column(Integer, ForeignKey("usuarios.id"), index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), index=True)
    fecha_asignacion_tecnico = Column(Date)
    fecha_instalacion = Column(Date)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    cliente = relationship("Cliente", back_populates="onus")


class OrdenRetiro(Base):
    __tablename__ = "ordenes_retiro"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False, index=True)
    tecnico_asignado_id = Column(Integer, ForeignKey("usuarios.id"))
    motivo = Column(Text, nullable=False)
    estado = Column(SAEnum(EstadoOrdenRetiro), default=EstadoOrdenRetiro.pendiente, nullable=False, index=True)
    fecha_solicitud = Column(DateTime(timezone=True), server_default=func.now())
    fecha_retiro = Column(DateTime(timezone=True))
    onu_retirada_id = Column(Integer, ForeignKey("onus.id"))
    retiro_roseta = Column(Boolean, default=False)
    retiro_patchcord = Column(Boolean, default=False)
    observaciones = Column(Text)

    cliente = relationship("Cliente")
    tecnico_asignado = relationship("Usuario", foreign_keys=[tecnico_asignado_id])


class Averia(Base):
    __tablename__ = "averias"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), index=True)
    caja_nap_id = Column(Integer, ForeignKey("cajas_nap.id"))
    borne_id = Column(Integer, ForeignKey("bornes.id"))
    motivo_reportado = Column(Text, nullable=False)
    diagnostico_solucion = Column(Text)
    estado = Column(SAEnum(EstadoAveria), default=EstadoAveria.pendiente, nullable=False, index=True)
    tecnico_asignado_id = Column(Integer, ForeignKey("usuarios.id"), index=True)
    onu_reemplazada_id = Column(Integer, ForeignKey("onus.id"))
    onu_nueva_id = Column(Integer, ForeignKey("onus.id"))
    potencia_optica_dbm = Column(Float)
    fecha_reporte = Column(DateTime(timezone=True), server_default=func.now())
    fecha_atencion = Column(DateTime(timezone=True))

    cliente = relationship("Cliente", back_populates="averias")
    caja_nap = relationship("CajaNap")


class Evidencia(Base):
    __tablename__ = "evidencias"

    id = Column(Integer, primary_key=True, index=True)
    averia_id = Column(Integer, ForeignKey("averias.id"), index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), index=True)
    orden_retiro_id = Column(Integer, ForeignKey("ordenes_retiro.id"), index=True)
    tipo = Column(SAEnum(TipoEvidencia), nullable=False)
    ruta_archivo = Column(String(500), nullable=False)
    descripcion = Column(Text)
    subido_por_id = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime(timezone=True), server_default=func.now())


class Pago(Base):
    __tablename__ = "pagos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    monto = Column(Float, nullable=False)
    mes_pagado = Column(String(7), nullable=False)
    fecha_pago = Column(Date, nullable=False)
    metodo_pago = Column(String(50), default="efectivo")
    numero_operacion = Column(String(100), unique=True)
    estado = Column(SAEnum(EstadoPago), default=EstadoPago.pagado)
    ruta_comprobante = Column(String(500))
    notas = Column(Text)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    registrado_por = Column(Integer, ForeignKey("usuarios.id"))

    cliente = relationship("Cliente", back_populates="pagos")
    registrador = relationship("Usuario", foreign_keys=[registrado_por])


class Gasto(Base):
    __tablename__ = "gastos"

    id = Column(Integer, primary_key=True, index=True)
    descripcion = Column(String(255), nullable=False)
    monto = Column(Float, nullable=False)
    categoria = Column(String(100), nullable=False, default="Otros")
    fecha = Column(Date, nullable=False)
    proveedor = Column(String(150))
    numero_factura = Column(String(100))
    comprobante = Column(String(255))
    es_recurrente = Column(Boolean, default=False)
    notas = Column(Text)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True, index=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    registrado_por = Column(Integer, ForeignKey("usuarios.id"))

    zona = relationship("Zona", back_populates="gastos")



class Historial(Base):
    __tablename__ = "historial"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    tipo = Column(SAEnum(TipoHistorial), nullable=False)
    descripcion = Column(Text, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    cliente = relationship("Cliente", back_populates="historial")


class EstadoMensajeMasivo(str, enum.Enum):
    en_progreso = "en_progreso"
    completado = "completado"
    cancelado = "cancelado"


class EstadoEnvioMasivo(str, enum.Enum):
    pendiente = "pendiente"
    enviado = "enviado"
    fallido = "fallido"


class MensajeMasivo(Base):
    """Un envío masivo de WhatsApp (ej. aviso de mantenimiento a una zona).
    Corre en segundo plano con una pausa aleatoria entre cada mensaje — mandarlos
    todos de golpe arriesga que WhatsApp bloquee el número por parecer spam."""
    __tablename__ = "mensajes_masivos"

    id = Column(Integer, primary_key=True, index=True)
    mensaje = Column(Text, nullable=False)
    plantilla_nombre = Column(String(50))
    zona_ids = Column(JSON)  # null/vacío = todas las zonas
    estados_incluidos = Column(JSON, nullable=False)  # lista de EstadoCliente (como string)
    meta = Column(JSON)  # datos extra según plantilla_nombre, ej. {"mes": "2026-10"} en recordatorio_cobros
    total_destinatarios = Column(Integer, nullable=False, default=0)
    enviados = Column(Integer, nullable=False, default=0)
    fallidos = Column(Integer, nullable=False, default=0)
    estado = Column(SAEnum(EstadoMensajeMasivo), nullable=False, default=EstadoMensajeMasivo.en_progreso, index=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    finalizado_en = Column(DateTime(timezone=True))

    creado_por = relationship("Usuario")


class MensajeMasivoEnvio(Base):
    """Registro por cliente de un envío masivo — para poder comprobar después
    a quién le llegó y a quién no (hoy no existe ningún historial de WhatsApp)."""
    __tablename__ = "mensajes_masivos_envios"

    id = Column(Integer, primary_key=True, index=True)
    mensaje_masivo_id = Column(Integer, ForeignKey("mensajes_masivos.id"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    estado = Column(SAEnum(EstadoEnvioMasivo), nullable=False, default=EstadoEnvioMasivo.pendiente, index=True)
    error = Column(Text)
    enviado_en = Column(DateTime(timezone=True))

    cliente = relationship("Cliente")
