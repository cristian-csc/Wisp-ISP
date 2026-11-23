"""Un mismo DNI puede tener hasta tres lineas de servicio.

Hasta ahora el sistema daba por hecho que una persona es una linea: el DNI
era unico en la tabla y el usuario PPPoE era el DNI, tal cual. Eso dejaba
fuera un caso real del negocio -- el cliente que contrata una segunda linea,
para otro ambiente o para otra casa, a su mismo nombre.

Lo que cambia:

  * `linea` (1, 2 o 3) dice cual de sus lineas es cada ficha. Las que ya
    existen son todas la 1, que es lo que eran.

  * El DNI deja de ser unico POR SI SOLO y pasa a serlo junto con la linea.
    La proteccion contra registrar dos veces al mismo cliente por descuido
    no se pierde: un alta repetida sigue chocando contra
    `uq_clientes_dni_linea`, porque entraria otra vez como linea 1. Lo que
    ahora se puede es pedir explicitamente la linea 2.

  * `usuario_pppoe` sigue siendo unico en todo el sistema, sin tocar. El
    sufijo (70111222 -> 70111222b -> 70111222c) es global, no por zona:
    si manana el cliente se muda de Cabanillas a Vilque, su usuario viaja
    con el y no choca con nadie.

El RUC pierde la unicidad por lo mismo: una empresa con dos lineas lo
repite. El control de que un RUC no se cuele en la ficha de otra persona
queda en el alta, que mira tambien el DNI.

Bajar esta migracion exige que no haya DNI ni RUC repetidos todavia: si
alguien ya registro una segunda linea, Postgres se negara a recrear el
indice unico. Es el aviso correcto -- bajarla destruiria ese dato.

Revision ID: d8f5a2c61b47
Revises: c7e4b1a93f26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8f5a2c61b47'
down_revision: Union[str, None] = 'c7e4b1a93f26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default para que las fichas que ya existen queden en la linea 1
    # sin tener que recorrerlas.
    op.add_column(
        'clientes',
        sa.Column('linea', sa.Integer(), nullable=False, server_default='1'),
    )
    op.create_check_constraint(
        'ck_clientes_linea', 'clientes', 'linea >= 1 AND linea <= 3',
    )

    # El DNI pasa de unico a indexado a secas...
    op.drop_index('ix_clientes_dni', table_name='clientes')
    op.create_index('ix_clientes_dni', 'clientes', ['dni'])
    # ...y la unicidad se traslada al par, que es lo que de verdad identifica
    # un servicio.
    op.create_unique_constraint(
        'uq_clientes_dni_linea', 'clientes', ['dni', 'linea'],
    )

    op.drop_index('ix_clientes_ruc', table_name='clientes')
    op.create_index('ix_clientes_ruc', 'clientes', ['ruc'])


def downgrade() -> None:
    op.drop_index('ix_clientes_ruc', table_name='clientes')
    op.create_index('ix_clientes_ruc', 'clientes', ['ruc'], unique=True)

    op.drop_constraint('uq_clientes_dni_linea', 'clientes', type_='unique')
    op.drop_index('ix_clientes_dni', table_name='clientes')
    op.create_index('ix_clientes_dni', 'clientes', ['dni'], unique=True)

    op.drop_constraint('ck_clientes_linea', 'clientes', type_='check')
    op.drop_column('clientes', 'linea')
