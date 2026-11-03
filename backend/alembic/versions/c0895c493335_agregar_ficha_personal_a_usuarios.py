"""agregar ficha de personal a usuarios

Revision ID: c0895c493335
Revises: 4ba903291084
Create Date: 2026-10-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0895c493335'
down_revision: Union[str, None] = '4ba903291084'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('telefono', sa.String(length=20), nullable=True))
    op.add_column('usuarios', sa.Column('dni', sa.String(length=15), nullable=True))
    op.add_column('usuarios', sa.Column('direccion', sa.Text(), nullable=True))
    op.add_column('usuarios', sa.Column('fecha_ingreso', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('usuarios', 'fecha_ingreso')
    op.drop_column('usuarios', 'direccion')
    op.drop_column('usuarios', 'dni')
    op.drop_column('usuarios', 'telefono')
