"""la zona puede existir sin túnel WireGuard todavía

Revision ID: c5d8a02f94e1
Revises: a3c7e1f20b48
Create Date: 2026-11-10 00:00:00.000000

El flujo real de la empresa es: se decide abrir una zona y se registra en el
sistema, y días o semanas después se instala el MikroTik y se levanta el
túnel. Hasta ahora `ip_wireguard` era obligatoria, así que había que
inventarse una IP para poder crear la zona — y una IP inventada en una
columna de red es peor que una vacía: parece configurada.

El resto del código ya estaba escrito contando con esto: el alta de clientes,
el envío de comandos al MikroTik y la terminal SSH ya comprobaban que la zona
tuviera túnel antes de usarlo. Solo faltaban dos sitios, que se protegieron
junto con esta migración.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d8a02f94e1'
down_revision: Union[str, None] = 'a3c7e1f20b48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('zonas', 'ip_wireguard',
                    existing_type=sa.String(length=20), nullable=True)


def downgrade() -> None:
    # Para volver atrás no puede quedar ninguna zona sin IP: a las que estén
    # vacías se les pone una de la red del túnel, derivada de su id, porque
    # la columna no admite vacíos. Hay que revisarlas a mano después.
    op.execute(
        "UPDATE zonas SET ip_wireguard = '10.10.0.' || (100 + id)::text "
        "WHERE ip_wireguard IS NULL"
    )
    op.alter_column('zonas', 'ip_wireguard',
                    existing_type=sa.String(length=20), nullable=False)
