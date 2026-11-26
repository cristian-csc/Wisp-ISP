"""El freno de fuerza bruta sale de la memoria del proceso

Hallazgo B-6 de la auditoria. Los contadores de intentos fallidos vivian en
dos diccionarios de modulo, asi que un reinicio del backend los ponia a cero
y con varios trabajadores de uvicorn el tope real era `tope x procesos`.

La tabla no lleva datos personales: la clave es "<ip>|<usuario>", donde
usuario es lo que se escribio en el formulario. Se poda sola (ver
_podar_freno() en routers/auth.py y el trabajo nocturno del planificador), asi
que no hace falta migrar nada de la version anterior: los contadores que
hubiera en memoria se pierden en el despliegue, que es precisamente lo que
este cambio viene a arreglar.

Revision ID: c3d9e5a84b12
Revises: b2c8d4f61a07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d9e5a84b12'
down_revision: Union[str, None] = 'b2c8d4f61a07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'freno_login',
        sa.Column('clave', sa.String(length=200), nullable=False),
        sa.Column('momentos', sa.JSON(), nullable=False),
        sa.Column('bloqueado_hasta', sa.Float(), nullable=True),
        sa.Column('actualizado_en', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('clave'),
    )
    # Los dos indices son para la poda, que barre por antiguedad.
    op.create_index('ix_freno_login_actualizado_en', 'freno_login', ['actualizado_en'])
    op.create_index('ix_freno_login_bloqueado_hasta', 'freno_login', ['bloqueado_hasta'])


def downgrade() -> None:
    op.drop_index('ix_freno_login_bloqueado_hasta', table_name='freno_login')
    op.drop_index('ix_freno_login_actualizado_en', table_name='freno_login')
    op.drop_table('freno_login')
