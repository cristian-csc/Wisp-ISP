"""agregar_zona_id_a_gastos

Revision ID: d9bf52463da4
Revises: fcb148484d70
Create Date: 2026-10-05 07:58:46.269486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9bf52463da4'
down_revision: Union[str, None] = 'fcb148484d70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('gastos', sa.Column('zona_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_gastos_zona_id'), 'gastos', ['zona_id'], unique=False)
    op.create_foreign_key('fk_gastos_zona_id', 'gastos', 'zonas', ['zona_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_gastos_zona_id', 'gastos', type_='foreignkey')
    op.drop_index(op.f('ix_gastos_zona_id'), table_name='gastos')
    op.drop_column('gastos', 'zona_id')
