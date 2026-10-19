"""agregar_compromiso_pago_y_dias_gracia

Revision ID: 04cc13d665a7
Revises: b7bfdbd0dcb8
Create Date: 2026-10-05 10:47:06.338812

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '04cc13d665a7'
down_revision: Union[str, None] = 'b7bfdbd0dcb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clientes', sa.Column('compromiso_pago_hasta', sa.Date(), nullable=True))
    op.execute("ALTER TYPE tipohistorial ADD VALUE IF NOT EXISTS 'compromiso_pago'")


def downgrade() -> None:
    op.drop_column('clientes', 'compromiso_pago_hasta')
    # No se puede quitar un valor de un enum de Postgres sin recrear el tipo;
    # se deja tal cual en el downgrade (igual que el precedente de 'pausado').
