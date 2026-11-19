"""Módulos padre: los grupos del menú pasan a tener su propia tabla

Hasta ahora el grupo era un texto repetido en cada módulo. Con la tabla
`modulos_padre` cada grupo tiene nombre, icono y orden propios, y se puede
administrar desde el panel sin programar.

Los grupos se crean a partir de los que ya existían, en el mismo orden, así que
nadie gana ni pierde acceso. También se agrega el módulo que abre la pantalla
de administración, solo para el administrador.

Revision ID: f3a8c1d6e724
Revises: e2f7b5c8d310
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a8c1d6e724'
down_revision = 'e2f7b5c8d310'
branch_labels = None
depends_on = None


ICONOS = {
    ('panel', 'Principal'): 'solar:home-2-linear',
    ('panel', 'Clientes'): 'solar:users-group-rounded-linear',
    ('panel', 'Red'): 'solar:global-linear',
    ('panel', 'Operaciones'): 'solar:clipboard-list-linear',
    ('panel', 'Finanzas'): 'solar:wallet-2-linear',
    ('panel', 'Administración'): 'solar:settings-linear',
    ('movil', 'Trabajo de campo'): 'construct-outline',
    ('movil', 'Ventas'): 'storefront-outline',
    ('movil', 'App del cliente'): 'phone-portrait-outline',
}


def upgrade() -> None:
    padres = op.create_table(
        'modulos_padre',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(60), nullable=False),
        sa.Column('icono', sa.String(80)),
        sa.Column('plataforma', sa.String(10), nullable=False, server_default='panel'),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('plataforma', 'nombre', name='uq_modulos_padre_nombre'),
        sa.CheckConstraint("plataforma IN ('panel', 'movil')", name='ck_modulos_padre_plataforma'),
    )

    conn = op.get_bind()
    grupos = conn.execute(sa.text(
        'SELECT plataforma, grupo, MIN(orden) AS primero FROM modulos '
        'GROUP BY plataforma, grupo ORDER BY plataforma, primero'
    )).fetchall()
    posicion = {}
    filas = []
    for plataforma, grupo, _ in grupos:
        posicion[plataforma] = posicion.get(plataforma, 0) + 1
        filas.append({
            'nombre': grupo,
            'icono': ICONOS.get((plataforma, grupo)),
            'plataforma': plataforma,
            'orden': posicion[plataforma],
        })
    op.bulk_insert(padres, filas)

    op.add_column('modulos', sa.Column('modulo_padre_id', sa.Integer()))
    op.execute(
        'UPDATE modulos m SET modulo_padre_id = p.id FROM modulos_padre p '
        'WHERE p.plataforma = m.plataforma AND p.nombre = m.grupo'
    )
    op.alter_column('modulos', 'modulo_padre_id', nullable=False)
    op.create_foreign_key(
        'fk_modulos_modulo_padre', 'modulos', 'modulos_padre',
        ['modulo_padre_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_modulos_modulo_padre_id', 'modulos', ['modulo_padre_id'])
    op.drop_column('modulos', 'grupo')

    op.execute("""
        INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
        SELECT 'panel.modulos_padre', 'Módulos padre', p.id, 'panel', 'personal',
               '/configuracion/modulos-padre', 'solar:folder-with-files-linear',
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos WHERE plataforma = 'panel')
        FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Administración'
    """)
    op.execute("""
        INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
        SELECT r.id, m.id,
               (SELECT COALESCE(MAX(rm.orden), 0) + 1 FROM rol_modulo rm WHERE rm.rol_id = r.id),
               false
        FROM roles r, modulos m
        WHERE r.clave = 'admin' AND m.clave = 'panel.modulos_padre'
    """)


def downgrade() -> None:
    op.execute("DELETE FROM modulos WHERE clave = 'panel.modulos_padre'")
    op.add_column('modulos', sa.Column('grupo', sa.String(60)))
    op.execute('UPDATE modulos m SET grupo = p.nombre FROM modulos_padre p WHERE p.id = m.modulo_padre_id')
    op.alter_column('modulos', 'grupo', nullable=False)
    op.drop_index('ix_modulos_modulo_padre_id', table_name='modulos')
    op.drop_constraint('fk_modulos_modulo_padre', 'modulos', type_='foreignkey')
    op.drop_column('modulos', 'modulo_padre_id')
    op.drop_table('modulos_padre')
