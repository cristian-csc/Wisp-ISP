"""El módulo de ONUs vuelve a "Red" y se llama solo "ONUs"

Inventario queda para los materiales; las ONUs son parte de la red.
Dentro de Red quedan después de Cajas NAP, porque ya tienen el orden más alto
del grupo en cada rol.

Revision ID: c6d1f4a0b357
Revises: b5c0e3f9a246
Create Date: 2026-11-18
"""
from alembic import op


revision = 'c6d1f4a0b357'
down_revision = 'b5c0e3f9a246'
branch_labels = None
depends_on = None


def _mover(grupo: str, nombre: str) -> None:
    op.execute(f"""
        UPDATE modulos SET nombre = '{nombre}', modulo_padre_id = (
            SELECT id FROM modulos_padre WHERE plataforma = 'panel' AND nombre = '{grupo}'
        ) WHERE clave = 'panel.onus'
    """)


def upgrade() -> None:
    _mover('Red', 'ONUs')


def downgrade() -> None:
    _mover('Inventario', 'Inventario de ONUs')
