"""Foto de presentación en Materiales

Agrega la columna `foto_ruta` a `materiales` para guardar una foto
representativa del producto (cable drop, tensador, conector, roseta, patch
cord). Es aditiva y opcional: los materiales que ya existen quedan sin foto
(NULL) y se siguen viendo igual.

Nota: la foto de los equipos (ONUs) se retiró del inventario por pedido del
dueño; las fotos de presentación viven solo en Materiales. La columna
`onus.foto_ruta` creada en la migración anterior se deja como está para no
hacer un cambio destructivo en la base; queda sin uso.

Revision ID: a1b7c3e9d2f4
Revises: e9f2a7c4d1b8
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b7c3e9d2f4'
down_revision = 'e9f2a7c4d1b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('materiales', sa.Column('foto_ruta', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('materiales', 'foto_ruta')
