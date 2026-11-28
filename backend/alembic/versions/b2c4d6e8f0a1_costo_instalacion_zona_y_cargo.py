"""Costo de instalación por zona y cargo de instalación en el pago.

Aditiva y no destructiva:
  - zonas.costo_instalacion: lo fija el admin por zona. 0 = la zona no cobra
    instalación. Las filas existentes quedan en 0 por el server_default.
  - pagos.cargo_instalacion: el cargo único de instalación que viaja con el
    primer pago del cliente, aparte del `monto` del mes. Nulo = ese pago no
    llevó instalación; los pagos ya existentes quedan nulos.

No toca ninguna columna ni dato existente.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c4d6e8f0a1'
down_revision = 'a1b7c3e9d2f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'zonas',
        sa.Column('costo_instalacion', sa.Float(), nullable=False, server_default='0'),
    )
    op.add_column(
        'pagos',
        sa.Column('cargo_instalacion', sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('pagos', 'cargo_instalacion')
    op.drop_column('zonas', 'costo_instalacion')
