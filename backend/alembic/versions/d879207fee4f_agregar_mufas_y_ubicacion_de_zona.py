"""agregar mufas y ubicacion de zona

Revision ID: d879207fee4f
Revises: 8b4ad171c2c9
Create Date: 2026-09-26 19:57:17.996462

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd879207fee4f'
down_revision: Union[str, None] = '8b4ad171c2c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('zonas', sa.Column('lat', sa.Float(), nullable=True))
    op.add_column('zonas', sa.Column('lng', sa.Float(), nullable=True))

    op.create_table(
        'mufas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo', sa.String(length=50), nullable=False),
        sa.Column('zona_id', sa.Integer(), nullable=False),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['zona_id'], ['zonas.id'], name='fk_mufas_zona_id'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo', name='uq_mufas_codigo'),
    )
    op.create_index(op.f('ix_mufas_id'), 'mufas', ['id'])
    op.create_index(op.f('ix_mufas_codigo'), 'mufas', ['codigo'])
    op.create_index(op.f('ix_mufas_zona_id'), 'mufas', ['zona_id'])

    op.add_column('cajas_nap', sa.Column('mufa_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_cajas_nap_mufa_id'), 'cajas_nap', ['mufa_id'])
    op.create_foreign_key('fk_cajas_nap_mufa_id', 'cajas_nap', 'mufas', ['mufa_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_cajas_nap_mufa_id', 'cajas_nap', type_='foreignkey')
    op.drop_index(op.f('ix_cajas_nap_mufa_id'), table_name='cajas_nap')
    op.drop_column('cajas_nap', 'mufa_id')

    op.drop_index(op.f('ix_mufas_zona_id'), table_name='mufas')
    op.drop_index(op.f('ix_mufas_codigo'), table_name='mufas')
    op.drop_index(op.f('ix_mufas_id'), table_name='mufas')
    op.drop_table('mufas')

    op.drop_column('zonas', 'lng')
    op.drop_column('zonas', 'lat')
