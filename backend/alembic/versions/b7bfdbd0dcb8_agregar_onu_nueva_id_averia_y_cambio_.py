"""agregar_onu_nueva_id_averia_y_cambio_onu_historial

Revision ID: b7bfdbd0dcb8
Revises: d9bf52463da4
Create Date: 2026-10-05 09:48:34.334166

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7bfdbd0dcb8'
down_revision: Union[str, None] = 'd9bf52463da4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('averias', sa.Column('onu_nueva_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_averias_onu_nueva_id', 'averias', 'onus', ['onu_nueva_id'], ['id'])
    op.execute("ALTER TYPE tipohistorial ADD VALUE IF NOT EXISTS 'cambio_onu'")


def downgrade() -> None:
    op.drop_constraint('fk_averias_onu_nueva_id', 'averias', type_='foreignkey')
    op.drop_column('averias', 'onu_nueva_id')
    # No se puede quitar un valor de un enum de Postgres sin recrear el tipo;
    # se deja tal cual en el downgrade (igual que el precedente de 'pausado').
