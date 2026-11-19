"""Inventario: unidades de medida en tabla y piezas con etiqueta propia

- `inventario_unidades`: unidad, metro, rollo… administrables desde el panel.
  Los materiales pasan de un texto a apuntar a esta tabla.
- `inventario_activos`: cada pieza de un equipo o herramienta con su código
  para el sticker (ACT-000123). Los movimientos guardan la pieza exacta.
- Módulo "Unidades de medida" dentro de Inventario, para el administrador.

Revision ID: b5c0e3f9a246
Revises: a4b9d2e8f135
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'b5c0e3f9a246'
down_revision = 'a4b9d2e8f135'
branch_labels = None
depends_on = None

UNIDADES = [
    ('unidad', 'unidades', 'und'),
    ('metro', 'metros', 'm'),
    ('rollo', 'rollos', 'rll'),
    ('caja', 'cajas', 'cja'),
    ('par', 'pares', 'par'),
    ('paquete', 'paquetes', 'paq'),
]
ESTADOS = ('almacen', 'asignado', 'usado', 'baja')


def upgrade() -> None:
    unidades = op.create_table(
        'inventario_unidades',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(30), nullable=False, unique=True),
        sa.Column('plural', sa.String(30), nullable=False),
        sa.Column('abreviatura', sa.String(10), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.bulk_insert(unidades, [{'nombre': n, 'plural': p, 'abreviatura': a} for n, p, a in UNIDADES])

    op.add_column('inventario_articulos', sa.Column('unidad_id', sa.Integer()))
    op.execute("""
        UPDATE inventario_articulos a SET unidad_id = u.id
        FROM inventario_unidades u WHERE u.nombre = a.unidad
    """)
    op.execute("""
        UPDATE inventario_articulos SET unidad_id = (SELECT id FROM inventario_unidades WHERE nombre = 'unidad')
        WHERE unidad_id IS NULL
    """)
    op.alter_column('inventario_articulos', 'unidad_id', nullable=False)
    op.create_foreign_key('fk_inventario_articulos_unidad', 'inventario_articulos', 'inventario_unidades',
                          ['unidad_id'], ['id'], ondelete='RESTRICT')
    op.create_index('ix_inventario_articulos_unidad_id', 'inventario_articulos', ['unidad_id'])
    op.drop_column('inventario_articulos', 'unidad')
    op.add_column('inventario_articulos', sa.Column('controla_por_unidad', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'inventario_activos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(20), nullable=False),
        sa.Column('articulo_id', sa.Integer(), sa.ForeignKey('inventario_articulos.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('numero_serie', sa.String(100)),
        sa.Column('estado', sa.Enum(*ESTADOS, name='estadoactivo'), nullable=False, server_default='almacen'),
        sa.Column('persona_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='RESTRICT')),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='SET NULL')),
        sa.Column('notas', sa.String(255)),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_inventario_activos_codigo', 'inventario_activos', ['codigo'], unique=True)
    for col in ('articulo_id', 'numero_serie', 'estado', 'persona_id', 'cliente_id'):
        op.create_index(f'ix_inventario_activos_{col}', 'inventario_activos', [col])

    op.add_column('inventario_movimientos', sa.Column(
        'activo_id', sa.Integer(), sa.ForeignKey('inventario_activos.id', ondelete='RESTRICT', name='fk_inventario_movimientos_activo'),
    ))
    op.create_index('ix_inventario_movimientos_activo_id', 'inventario_movimientos', ['activo_id'])

    # Módulo nuevo, antes de las ONUs, solo para el administrador.
    op.execute("UPDATE modulos SET orden = orden + 1 WHERE orden >= (SELECT orden FROM modulos WHERE clave = 'panel.onus')")
    op.execute("""
        UPDATE rol_modulo rm SET orden = rm.orden + 1
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden >= (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                           WHERE x.rol_id = r.id AND m.clave = 'panel.onus')
    """)
    op.execute("""
        INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
        SELECT 'panel.inventario_unidades', 'Unidades de medida', p.id, 'panel', 'personal',
               '/inventario/unidades', 'solar:ruler-linear',
               (SELECT orden FROM modulos WHERE clave = 'panel.onus') - 1
        FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Inventario'
    """)
    op.execute("""
        INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
        SELECT r.id, m.id,
               COALESCE((SELECT x.orden FROM rol_modulo x JOIN modulos o ON o.id = x.modulo_id
                         WHERE x.rol_id = r.id AND o.clave = 'panel.onus') - 1,
                        (SELECT COALESCE(MAX(x.orden), 0) + 1 FROM rol_modulo x WHERE x.rol_id = r.id)),
               false
        FROM roles r, modulos m
        WHERE r.clave = 'admin' AND m.clave = 'panel.inventario_unidades'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE rol_modulo rm SET orden = rm.orden - 1
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden > (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                          WHERE x.rol_id = r.id AND m.clave = 'panel.inventario_unidades')
    """)
    op.execute("UPDATE modulos SET orden = orden - 1 WHERE orden > (SELECT orden FROM modulos WHERE clave = 'panel.inventario_unidades')")
    op.execute("DELETE FROM modulos WHERE clave = 'panel.inventario_unidades'")

    op.drop_index('ix_inventario_movimientos_activo_id', table_name='inventario_movimientos')
    op.drop_constraint('fk_inventario_movimientos_activo', 'inventario_movimientos', type_='foreignkey')
    op.drop_column('inventario_movimientos', 'activo_id')
    op.drop_table('inventario_activos')
    sa.Enum(name='estadoactivo').drop(op.get_bind(), checkfirst=True)

    op.drop_column('inventario_articulos', 'controla_por_unidad')
    op.add_column('inventario_articulos', sa.Column('unidad', sa.String(20), nullable=False, server_default='unidad'))
    op.execute("""
        UPDATE inventario_articulos a SET unidad = u.nombre
        FROM inventario_unidades u WHERE u.id = a.unidad_id
    """)
    op.drop_index('ix_inventario_articulos_unidad_id', table_name='inventario_articulos')
    op.drop_constraint('fk_inventario_articulos_unidad', 'inventario_articulos', type_='foreignkey')
    op.drop_column('inventario_articulos', 'unidad_id')
    op.drop_table('inventario_unidades')
