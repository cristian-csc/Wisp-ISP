"""el nombre de la lista de corte, que no es igual en todos los routers

Revision ID: f2a9c81d5e47
Revises: e71b4c3a9d02
Create Date: 2026-11-15 00:00:00.000000

El sistema cortaba el servicio metiendo la IP del cliente en una lista del
firewall llamada "CORTE-MOROSO", con guion y fija en el código.

Al revisar la configuración real de un router de la empresa resultó que la
suya se llama "CORTE MOROSO" — con espacio. Y sus reglas de redirección
miran ese nombre exacto. Es decir: el sistema habría metido la IP en una
lista que ninguna regla consulta, el cliente habría seguido navegando y el
panel habría dicho que el corte salió bien. Un fallo silencioso, de los
peores, porque se descubre cuando alguien reclama que no le cortaron.

Con 15 routers por migrar es muy probable que no todos la llamen igual, así
que el nombre pasa a ser un dato de cada zona. Vacío = "CORTE MOROSO", que
es el que usan hoy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a9c81d5e47'
down_revision: Union[str, None] = 'e71b4c3a9d02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('zonas', sa.Column('lista_corte', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('zonas', 'lista_corte')
