"""Roles y módulos: quién ve qué, guardado en la base

Hasta hoy los módulos de cada rol estaban escritos en el código: el menú del
panel en sidebaritems.ts y las barras de la app en TecnicoNav y VendedorNav.
Estas tablas guardan ese mismo reparto para poder cambiarlo sin programar.

La carga inicial copia exactamente lo que cada rol ve hoy, así que nadie gana
ni pierde acceso con esta migración. Los permisos reales de la API siguen
saliendo de require_roles() hasta que se conecten en un paso posterior.

`cliente` es un rol más en esta tabla aunque no exista en el enum RolUsuario:
los clientes entran con su DNI y no son filas de `usuarios`.

Revision ID: d1e6a4b7c209
Revises: c3f1a8d27b45
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'd1e6a4b7c209'
down_revision = 'c3f1a8d27b45'
branch_labels = None
depends_on = None


ROLES = [
    ('admin', 'Administrador', 'Control total del sistema.', True),
    ('tecnico', 'Técnico', 'Instala, atiende averías y retira equipos en campo.', False),
    ('vendedor_campo', 'Vendedor de campo', 'Registra clientes nuevos durante su jornada.', False),
    ('atencion_cliente', 'Atención al cliente', 'Atiende en caja y mostrador.', False),
    ('cliente', 'Cliente', 'Consulta su servicio y sus pagos desde la app.', False),
]

A = 'admin'
C = 'atencion_cliente'

# clave, nombre, grupo, ruta, icono, roles
PANEL = [
    ('panel.dashboard', 'Dashboard', 'Principal', '/dashboard', 'solar:widget-2-linear', [A, 'tecnico', 'vendedor_campo', C]),
    ('panel.clientes_fibra', 'Clientes Fibra', 'Clientes', '/clientes/fibra', 'solar:users-group-rounded-linear', [A, C]),
    ('panel.clientes_inalambricos', 'Clientes Inalámbricos', 'Clientes', '/clientes/inalambricos', 'solar:wi-fi-router-minimalistic-linear', [A, C]),
    ('panel.clientes_satelital', 'Clientes Satelital', 'Clientes', '/clientes-satelital', 'solar:satellite-linear', [A, C]),
    ('panel.clientes_pendientes', 'Pendientes de aprobación', 'Clientes', '/clientes/pendientes', 'solar:clock-circle-linear', [A]),
    ('panel.zonas', 'Zonas', 'Red', '/zonas', 'solar:map-point-linear', [A, C]),
    ('panel.cajas_nap', 'Cajas NAP', 'Red', '/cajas-nap', 'solar:box-linear', [A]),
    ('panel.onus', 'Inventario de ONUs', 'Red', '/onus', 'solar:cpu-bolt-linear', [A, C]),
    ('panel.averias', 'Averías', 'Operaciones', '/averias', 'solar:danger-triangle-linear', [A, C]),
    ('panel.ordenes_retiro', 'Órdenes de retiro', 'Operaciones', '/ordenes-retiro', 'solar:box-minimalistic-linear', [A, C]),
    ('panel.jornadas', 'Seguimiento de vendedoras', 'Operaciones', '/jornadas', 'solar:routing-2-linear', [A]),
    ('panel.pagos', 'Pagos', 'Finanzas', '/pagos', 'solar:banknote-2-linear', [A, C]),
    ('panel.gastos', 'Gastos', 'Finanzas', '/gastos', 'solar:wallet-money-linear', [A]),
    ('panel.reporte_caja', 'Reporte de Caja', 'Finanzas', '/finanzas/reporte-caja', 'solar:chart-2-linear', [A]),
    ('panel.usuarios', 'Usuarios', 'Administración', '/usuarios', 'solar:user-circle-linear', [A]),
    ('panel.planes', 'Planes', 'Administración', '/planes', 'solar:document-text-linear', [A]),
    ('panel.whatsapp', 'WhatsApp', 'Administración', '/configuracion/whatsapp', 'solar:chat-round-linear', [A]),
    ('panel.roles', 'Roles y módulos', 'Administración', '/configuracion/roles', 'solar:shield-user-linear', [A]),
]

# clave, nombre, grupo, icono, audiencia
MOVIL = [
    ('movil.ordenes', 'Órdenes', 'Trabajo de campo', 'reader-outline', 'personal'),
    ('movil.averias', 'Averías', 'Trabajo de campo', 'build-outline', 'personal'),
    ('movil.retiros', 'Retiros', 'Trabajo de campo', 'arrow-undo-outline', 'personal'),
    ('movil.inventario', 'Inventario', 'Trabajo de campo', 'cube-outline', 'personal'),
    ('movil.registrar', 'Registrar', 'Ventas', 'person-add-outline', 'personal'),
    ('movil.jornada', 'Jornada', 'Ventas', 'walk-outline', 'personal'),
    ('movil.mis_clientes', 'Mis clientes', 'Ventas', 'people-outline', 'personal'),
    ('movil.inicio', 'Inicio', 'App del cliente', 'home-outline', 'cliente'),
    ('movil.pagos', 'Pagos', 'App del cliente', 'card-outline', 'cliente'),
    ('movil.perfil', 'Perfil', 'App del cliente', 'person-circle-outline', 'cliente'),
]

# Barra inferior de cada rol, de izquierda a derecha. El módulo central es el
# botón grande del medio.
BARRAS = {
    'tecnico': (['movil.averias', 'movil.retiros', 'movil.ordenes', 'movil.inventario', 'movil.registrar'], 'movil.ordenes'),
    'vendedor_campo': (['movil.jornada', 'movil.registrar', 'movil.mis_clientes'], 'movil.registrar'),
    'cliente': (['movil.inicio', 'movil.pagos', 'movil.perfil'], None),
}


def upgrade() -> None:
    roles = op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clave', sa.String(50), nullable=False),
        sa.Column('nombre', sa.String(80), nullable=False),
        sa.Column('descripcion', sa.String(255)),
        sa.Column('es_superadmin', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('es_sistema', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('clave', name='uq_roles_clave'),
    )
    modulos = op.create_table(
        'modulos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clave', sa.String(60), nullable=False),
        sa.Column('nombre', sa.String(80), nullable=False),
        sa.Column('grupo', sa.String(60), nullable=False),
        sa.Column('plataforma', sa.String(10), nullable=False),
        sa.Column('audiencia', sa.String(10), nullable=False, server_default='personal'),
        sa.Column('ruta', sa.String(120)),
        sa.Column('icono', sa.String(80)),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('clave', name='uq_modulos_clave'),
        sa.CheckConstraint("plataforma IN ('panel', 'movil')", name='ck_modulos_plataforma'),
        sa.CheckConstraint("audiencia IN ('personal', 'cliente')", name='ck_modulos_audiencia'),
    )
    rol_modulo = op.create_table(
        'rol_modulo',
        sa.Column('rol_id', sa.Integer(), sa.ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('modulo_id', sa.Integer(), sa.ForeignKey('modulos.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('es_central', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # La barra de cada rol tiene un solo botón grande.
    op.create_index(
        'uq_rol_modulo_central', 'rol_modulo', ['rol_id'],
        unique=True, postgresql_where=sa.text('es_central'),
    )

    op.bulk_insert(roles, [
        {'clave': c, 'nombre': n, 'descripcion': d, 'es_superadmin': s, 'es_sistema': True}
        for c, n, d, s in ROLES
    ])
    op.bulk_insert(modulos, [
        {'clave': c, 'nombre': n, 'grupo': g, 'plataforma': 'panel', 'audiencia': 'personal',
         'ruta': r, 'icono': i, 'orden': orden}
        for orden, (c, n, g, r, i, _) in enumerate(PANEL, start=1)
    ] + [
        {'clave': c, 'nombre': n, 'grupo': g, 'plataforma': 'movil', 'audiencia': a,
         'ruta': None, 'icono': i, 'orden': orden}
        for orden, (c, n, g, i, a) in enumerate(MOVIL, start=1)
    ])

    conn = op.get_bind()
    id_rol = {clave: id_ for id_, clave in conn.execute(sa.text('SELECT id, clave FROM roles'))}
    id_modulo = {clave: id_ for id_, clave in conn.execute(sa.text('SELECT id, clave FROM modulos'))}

    filas = [
        {'rol_id': id_rol[rol], 'modulo_id': id_modulo[clave], 'orden': orden, 'es_central': False}
        for orden, (clave, _, _, _, _, permitidos) in enumerate(PANEL, start=1)
        for rol in permitidos
    ]
    for rol, (barra, central) in BARRAS.items():
        filas += [
            {'rol_id': id_rol[rol], 'modulo_id': id_modulo[clave], 'orden': orden, 'es_central': clave == central}
            for orden, clave in enumerate(barra, start=1)
        ]
    op.bulk_insert(rol_modulo, filas)


def downgrade() -> None:
    op.drop_index('uq_rol_modulo_central', table_name='rol_modulo')
    op.drop_table('rol_modulo')
    op.drop_table('modulos')
    op.drop_table('roles')
