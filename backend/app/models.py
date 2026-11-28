from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date, Numeric,
    ForeignKey, Text, Enum as SAEnum, UniqueConstraint, CheckConstraint, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class RolUsuario(str, enum.Enum):
    """Los cuatro roles del sistema. No hay más, y es a propósito: cada rol
    que existe es uno que alguien tiene que entender y mantener.

    `atencion_cliente` es el personal de caja y mostrador; en pantalla se lee
    "Atención al cliente" (ver ROL_LABEL en el panel). Hasta el 2026-11-10
    ese rol se llamaba "vendedor de tienda", y existían además dos roles más
    que se eliminaron: uno por encima de admin para la infraestructura, y un
    sub-administrador que ningún flujo del negocio llegó a usar.
    """
    admin = "admin"
    tecnico = "tecnico"
    vendedor_campo = "vendedor_campo"
    atencion_cliente = "atencion_cliente"


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


class TipoDocumento(str, enum.Enum):
    """Con qué documento se da de alta al cliente. El RUC identifica a la
    empresa, pero NUNCA es credencial: el usuario y la contraseña de PPPoE
    salen siempre del DNI (del titular, o del responsable si es empresa),
    porque un RUC es información pública y cualquiera podría consultarlo."""
    dni = "dni"
    ruc = "ruc"


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
    # Tipo de cuenta: decide las reglas de datos. Los módulos salen de rol_id.
    rol = Column(SAEnum(RolUsuario), nullable=False)
    rol_id = Column(Integer, ForeignKey("roles.id", ondelete="RESTRICT"), index=True)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    # Ficha de personal — informativo, no mueve ninguna lógica del sistema.
    telefono = Column(String(20))
    dni = Column(String(15))
    direccion = Column(Text)
    # Distinto de creado_en: cuándo entró a trabajar en la empresa, no cuándo
    # se le creó la cuenta (casi siempre antes — el negocio ya existía).
    fecha_ingreso = Column(Date)

    zonas_asignadas = relationship("TecnicoZona", back_populates="tecnico")
    rol_asignado = relationship("Rol", foreign_keys=[rol_id])

    @property
    def rol_nombre(self):
        return self.rol_asignado.nombre if self.rol_asignado else None


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
    # Puede estar vacía: una zona se registra cuando se decide abrirla,
    # y el túnel se configura después, cuando el MikroTik ya está en sitio.
    ip_wireguard = Column(String(20))
    wg_public_key = Column(String(255))
    ip_router = Column(String(20))
    # Nombre del pool de direcciones del MikroTik del que salen las IP de los
    # clientes PPPoE. Hace falta para crear perfiles que de verdad den
    # servicio: sin remote-address el cliente se autentica y se queda sin IP.
    pool_pppoe = Column(String(100))
    # Nombre de la lista de direcciones del firewall donde el router mete a
    # los cortados. No es igual en todos: el de SUCASCO la llama
    # "CORTE MOROSO" (con espacio) y las reglas de redirección miran ese
    # nombre exacto. Si no coincide, el corte no corta nada: la IP entra en
    # una lista que ninguna regla consulta.
    lista_corte = Column(String(100))
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
    # Si se borra la mufa se van sus corridas: no significan nada sin ella.
    corridas = relationship(
        "Corrida",
        back_populates="mufa",
        order_by="Corrida.id",
        cascade="all, delete-orphan",
    )


class Corrida(Base):
    """Un tendido que sale de una mufa y va uniendo cajas NAP.

    El ingeniero las numera (corrida 1, corrida 2), le pone a cada una su
    metraje y le da un color para distinguirlas en el plano. Una mufa puede
    tener varias, y cada una se grafica aparte: antes solo habia un trazado
    por mufa, sin nombre ni metros, todos del mismo color.
    """
    __tablename__ = "corridas"

    id = Column(Integer, primary_key=True, index=True)
    mufa_id = Column(Integer, ForeignKey("mufas.id"), nullable=False, index=True)
    nombre = Column(String(60), nullable=False)
    # Color en hexadecimal (#rrggbb), el mismo que se usa en el plano.
    color = Column(String(9), nullable=False, default="#8754ec")
    # Metros de cable. Se calcula del trazado si no se escribe, pero se puede
    # corregir a mano: el cable no va en linea recta entre poste y poste.
    metros = Column(Float)
    # Lista de puntos [{"lat": ..., "lng": ...}, ...] para graficar.
    trazado = Column(JSON)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    mufa = relationship("Mufa", back_populates="corridas")


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

    @property
    def mufa_codigo(self):
        """El codigo de la mufa, para quien lee la caja y no la base.

        Una zona puede tener varias mufas y cada mufa hasta 16 cajas. Con
        solo el mufa_id, en campo no hay forma de saber de cual cuelga la
        caja que uno tiene delante."""
        return self.mufa.codigo if self.mufa else None


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
    nombre = Column(String(150), nullable=False)  # razón social si es empresa
    tipo_documento = Column(SAEnum(TipoDocumento), default=TipoDocumento.dni, nullable=False)
    # El DNI que genera las credenciales: del titular si es persona, del
    # responsable si es empresa. De aquí salen usuario_pppoe y password_pppoe.
    #
    # Ya NO es único por sí solo: una misma persona puede tener hasta tres
    # líneas a su nombre. Lo único es el par (dni, linea) — ver la
    # UniqueConstraint del final de la clase.
    dni = Column(String(15), index=True)
    # Cuál de sus líneas es esta ficha. 1 es la de siempre; la 2 y la 3 son
    # contrataciones adicionales del mismo titular, y lo único que las
    # distingue de puertas afuera es el sufijo del usuario PPPoE.
    linea = Column(Integer, default=1, nullable=False)
    # Solo para empresas. Tampoco es único, por lo mismo que el DNI: una
    # empresa con dos líneas lo repite.
    ruc = Column(String(11), index=True)
    responsable_nombre = Column(String(150))
    telefono = Column(String(20))
    telefono_whatsapp = Column(String(20))
    direccion = Column(Text)
    lat = Column(Float)
    lng = Column(Float)
    usuario_pppoe = Column(String(100), unique=True, nullable=False)
    password_pppoe = Column(String(100), nullable=False)
    ip_estatica = Column(String(20))
    # Opcional: los clientes satelitales no pertenecen a ninguna zona — su
    # servicio no pasa por un MikroTik ni por una caja NAP. Para fibra e
    # inalámbrico sigue siendo obligatoria, y eso lo valida el esquema.
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True)
    plan_id = Column(Integer, ForeignKey("planes.id"), nullable=False)
    cantidad_tv = Column(Integer, default=0, nullable=False)
    fecha_instalacion = Column(Date)
    fecha_vencimiento = Column(Date)
    pausa_hasta = Column(Date)
    compromiso_pago_hasta = Column(Date)
    estado = Column(SAEnum(EstadoCliente), default=EstadoCliente.pendiente_aprobacion, nullable=False, index=True)
    motivo_rechazo = Column(Text)
    motivo_no_instalado = Column(Text)

    # El cliente venia conectado desde antes de que existiera este sistema, asi
    # que de el no hay caja, borne, equipo ni fotos: nadie los anoto en su
    # momento. Con la marca puesta, la instalacion se deja cerrar con esos
    # datos en blanco en vez de obligar al tecnico a inventarlos.
    #
    # La pone quien registra al cliente desde el panel, nunca el tecnico desde
    # la app: si el tecnico pudiera marcarla, en un mes todas las
    # instalaciones serian migradas y el sistema se quedaria sin fotos ni
    # datos de planta. La excepcion tiene que tener dueno.
    #
    # No se apaga nunca --es de donde salio el cliente, y eso no cambia--. Lo
    # que cambia es si todavia le faltan datos, y eso no es una marca sino una
    # cuenta: se mira la ficha. Una bandera que hay que acordarse de bajar
    # termina siempre encendida.
    migrado = Column(Boolean, default=False, nullable=False, index=True)

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

    __table_args__ = (
        # Dos fichas con el mismo DNI son líneas distintas de la misma
        # persona, nunca la misma línea repetida. Esto es lo que impide que
        # un alta por descuido cree un duplicado: entraría otra vez como
        # línea 1 y chocaría aquí.
        UniqueConstraint("dni", "linea", name="uq_clientes_dni_linea"),
        CheckConstraint("linea >= 1 AND linea <= 3", name="ck_clientes_linea"),
    )


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
    # Para poder contar lo que paso sin que quien mira tenga que cruzar ids
    # a mano: quien la atendio y que equipos se tocaron.
    tecnico_asignado = relationship("Usuario", foreign_keys=[tecnico_asignado_id])
    onu_reemplazada = relationship("Onu", foreign_keys=[onu_reemplazada_id])
    onu_nueva = relationship("Onu", foreign_keys=[onu_nueva_id])


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
    # Un adelanto de varios meses se guarda como un pago por mes (así los
    # informes mensuales siguen cuadrando), pero todos comparten este código
    # para saber que se cobraron juntos y poder emitir un solo recibo.
    grupo_adelanto = Column(String(36), index=True)
    # Rebaja que hizo la empresa por pagar adelantado, en soles. Se guarda
    # solo en el primer pago del grupo: es del cobro completo, no del mes.
    descuento = Column(Float)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    registrado_por = Column(Integer, ForeignKey("usuarios.id"))

    cliente = relationship("Cliente", back_populates="pagos")
    registrador = relationship("Usuario", foreign_keys=[registrado_por])

    __table_args__ = (
        # Un cliente no puede tener dos pagos del mismo mes.
        #
        # El endpoint ya lo comprobaba con un SELECT antes de insertar, pero un
        # SELECT no garantiza nada: dos peticiones a la vez —un doble clic, la
        # cajera reintentando porque el navegador se quedó pensando— pasaban
        # las dos la comprobación y hacían las dos el INSERT. Quedaban dos
        # pagos del mismo mes y la fecha de vencimiento avanzaba DOS meses: un
        # mes regalado y la caja descuadrada contra el informe.
        #
        # Y la ventana era grande: entre el SELECT y el commit el endpoint
        # genera el PDF del recibo y espera a WhatsApp. Segundos.
        #
        # Esta restricción es la que de verdad garantiza. El SELECT se queda
        # solo para dar un mensaje bonito, que es lo que sabe hacer.
        UniqueConstraint("cliente_id", "mes_pagado", name="uq_pagos_cliente_mes"),
    )


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


class EstadoJornada(str, enum.Enum):
    activa = "activa"
    finalizada = "finalizada"


class JornadaVendedor(Base):
    """Una salida a campo de un vendedor_campo — reemplaza el 'mandar ubicación
    en vivo al grupo de WhatsApp' por un registro que el admin puede revisar
    después (WhatsApp no deja historial una vez que se cierra el chat)."""
    __tablename__ = "jornadas_vendedor"

    id = Column(Integer, primary_key=True, index=True)
    vendedor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    zona_id = Column(Integer, ForeignKey("zonas.id"))
    estado = Column(SAEnum(EstadoJornada), nullable=False, default=EstadoJornada.activa, index=True)
    lat_inicio = Column(Float, nullable=False)
    lng_inicio = Column(Float, nullable=False)
    monto_pasaje = Column(Float)  # pasaje del día — variable según zona, a veces no se da
    monto_reclamado = Column(Float)  # lo que el vendedor dice que gastó de su bolsillo
    nota_reclamo = Column(Text)
    reclamo_reintegrado = Column(Boolean, nullable=False, default=False)
    lat_fin = Column(Float)
    lng_fin = Column(Float)
    iniciado_en = Column(DateTime(timezone=True), server_default=func.now())
    finalizado_en = Column(DateTime(timezone=True))

    vendedor = relationship("Usuario")
    zona = relationship("Zona")
    ubicaciones = relationship("UbicacionVendedor", back_populates="jornada", cascade="all, delete-orphan")


class UbicacionVendedor(Base):
    """Un 'ping' de ubicación dentro de una jornada activa — forma el
    recorrido que el admin ve dibujado en el mapa."""
    __tablename__ = "ubicaciones_vendedor"

    id = Column(Integer, primary_key=True, index=True)
    jornada_id = Column(Integer, ForeignKey("jornadas_vendedor.id"), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    registrado_en = Column(DateTime(timezone=True), server_default=func.now())

    jornada = relationship("JornadaVendedor", back_populates="ubicaciones")


class CodigoAccesoCliente(Base):
    """El código de un solo uso que le da al cliente el control de su cuenta.

    Hasta el 2026-11-23 la contraseña de la app del cliente era su DNI
    mientras no la cambiara. Ocho dígitos que están en su recibo, en su
    contrato y en cualquier foto de su documento: quien los tuviera entraba a
    su cuenta y veía su dirección, su teléfono y su historial de pagos. No era
    un descuido, estaba escrito en el código como decisión; pero el DNI no es
    un secreto y por tanto no puede ser una credencial.

    Ahora, para entrar la primera vez —o si olvidó su contraseña— el cliente
    escribe su documento y el sistema le manda un código al WhatsApp que ya
    tiene registrado. Con ese código elige su contraseña. El documento por sí
    solo ya no abre nada: hace falta además el teléfono.

    Hay como máximo una fila por cliente (pedir un código nuevo reemplaza el
    anterior) y se guarda el hash, no el código: si alguien llegara a leer
    esta tabla, no podría usar lo que ve.
    """
    __tablename__ = "codigos_acceso_cliente"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    codigo_hash = Column(String(255), nullable=False)
    expira_en = Column(DateTime(timezone=True), nullable=False)
    # Intentos fallidos con ESTE código. Al pasarse, el código ya no sirve y
    # hay que pedir otro: si no, seis dígitos se adivinan probando.
    intentos = Column(Integer, nullable=False, default=0)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    cliente = relationship("Cliente")

    __table_args__ = (
        UniqueConstraint('cliente_id', name='uq_codigo_acceso_cliente'),
    )


class ConsultaDocumentoMes(Base):
    """Cuántas consultas de nombre se gastaron en un mes. Es una fila por mes,
    no un registro por consulta: así se lleva la cuota sin acumular datos
    personales de gente que no es cliente."""
    __tablename__ = "consultas_documento_mes"

    id = Column(Integer, primary_key=True, index=True)
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    cantidad = Column(Integer, nullable=False, default=0)
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint('anio', 'mes', name='uq_consulta_mes'),)


class Rol(Base):
    """Un rol y lo que lo distingue. `clave` es la llave que usa el sistema;
    `nombre` es lo que se lee en pantalla."""
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(50), nullable=False, unique=True)
    nombre = Column(String(80), nullable=False)
    descripcion = Column(String(255))
    es_superadmin = Column(Boolean, nullable=False, default=False)
    es_sistema = Column(Boolean, nullable=False, default=False)
    # Tipo de cuenta de sus usuarios. Vacío en el rol cliente.
    perfil_base = Column(String(20))
    creado_en = Column(DateTime(timezone=True), server_default=func.now())


class ModuloPadre(Base):
    """Un grupo del menú: Clientes, Red, Finanzas. Cada módulo cuelga de uno."""
    __tablename__ = "modulos_padre"
    __table_args__ = (UniqueConstraint('plataforma', 'nombre', name='uq_modulos_padre_nombre'),)

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(60), nullable=False)
    icono = Column(String(80))
    plataforma = Column(String(10), nullable=False, default="panel")   # panel | movil
    orden = Column(Integer, nullable=False, default=0)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    modulos = relationship("Modulo", back_populates="padre")


class Modulo(Base):
    """Una opción del menú del panel o de la barra inferior de la app."""
    __tablename__ = "modulos"

    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(60), nullable=False, unique=True)
    nombre = Column(String(80), nullable=False)
    modulo_padre_id = Column(Integer, ForeignKey("modulos_padre.id", ondelete="RESTRICT"), nullable=False, index=True)
    plataforma = Column(String(10), nullable=False)   # panel | movil
    audiencia = Column(String(10), nullable=False, default="personal")   # personal | cliente
    ruta = Column(String(120))
    icono = Column(String(80))
    orden = Column(Integer, nullable=False, default=0)
    activo = Column(Boolean, nullable=False, default=True)

    padre = relationship("ModuloPadre", back_populates="modulos")


class RolModulo(Base):
    """Qué módulos tiene cada rol, y cómo se acomodan en su barra."""
    __tablename__ = "rol_modulo"

    rol_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    modulo_id = Column(Integer, ForeignKey("modulos.id", ondelete="CASCADE"), primary_key=True)
    orden = Column(Integer, nullable=False, default=0)
    es_central = Column(Boolean, nullable=False, default=False)


# ── Materiales de fibra ───────────────────────────────────────────────────────
# Lo que sale a campo en una instalacion y no es un equipo con numero de serie.
# Los equipos (la ONU) viven en `onus`, uno por uno; esto se cuenta por
# cantidad.


class Material(Base):
    """Cable drop, tensadores, conectores, rosetas, patch cords."""
    __tablename__ = "materiales"

    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(40), unique=True, nullable=False, index=True)
    nombre = Column(String(80), nullable=False)
    # metro | unidad. Como se cuenta lo que queda.
    unidad = Column(String(10), nullable=False)
    # Si vuelve cuando se retira a un cliente. La roseta y el patch cord si;
    # el cable tendido y los tensadores se quedan en el poste para siempre.
    se_recupera = Column(Boolean, nullable=False, default=False)
    # Cuanto se gasta en una instalacion normal, cuando siempre es igual: una
    # roseta, un patch cord, dos conectores. Vacio = lo dice el tecnico.
    consumo_estandar = Column(Numeric(10, 2))
    activo = Column(Boolean, nullable=False, default=True, index=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    # Foto de presentación del material (cable drop, conector, roseta…). Se
    # guarda la ruta en disco bajo MEDIA_DIR y se sirve solo con sesión.
    foto_ruta = Column(String(500))

    presentaciones = relationship(
        "MaterialPresentacion",
        back_populates="material",
        cascade="all, delete-orphan",
        order_by="MaterialPresentacion.equivale_a.desc()",
    )


class MaterialPresentacion(Base):
    """Como se compra: bobina de 1000 m, rollo de 200, bolsa de 10.

    Se gasta por metro y por unidad, pero se compra por bulto. Sin esto habria
    que traducir a mano cada compra, que es justo donde se cuelan los errores.
    """
    __tablename__ = "material_presentaciones"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materiales.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    nombre = Column(String(60), nullable=False)
    equivale_a = Column(Numeric(10, 2), nullable=False)
    activo = Column(Boolean, nullable=False, default=True)

    material = relationship("Material", back_populates="presentaciones")


class MovimientoMaterial(Base):
    """Todo lo que entra, sale, se gasta o se corrige.

    NINGUN saldo se guarda en una columna: ni el del almacen ni el de cada
    tecnico. Se calculan sumando esta tabla. Un saldo guardado junto a su
    historial son dos numeros que tarde o temprano se contradicen, y entonces
    no se sabe cual creer.

        entrada     proveedor -> almacen    (una compra)
        entrega     almacen   -> tecnico
        consumo     tecnico   -> cliente    (se gasto en una instalacion)
        devolucion  cliente   -> almacen    (roseta y patch cord recuperados)
        ajuste      correccion de un cuadre; el unico que admite negativo
    """
    __tablename__ = "movimientos_material"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materiales.id", ondelete="RESTRICT"),
                         nullable=False, index=True)
    tipo = Column(String(12), nullable=False, index=True)
    cantidad = Column(Numeric(10, 2), nullable=False)
    tecnico_id = Column(Integer, ForeignKey("usuarios.id"), index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), index=True)
    presentacion_id = Column(Integer, ForeignKey("material_presentaciones.id"))
    motivo = Column(String(200))
    registrado_por_id = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    material = relationship("Material")
    tecnico = relationship("Usuario", foreign_keys=[tecnico_id])
    registrado_por = relationship("Usuario", foreign_keys=[registrado_por_id])
    presentacion = relationship("MaterialPresentacion")


# ── El freno de fuerza bruta ──────────────────────────────────────────────────


class FrenoLogin(Base):
    """Los intentos fallidos de entrar, y el castigo cuando se pasan del tope.

    Hasta el 2026-11-26 esto eran dos diccionarios en la memoria del proceso
    (`_intentos` y `_bloqueados` en routers/auth.py). Funcionaba, con dos
    agujeros: un reinicio del backend ponia todos los contadores a cero, y con
    mas de un trabajador de uvicorn el conteo se repartia entre procesos, de
    modo que el tope real pasaba a ser `tope x procesos`. Hallazgo B-6.

    `momentos` guarda el instante de cada fallo reciente, igual que hacia la
    lista en memoria: asi el conteo sigue siendo una ventana deslizante de
    verdad y no un contador que se reinicia a horas en punto. Se poda en cada
    escritura, asi que no crece.

    Los dos instantes van en epoch (segundos, float) y no en DateTime a
    proposito. Es lo que usa el resto del freno (`time.time()`), y evita de
    raiz el problema que destapo N-1: `DateTime(timezone=True)` devuelve la
    zona en PostgreSQL y no en SQLite, asi que comparar fechas de esa columna
    funcionaba en el servidor y reventaba en las pruebas.
    """
    __tablename__ = "freno_login"

    # "<ip>|<usuario>" o "*cuenta*|<usuario>". Lo arma _clave_texto() en auth.py.
    clave = Column(String(200), primary_key=True)
    momentos = Column(JSON, nullable=False, default=list)
    bloqueado_hasta = Column(Float, index=True)
    actualizado_en = Column(Float, nullable=False, index=True)


# ──────────────────────────────────────────────────────────────────────────────
# Unidades vehiculares y combustible
#
# La empresa tiene vehículos (carros/motos) que usan técnicos y vendedoras en
# campo. Cada vez que uno echa combustible registra el monto y dos fotos
# (surtidor + boleta) desde la app; gerencia ve el gasto mensual por unidad.
# ──────────────────────────────────────────────────────────────────────────────

class Unidad(Base):
    __tablename__ = "unidades"

    id = Column(Integer, primary_key=True, index=True)
    placa = Column(String(20), unique=True, nullable=False, index=True)
    marca = Column(String(100))
    modelo = Column(String(100))
    foto_ruta = Column(String(500))
    activo = Column(Boolean, default=True, nullable=False)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    registrado_por = Column(Integer, ForeignKey("usuarios.id"))

    recargas = relationship("RecargaCombustible", back_populates="unidad")


class RecargaCombustible(Base):
    __tablename__ = "recargas_combustible"

    id = Column(Integer, primary_key=True, index=True)
    unidad_id = Column(Integer, ForeignKey("unidades.id"), nullable=False, index=True)
    monto = Column(Float, nullable=False)
    # Fecha de la carga (se fija en el servidor con hora de Lima al registrar).
    fecha = Column(Date, nullable=False, index=True)
    foto_surtidor_ruta = Column(String(500))
    foto_boleta_ruta = Column(String(500))
    nota = Column(Text)
    registrado_por = Column(Integer, ForeignKey("usuarios.id"), index=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    unidad = relationship("Unidad", back_populates="recargas")
