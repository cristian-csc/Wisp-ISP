"""agregar trazado visual a mufa

Revision ID: d7eea87070e4
Revises: d879207fee4f
Create Date: 2026-09-26 20:35:30.289427

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7eea87070e4'
down_revision: Union[str, None] = 'd879207fee4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mufas', sa.Column('trazado', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('mufas', 'trazado')
