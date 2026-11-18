"""Marca de cliente migrado

El cliente que ya estaba conectado antes de que existiera este sistema no
tiene caja, borne, equipo ni fotos — nadie los anotó en su momento. Con esta
marca la instalación se deja cerrar con esos datos en blanco, en vez de
obligar al técnico a inventarlos para poder seguir.

Arranca apagada para todos, que es lo correcto: los clientes que ya están en
el sistema entraron por el flujo completo, y los nuevos tienen que seguir
entrando así.

Revision ID: c3f1a8d27b45
Revises: b7c4e2a19f31
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3f1a8d27b45'
down_revision = 'b7c4e2a19f31'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default para que las filas que ya existen queden en false sin
    # tener que recorrerlas: sin él, un NOT NULL sobre una tabla con datos
    # falla en seco.
    op.add_column(
        'clientes',
        sa.Column('migrado', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f('ix_clientes_migrado'), 'clientes', ['migrado'])
    # Una vez rellenadas, el valor lo pone la aplicación.
    op.alter_column('clientes', 'migrado', server_default=None)


def downgrade() -> None:
    op.drop_index(op.f('ix_clientes_migrado'), table_name='clientes')
    op.drop_column('clientes', 'migrado')
