"""pagos adelantados: grupo y descuento

Revision ID: f7df1c79e62a
Revises: d4a7b1c90e36
Create Date: 2026-11-03 10:40:00.000000

Un cobro adelantado sigue guardándose como un pago por mes —así los informes
mensuales (dashboard, caja, cobranza) no cambian ni una línea— pero las filas
que se cobraron juntas comparten `grupo_adelanto`, y la primera guarda el
`descuento` que hizo la empresa por cobrar por adelantado.

Las dos columnas son opcionales: los pagos que ya existen quedan con NULL y se
siguen comportando igual que siempre.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7df1c79e62a'
down_revision: Union[str, None] = 'd4a7b1c90e36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pagos', sa.Column('grupo_adelanto', sa.String(length=36), nullable=True))
    op.add_column('pagos', sa.Column('descuento', sa.Float(), nullable=True))
    op.create_index(op.f('ix_pagos_grupo_adelanto'), 'pagos', ['grupo_adelanto'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pagos_grupo_adelanto'), table_name='pagos')
    op.drop_column('pagos', 'descuento')
    op.drop_column('pagos', 'grupo_adelanto')
