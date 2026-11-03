"""contador mensual de consultas de documento

Revision ID: c93e2f514a08
Revises: b8f41d7a0c52
Create Date: 2026-11-01 09:20:00.000000

Una fila por mes con el total gastado. A propósito NO se guarda un registro por
consulta: eso acumularía datos personales de gente que no es cliente, sin un
motivo de negocio que lo justifique.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c93e2f514a08'
down_revision: Union[str, None] = 'b8f41d7a0c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'consultas_documento_mes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('anio', sa.Integer(), nullable=False),
        sa.Column('mes', sa.Integer(), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'actualizado_en',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('anio', 'mes', name='uq_consulta_mes'),
    )
    op.create_index(
        op.f('ix_consultas_documento_mes_id'), 'consultas_documento_mes', ['id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_consultas_documento_mes_id'), table_name='consultas_documento_mes'
    )
    op.drop_table('consultas_documento_mes')
