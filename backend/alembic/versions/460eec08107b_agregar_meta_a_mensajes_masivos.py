"""agregar meta a mensajes_masivos

Revision ID: 460eec08107b
Revises: 32da6de8c64b
Create Date: 2026-10-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '460eec08107b'
down_revision: Union[str, None] = '32da6de8c64b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mensajes_masivos', sa.Column('meta', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('mensajes_masivos', 'meta')
