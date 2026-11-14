"""el pool PPPoE de cada zona, para crear perfiles que den servicio

Revision ID: e71b4c3a9d02
Revises: c5d8a02f94e1
Create Date: 2026-11-14 00:00:00.000000

Hasta ahora, al guardar un plan el sistema creaba el perfil PPPoE en los
routers con solo el nombre y el límite de velocidad. Un perfil así deja al
cliente autenticado pero sin IP, sin DNS y sin puerta de enlace: se conecta
y no navega.

Lo que falta se saca de la zona. `local-address` y `dns-server` salen de su
IP LAN, que ya se guardaba. El único dato nuevo es el nombre del pool de
direcciones del MikroTik, que cambia de router en router (en el de pruebas
se llama "pool-pppoe").

Queda vacío a propósito en las zonas existentes: sin él, el sistema prefiere
no crear el perfil y avisar, antes que crear uno a medias que parezca
configurado y deje a un cliente sin internet.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e71b4c3a9d02'
down_revision: Union[str, None] = 'c5d8a02f94e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('zonas', sa.Column('pool_pppoe', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('zonas', 'pool_pppoe')
