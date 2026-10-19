"""eliminar_modelo_de_onus

Revision ID: fcb148484d70
Revises: 36f28bfa4f1e
Create Date: 2026-10-02 15:31:11.938482

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fcb148484d70'
down_revision: Union[str, None] = '36f28bfa4f1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('onus', 'modelo')


def downgrade() -> None:
    op.add_column('onus', sa.Column('modelo', sa.VARCHAR(length=100), autoincrement=False, nullable=True))
