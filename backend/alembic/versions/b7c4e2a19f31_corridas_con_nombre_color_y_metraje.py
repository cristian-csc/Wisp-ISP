"""corridas: tendidos con nombre, color y metraje que salen de una mufa

Revision ID: b7c4e2a19f31
Revises: f2a9c81d5e47
Create Date: 2026-11-15 00:00:00.000000

Hasta ahora cada mufa tenía un solo trazado: una lista de puntos, sin nombre,
sin metros y todos del mismo color. En el plano del ingeniero no es así — de
una mufa salen varias corridas, cada una une un grupo de cajas, y cada una
lleva su número ("corrida 1"), su metraje (500 m) y su color, que es lo que
permite distinguirlas de un vistazo cuando se cruzan en el mapa.

Esta migración crea la tabla `corridas` y pasa a ella el trazado que cada
mufa tuviera, como "Corrida 1". El metraje de esas queda vacío: no se puede
calcular en SQL, y poner un número inventado sería peor que no tener ninguno,
porque parecería medido. Se llena solo en cuanto se vuelva a dibujar, o a
mano.

La columna `mufas.trazado` se queda donde está, vacía, por compatibilidad:
sigue viajando en la respuesta de la API y el downgrade la necesita para
devolver los datos a su sitio.
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c4e2a19f31'
down_revision: Union[str, None] = 'f2a9c81d5e47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'corridas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mufa_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=60), nullable=False),
        sa.Column('color', sa.String(length=9), nullable=False, server_default='#8754ec'),
        sa.Column('metros', sa.Float(), nullable=True),
        sa.Column('trazado', sa.JSON(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['mufa_id'], ['mufas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_corridas_id'), 'corridas', ['id'], unique=False)
    op.create_index(op.f('ix_corridas_mufa_id'), 'corridas', ['mufa_id'], unique=False)

    # El trazado que ya existiera pasa a ser la primera corrida de su mufa.
    conn = op.get_bind()
    filas = conn.execute(
        sa.text("SELECT id, trazado FROM mufas WHERE trazado IS NOT NULL")
    ).fetchall()
    for mufa_id, trazado in filas:
        if not trazado:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO corridas (mufa_id, nombre, color, metros, trazado) "
                "VALUES (:mufa_id, 'Corrida 1', '#8754ec', NULL, CAST(:trazado AS json))"
            ),
            {"mufa_id": mufa_id, "trazado": json.dumps(trazado)},
        )

    # Si se quedara también en la mufa, el mapa dibujaría dos veces la misma
    # línea: una como trazado viejo y otra como corrida.
    conn.execute(sa.text("UPDATE mufas SET trazado = NULL"))


def downgrade() -> None:
    # Devuelve a cada mufa la primera de sus corridas, que es de donde salió.
    conn = op.get_bind()
    filas = conn.execute(
        sa.text(
            "SELECT mufa_id, trazado FROM corridas "
            "WHERE trazado IS NOT NULL ORDER BY mufa_id, id"
        )
    ).fetchall()
    vistas = set()
    for mufa_id, trazado in filas:
        if mufa_id in vistas or not trazado:
            continue
        vistas.add(mufa_id)
        conn.execute(
            sa.text("UPDATE mufas SET trazado = CAST(:trazado AS json) WHERE id = :mufa_id"),
            {"mufa_id": mufa_id, "trazado": json.dumps(trazado)},
        )

    op.drop_index(op.f('ix_corridas_mufa_id'), table_name='corridas')
    op.drop_index(op.f('ix_corridas_id'), table_name='corridas')
    op.drop_table('corridas')
