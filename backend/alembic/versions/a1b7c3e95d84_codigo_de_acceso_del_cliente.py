"""El cliente entra con un codigo que llega a su WhatsApp, no con su DNI.

Hasta ahora la contrasena de la app del cliente era su propio DNI mientras no
la cambiara (ver cliente_login en app/routers/auth.py). Ocho digitos que
aparecen en su recibo, en su contrato y en cualquier foto de su documento:
quien los tuviera entraba a su cuenta y veia su direccion, su telefono y todo
su historial de pagos. Estaba escrito como decision, no como descuido -- pero
un DNI no es un secreto, y por tanto no puede ser una credencial.

Lo que cambia:

  * Tabla `codigos_acceso_cliente`: el codigo de un solo uso con el que el
    cliente toma el control de su cuenta la primera vez, o cuando olvida su
    contrasena. Se guarda el hash y no el codigo, igual que las contrasenas:
    si alguien llegara a leer esta tabla, no podria usar lo que ve.

  * Una fila por cliente como maximo (uq_codigo_acceso_cliente): pedir un
    codigo nuevo reemplaza el anterior, asi no se acumulan codigos vivos.

  * ON DELETE CASCADE: si se borra la ficha del cliente, su codigo se va con
    ella. Un codigo huerfano no serviria para nada y no debe quedarse.

No toca ninguna columna existente y no hay que migrar datos. Los clientes que
YA tienen una contrasena propia (pin_app) siguen entrando igual que siempre.
Los que no la tienen -- que hoy entran con su DNI -- tendran que pedir el
codigo una vez; es exactamente el cambio que se busca.

Bajar esta migracion borra los codigos que haya vivos en ese momento. No se
pierde nada: son de un solo uso y caducan en diez minutos. Pero OJO: bajarla
sin revertir tambien el codigo de la aplicacion deja a los clientes sin
pin_app sin ninguna forma de entrar, porque el DNI ya no se acepta.

Revision ID: a1b7c3e95d84
Revises: d8f5a2c61b47
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b7c3e95d84'
down_revision: Union[str, None] = 'd8f5a2c61b47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'codigos_acceso_cliente',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=False),
        sa.Column('codigo_hash', sa.String(length=255), nullable=False),
        sa.Column('expira_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('intentos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cliente_id', name='uq_codigo_acceso_cliente'),
    )
    op.create_index(
        op.f('ix_codigos_acceso_cliente_id'), 'codigos_acceso_cliente', ['id'],
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_codigos_acceso_cliente_id'), table_name='codigos_acceso_cliente')
    op.drop_table('codigos_acceso_cliente')
