"""agregar orden_retiro_id a evidencias

Revision ID: 5c94f081b5ea
Revises: 04cc13d665a7
Create Date: 2026-10-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5c94f081b5ea'
down_revision: Union[str, None] = '04cc13d665a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Igual que con el rol super_admin: solo se agrega el valor, no se usa en
    # esta misma migración, así que corre bien dentro de la transacción normal.
    op.execute("ALTER TYPE tipoevidencia ADD VALUE IF NOT EXISTS 'retiro'")
    op.add_column('evidencias', sa.Column('orden_retiro_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'evidencias_orden_retiro_id_fkey', 'evidencias', 'ordenes_retiro',
        ['orden_retiro_id'], ['id'],
    )
    op.create_index(op.f('ix_evidencias_orden_retiro_id'), 'evidencias', ['orden_retiro_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_evidencias_orden_retiro_id'), table_name='evidencias')
    op.drop_constraint('evidencias_orden_retiro_id_fkey', 'evidencias', type_='foreignkey')
    op.drop_column('evidencias', 'orden_retiro_id')
    # Postgres no permite quitar un valor de un enum fácilmente — se deja el
    # valor 'retiro' en el tipo aunque se revierta esta migración.
