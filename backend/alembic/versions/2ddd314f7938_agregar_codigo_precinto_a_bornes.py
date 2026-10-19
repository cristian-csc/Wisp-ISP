"""agregar codigo_precinto a bornes

Revision ID: 2ddd314f7938
Revises: d7eea87070e4
Create Date: 2026-09-28 09:05:36.615975

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2ddd314f7938'
down_revision: Union[str, None] = 'd7eea87070e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bornes', sa.Column('codigo_precinto', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('bornes', 'codigo_precinto')
