"""agregar clientes satelitales (starlink)

Revision ID: 4ba903291084
Revises: 460eec08107b
Create Date: 2026-10-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ba903291084'
down_revision: Union[str, None] = '460eec08107b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo se agrega el valor, no se usa en esta misma migración — corre bien
    # dentro de la transacción normal (igual que super_admin/pausado/retiro).
    op.execute("ALTER TYPE tipoconexion ADD VALUE IF NOT EXISTS 'satelital'")

    op.add_column(
        'planes',
        sa.Column(
            'tipo_conexion',
            sa.Enum('inalambrico', 'fibra_optica', 'satelital', name='tipoconexion', create_type=False),
            nullable=False, server_default='fibra_optica',
        ),
    )
    op.add_column('planes', sa.Column('costo_proveedor', sa.Float(), nullable=True))
    op.add_column('clientes', sa.Column('cuenta_starlink_email', sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column('clientes', 'cuenta_starlink_email')
    op.drop_column('planes', 'costo_proveedor')
    op.drop_column('planes', 'tipo_conexion')
    # Postgres no permite quitar un valor de un enum fácilmente — se deja el
    # valor 'satelital' en el tipo aunque se revierta esta migración.
