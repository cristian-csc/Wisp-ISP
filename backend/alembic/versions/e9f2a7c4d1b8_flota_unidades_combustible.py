"""Flota: unidades vehiculares y combustible

Crea las tablas `unidades` (carros/motos con placa, marca, modelo y foto) y
`recargas_combustible` (cada carga con monto y dos fotos: surtidor y boleta),
agrega la columna `foto_ruta` al inventario de equipos (ONUs), y mete al menú
del panel un grupo nuevo «Flota» con los módulos Unidades y Combustible, solo
para el administrador.

El grupo entra en el orden 7 (entre Finanzas y Administración), empujando a
Administración un lugar para que quede al final como siempre.

Revision ID: e9f2a7c4d1b8
Revises: c3d9e5a84b12
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'e9f2a7c4d1b8'
down_revision = 'c3d9e5a84b12'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tablas ────────────────────────────────────────────────────────────────
    op.create_table(
        'unidades',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('placa', sa.String(length=20), nullable=False),
        sa.Column('marca', sa.String(length=100), nullable=True),
        sa.Column('modelo', sa.String(length=100), nullable=True),
        sa.Column('foto_ruta', sa.String(length=500), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('registrado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.UniqueConstraint('placa', name='uq_unidades_placa'),
    )
    op.create_index('ix_unidades_placa', 'unidades', ['placa'])

    op.create_table(
        'recargas_combustible',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('unidad_id', sa.Integer(), sa.ForeignKey('unidades.id'), nullable=False),
        sa.Column('monto', sa.Float(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('foto_surtidor_ruta', sa.String(length=500), nullable=True),
        sa.Column('foto_boleta_ruta', sa.String(length=500), nullable=True),
        sa.Column('nota', sa.Text(), nullable=True),
        sa.Column('registrado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_recargas_combustible_unidad_id', 'recargas_combustible', ['unidad_id'])
    op.create_index('ix_recargas_combustible_fecha', 'recargas_combustible', ['fecha'])
    op.create_index('ix_recargas_combustible_registrado_por', 'recargas_combustible', ['registrado_por'])

    # Foto del equipo en el inventario de ONUs.
    op.add_column('onus', sa.Column('foto_ruta', sa.String(length=500), nullable=True))

    # ── Menú del panel ────────────────────────────────────────────────────────
    conn = op.get_bind()
    # Hacer sitio: Administración (7) pasa a 8 para que «Flota» entre en 7.
    conn.execute(sa.text(
        "UPDATE modulos_padre SET orden = orden + 1 "
        "WHERE plataforma = 'panel' AND orden >= 7"
    ))
    conn.execute(sa.text(
        "INSERT INTO modulos_padre (nombre, icono, plataforma, orden) "
        "VALUES ('Flota', 'solar:bus-linear', 'panel', 7)"
    ))
    # Módulos hijos.
    conn.execute(sa.text("""
        INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
        SELECT 'panel.unidades', 'Unidades', p.id, 'panel', 'personal',
               '/unidades', 'solar:bus-linear',
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos WHERE plataforma = 'panel')
        FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Flota'
    """))
    conn.execute(sa.text("""
        INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
        SELECT 'panel.combustible', 'Combustible', p.id, 'panel', 'personal',
               '/combustible', 'solar:gas-station-linear',
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos WHERE plataforma = 'panel')
        FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Flota'
    """))
    # Se los asigna al administrador.
    conn.execute(sa.text("""
        INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
        SELECT r.id, m.id,
               (SELECT COALESCE(MAX(rm.orden), 0) + 1 FROM rol_modulo rm WHERE rm.rol_id = r.id),
               false
        FROM roles r, modulos m
        WHERE r.clave = 'admin' AND m.clave IN ('panel.unidades', 'panel.combustible')
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM rol_modulo WHERE modulo_id IN "
        "(SELECT id FROM modulos WHERE clave IN ('panel.unidades', 'panel.combustible'))"
    ))
    conn.execute(sa.text(
        "DELETE FROM modulos WHERE clave IN ('panel.unidades', 'panel.combustible')"
    ))
    conn.execute(sa.text(
        "DELETE FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Flota'"
    ))
    conn.execute(sa.text(
        "UPDATE modulos_padre SET orden = orden - 1 "
        "WHERE plataforma = 'panel' AND orden >= 8"
    ))

    op.drop_column('onus', 'foto_ruta')
    op.drop_index('ix_recargas_combustible_registrado_por', table_name='recargas_combustible')
    op.drop_index('ix_recargas_combustible_fecha', table_name='recargas_combustible')
    op.drop_index('ix_recargas_combustible_unidad_id', table_name='recargas_combustible')
    op.drop_table('recargas_combustible')
    op.drop_index('ix_unidades_placa', table_name='unidades')
    op.drop_table('unidades')
