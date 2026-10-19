"""agregar potencia_optica_dbm a bornes

Revision ID: 29a5559c5786
Revises: 2ddd314f7938
Create Date: 2026-09-30 09:29:31.600307

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '29a5559c5786'
down_revision: Union[str, None] = '2ddd314f7938'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bornes', sa.Column('potencia_optica_dbm', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('bornes', 'potencia_optica_dbm')
