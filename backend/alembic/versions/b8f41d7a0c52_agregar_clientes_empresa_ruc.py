"""agregar clientes empresa: tipo de documento, RUC y responsable

Revision ID: b8f41d7a0c52
Revises: f5c2e5fac447
Create Date: 2026-10-31 10:40:00.000000

El RUC identifica a la empresa pero NO es credencial: `usuario_pppoe` y
`password_pppoe` siguen saliendo de la columna `dni`, que para una empresa
guarda el DNI del responsable. Un RUC es información pública y cualquiera
podría consultarlo, así que no sirve como contraseña.

Los clientes que ya existen quedan como tipo_documento = 'dni', que es lo que
eran: ninguno cambia de comportamiento.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f41d7a0c52'
down_revision: Union[str, None] = 'f5c2e5fac447'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tipo_doc = sa.Enum('dni', 'ruc', name='tipodocumento')
    tipo_doc.create(op.get_bind(), checkfirst=True)

    op.add_column(
        'clientes',
        sa.Column('tipo_documento', tipo_doc, nullable=False, server_default='dni'),
    )
    op.add_column('clientes', sa.Column('ruc', sa.String(length=11), nullable=True))
    op.add_column(
        'clientes', sa.Column('responsable_nombre', sa.String(length=150), nullable=True)
    )
    op.create_index(op.f('ix_clientes_ruc'), 'clientes', ['ruc'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_clientes_ruc'), table_name='clientes')
    op.drop_column('clientes', 'responsable_nombre')
    op.drop_column('clientes', 'ruc')
    op.drop_column('clientes', 'tipo_documento')
    sa.Enum(name='tipodocumento').drop(op.get_bind(), checkfirst=True)
