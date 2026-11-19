"""Historial de ONUs: cada alta, entrega, instalación, retiro o daño

Hasta ahora la ONU solo guardaba dónde estaba; de cómo llegó ahí no quedaba
nada. Se crea `onu_movimientos` y se reconstruye lo que se puede saber de las
ONUs que ya existen: su alta, la entrega al técnico que la tiene y la
instalación en el cliente donde está, con sus fechas. Esas filas no tienen
"registrado por": nadie las anotó en su momento.

También se normalizan las MAC guardadas al formato AA:BB:CC:DD:EE:FF.

Revision ID: d7e2a5b1c468
Revises: c6d1f4a0b357
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'd7e2a5b1c468'
down_revision = 'c6d1f4a0b357'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'onu_movimientos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('onu_id', sa.Integer(), sa.ForeignKey('onus.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tipo', sa.String(20), nullable=False),
        sa.Column('estado_anterior', sa.String(30)),
        sa.Column('estado_nuevo', sa.String(30), nullable=False),
        sa.Column('persona_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='SET NULL')),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='SET NULL')),
        sa.Column('nota', sa.String(255)),
        sa.Column('registrado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='SET NULL')),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ('onu_id', 'tipo', 'persona_id', 'cliente_id', 'registrado_por_id', 'creado_en'):
        op.create_index(f'ix_onu_movimientos_{col}', 'onu_movimientos', [col])

    # Lo que se sabe del pasado de cada ONU.
    op.execute("""
        INSERT INTO onu_movimientos (onu_id, tipo, estado_nuevo, nota, creado_en)
        SELECT id, 'alta', 'en_almacen', 'Registrada antes de que existiera el historial', COALESCE(creado_en, now())
        FROM onus
    """)
    op.execute("""
        INSERT INTO onu_movimientos (onu_id, tipo, estado_anterior, estado_nuevo, persona_id, creado_en)
        SELECT id, 'asignacion', 'en_almacen', 'asignado_tecnico', tecnico_id,
               GREATEST(COALESCE(fecha_asignacion_tecnico::timestamptz, creado_en, now()), COALESCE(creado_en, now()) + interval '1 second')
        FROM onus WHERE tecnico_id IS NOT NULL
    """)
    op.execute("""
        INSERT INTO onu_movimientos (onu_id, tipo, estado_anterior, estado_nuevo, persona_id, cliente_id, creado_en)
        SELECT id, 'instalacion', 'asignado_tecnico', 'instalado', tecnico_id, cliente_id,
               GREATEST(COALESCE(fecha_instalacion::timestamptz, creado_en, now()), COALESCE(creado_en, now()) + interval '2 seconds')
        FROM onus WHERE estado = 'instalado' AND cliente_id IS NOT NULL
    """)
    op.execute("""
        INSERT INTO onu_movimientos (onu_id, tipo, estado_anterior, estado_nuevo, persona_id, creado_en)
        SELECT id, CASE estado WHEN 'danado' THEN 'danada' ELSE 'perdida' END, NULL, estado::text, tecnico_id,
               COALESCE(creado_en, now()) + interval '3 seconds'
        FROM onus WHERE estado IN ('danado', 'perdido')
    """)

    # MAC con un solo formato, para que la búsqueda y el control de repetidas funcionen.
    op.execute("""
        UPDATE onus SET mac = regexp_replace(upper(regexp_replace(mac, '[^0-9A-Fa-f]', '', 'g')), '(..)(?!$)', '\\1:', 'g')
        WHERE mac IS NOT NULL AND length(regexp_replace(mac, '[^0-9A-Fa-f]', '', 'g')) = 12
    """)


def downgrade() -> None:
    op.drop_table('onu_movimientos')
