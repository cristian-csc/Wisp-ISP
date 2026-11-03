"""zona opcional: los clientes satelitales no pertenecen a una zona

Revision ID: d4a7b1c90e36
Revises: c93e2f514a08
Create Date: 2026-11-02 09:10:00.000000

Un cliente satelital no pasa por ningún MikroTik ni por una caja NAP, así que
la zona no le aporta nada. Para fibra e inalámbrico sigue siendo obligatoria,
pero eso lo valida el esquema (ClienteCreate), no la base: así la columna puede
quedar vacía solo donde corresponde.

A los satelitales que ya existen se les limpia la zona, porque el dato era de
relleno. No se toca ningún otro cliente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a7b1c90e36'
down_revision: Union[str, None] = 'c93e2f514a08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('clientes', 'zona_id', existing_type=sa.Integer(), nullable=True)
    # Los satelitales existentes quedan sin zona
    op.execute("UPDATE clientes SET zona_id = NULL WHERE tipo_conexion = 'satelital'")


def downgrade() -> None:
    # Para volver atrás hay que reasignar una zona a los satelitales: se les
    # pone la primera zona activa, porque la columna no admite vacíos.
    op.execute(
        "UPDATE clientes SET zona_id = (SELECT id FROM zonas ORDER BY id LIMIT 1) "
        "WHERE zona_id IS NULL"
    )
    op.alter_column('clientes', 'zona_id', existing_type=sa.Integer(), nullable=False)
