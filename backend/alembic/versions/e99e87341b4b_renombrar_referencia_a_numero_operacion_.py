"""renombrar referencia a numero_operacion en pagos y hacerlo unico

Revision ID: e99e87341b4b
Revises: f586fd9f8fd2
Create Date: 2026-10-02 08:45:47.499272

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e99e87341b4b'
down_revision: Union[str, None] = 'f586fd9f8fd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('pagos', 'referencia', new_column_name='numero_operacion')
    op.create_unique_constraint('uq_pagos_numero_operacion', 'pagos', ['numero_operacion'])


def downgrade() -> None:
    op.drop_constraint('uq_pagos_numero_operacion', 'pagos', type_='unique')
    op.alter_column('pagos', 'numero_operacion', new_column_name='referencia')
