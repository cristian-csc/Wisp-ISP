"""agregar estado pausado y pausa_hasta a clientes

Revision ID: 36f28bfa4f1e
Revises: e99e87341b4b
Create Date: 2026-10-02 10:04:37.230816

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36f28bfa4f1e'
down_revision: Union[str, None] = 'e99e87341b4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE estadocliente ADD VALUE IF NOT EXISTS 'pausado'")
    op.add_column('clientes', sa.Column('pausa_hasta', sa.Date(), nullable=True))


def downgrade() -> None:
    # Postgres no permite quitar un valor de un enum fácilmente — se deja el
    # valor 'pausado' en el tipo aunque se revierta esta migración.
    op.drop_column('clientes', 'pausa_hasta')
