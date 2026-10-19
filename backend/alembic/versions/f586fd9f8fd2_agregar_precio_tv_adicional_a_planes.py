"""agregar precio_tv_adicional a planes

Revision ID: f586fd9f8fd2
Revises: 29a5559c5786
Create Date: 2026-10-01 09:58:16.615376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f586fd9f8fd2'
down_revision: Union[str, None] = '29a5559c5786'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('planes', sa.Column('precio_tv_adicional', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('planes', 'precio_tv_adicional')
