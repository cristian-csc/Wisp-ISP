"""Inventario: materiales con stock, mínimo y movimientos por persona

Crea el módulo padre "Inventario" en el panel con tres módulos nuevos (stock,
entradas y salidas, material del personal) y mueve ahí el inventario de ONUs,
que hasta ahora vivía en "Red". Los roles que ya tenían las ONUs las siguen
teniendo; los módulos nuevos se le dan solo al administrador, que puede
delegarlos desde Roles y módulos.

Revision ID: a4b9d2e8f135
Revises: f3a8c1d6e724
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'a4b9d2e8f135'
down_revision = 'f3a8c1d6e724'
branch_labels = None
depends_on = None

TIPOS = ('entrada', 'salida', 'asignacion', 'devolucion', 'consumo', 'ajuste')

CATEGORIAS = [
    ('Equipos de red', 'solar:server-square-linear'),
    ('Cableado UTP y RJ45', 'solar:plug-circle-linear'),
    ('Fibra óptica', 'solar:link-round-angle-linear'),
    ('Herramientas', 'solar:sledgehammer-linear'),
    ('Accesorios y consumibles', 'solar:paperclip-linear'),
]

MODULOS = [
    ('panel.inventario', 'Stock de materiales', '/inventario', 'solar:box-minimalistic-linear'),
    ('panel.inventario_movimientos', 'Entradas y salidas', '/inventario/movimientos', 'solar:transfer-vertical-linear'),
    ('panel.inventario_personal', 'Material del personal', '/inventario/personal', 'solar:users-group-two-rounded-linear'),
]


def upgrade() -> None:
    categorias = op.create_table(
        'inventario_categorias',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(60), nullable=False, unique=True),
        sa.Column('icono', sa.String(80)),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
    )
    op.bulk_insert(categorias, [
        {'nombre': n, 'icono': i, 'orden': k} for k, (n, i) in enumerate(CATEGORIAS, start=1)
    ])

    op.create_table(
        'inventario_articulos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(40), nullable=False),
        sa.Column('nombre', sa.String(120), nullable=False),
        sa.Column('categoria_id', sa.Integer(), sa.ForeignKey('inventario_categorias.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('marca', sa.String(80)),
        sa.Column('modelo', sa.String(80)),
        sa.Column('unidad', sa.String(20), nullable=False, server_default='unidad'),
        sa.Column('stock', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('stock_minimo', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('costo_unitario', sa.Float()),
        sa.Column('ubicacion', sa.String(80)),
        sa.Column('descripcion', sa.Text()),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint('stock >= 0', name='ck_inventario_stock_no_negativo'),
        sa.CheckConstraint('stock_minimo >= 0', name='ck_inventario_minimo_no_negativo'),
    )
    op.create_index('ix_inventario_articulos_codigo', 'inventario_articulos', ['codigo'], unique=True)
    op.create_index('ix_inventario_articulos_categoria_id', 'inventario_articulos', ['categoria_id'])

    op.create_table(
        'inventario_movimientos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('articulo_id', sa.Integer(), sa.ForeignKey('inventario_articulos.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('tipo', sa.Enum(*TIPOS, name='tipomovimientoinventario'), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False),
        sa.Column('stock_resultante', sa.Integer(), nullable=False),
        sa.Column('persona_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='RESTRICT')),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='SET NULL')),
        sa.Column('motivo', sa.String(255)),
        sa.Column('documento', sa.String(60)),
        sa.Column('lote', sa.String(36)),
        sa.Column('registrado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ('articulo_id', 'tipo', 'persona_id', 'cliente_id', 'lote', 'registrado_por_id', 'creado_en'):
        op.create_index(f'ix_inventario_movimientos_{col}', 'inventario_movimientos', [col])

    # ── Módulo padre y módulos ──────────────────────────────────────────────
    # "Inventario" va justo después de "Red".
    op.execute("""
        UPDATE modulos_padre SET orden = orden + 1
        WHERE plataforma = 'panel'
          AND orden > (SELECT orden FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Red')
    """)
    op.execute("""
        INSERT INTO modulos_padre (nombre, icono, plataforma, orden)
        SELECT 'Inventario', 'solar:box-linear', 'panel', orden + 1
        FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Red'
    """)
    op.execute("""
        UPDATE modulos SET modulo_padre_id = (
            SELECT id FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Inventario'
        ) WHERE clave = 'panel.onus'
    """)

    # Los nuevos quedan antes que las ONUs, en el orden global y en el del admin.
    op.execute("UPDATE modulos SET orden = orden + 3 WHERE orden >= (SELECT orden FROM modulos WHERE clave = 'panel.onus')")
    op.execute("""
        UPDATE rol_modulo rm SET orden = rm.orden + 3
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden >= (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                           WHERE x.rol_id = r.id AND m.clave = 'panel.onus')
    """)
    for k, (clave, nombre, ruta, icono) in enumerate(MODULOS):
        op.execute(sa.text("""
            INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
            SELECT :clave, :nombre, p.id, 'panel', 'personal', :ruta, :icono,
                   (SELECT orden FROM modulos WHERE clave = 'panel.onus') - 3 + :k
            FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Inventario'
        """).bindparams(clave=clave, nombre=nombre, ruta=ruta, icono=icono, k=k))
        op.execute(sa.text("""
            INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
            SELECT r.id, m.id,
                   COALESCE((SELECT x.orden FROM rol_modulo x JOIN modulos o ON o.id = x.modulo_id
                             WHERE x.rol_id = r.id AND o.clave = 'panel.onus') - 3 + :k,
                            (SELECT COALESCE(MAX(x.orden), 0) + 1 FROM rol_modulo x WHERE x.rol_id = r.id)),
                   false
            FROM roles r, modulos m
            WHERE r.clave = 'admin' AND m.clave = :clave
        """).bindparams(clave=clave, k=k))


def downgrade() -> None:
    # Se cierra el hueco que dejan los tres módulos, en el orden global y en el del admin.
    op.execute("""
        UPDATE rol_modulo rm SET orden = rm.orden - 3
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden > (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                          WHERE x.rol_id = r.id AND m.clave = 'panel.inventario_personal')
    """)
    op.execute("UPDATE modulos SET orden = orden - 3 WHERE orden > (SELECT orden FROM modulos WHERE clave = 'panel.inventario_personal')")
    op.execute("DELETE FROM modulos WHERE clave IN ('panel.inventario', 'panel.inventario_movimientos', 'panel.inventario_personal')")
    op.execute("""
        UPDATE modulos SET modulo_padre_id = (
            SELECT id FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Red'
        ) WHERE clave = 'panel.onus'
    """)
    # Si alguien colgó otros módulos de Inventario, vuelven a Red antes de borrarlo.
    op.execute("""
        UPDATE modulos SET modulo_padre_id = (
            SELECT id FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Red'
        ) WHERE modulo_padre_id = (SELECT id FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Inventario')
    """)
    op.execute("""
        UPDATE modulos_padre SET orden = orden - 1
        WHERE plataforma = 'panel'
          AND orden > (SELECT orden FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Inventario')
    """)
    op.execute("DELETE FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Inventario'")

    op.drop_table('inventario_movimientos')
    op.drop_table('inventario_articulos')
    op.drop_table('inventario_categorias')
    sa.Enum(name='tipomovimientoinventario').drop(op.get_bind(), checkfirst=True)
