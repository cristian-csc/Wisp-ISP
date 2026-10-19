"""agregar rol super_admin

Revision ID: 8b4ad171c2c9
Revises: 744d882a0b25
Create Date: 2026-09-26 19:33:58.307553

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b4ad171c2c9'
down_revision: Union[str, None] = '744d882a0b25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No se puede usar el valor nuevo dentro de la misma transacción en que se
    # agrega, pero esta migración solo lo agrega — no lo usa — así que corre
    # bien dentro de la transacción que envuelve Alembic por defecto.
    op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin'")


def downgrade() -> None:
    # Postgres no soporta DROP VALUE en un enum sin recrear el tipo y
    # recastear la columna que lo usa. Como es un cambio puramente aditivo
    # (agrega un rol, no toca los existentes), no se revierte automáticamente;
    # si hace falta bajar, reconstruir el tipo a mano.
    pass
