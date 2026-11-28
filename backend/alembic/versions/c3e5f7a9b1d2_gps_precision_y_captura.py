"""Precisión GPS y hora real de captura en los puntos de jornada.

Aditiva y no destructiva. Sobre `ubicaciones_vendedor`:
  - precision_m: la precisión (en metros) que reportó el GPS al tomar el punto.
    Permite al panel descartar o marcar puntos imprecisos. Nulo = el aparato no
    la informó (o es un punto antiguo, anterior a este campo).
  - capturado_en: el momento REAL en que el GPS fijó la posición, que puede ser
    anterior al envío si el punto se guardó sin señal y se sincronizó después.
    `registrado_en` se conserva como la hora en que el servidor lo recibió.
    Nulo en los puntos antiguos: ahí se sigue usando `registrado_en`.

No toca ninguna columna ni dato existente.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3e5f7a9b1d2'
down_revision = 'b2c4d6e8f0a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'ubicaciones_vendedor',
        sa.Column('precision_m', sa.Float(), nullable=True),
    )
    op.add_column(
        'ubicaciones_vendedor',
        sa.Column('capturado_en', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('ubicaciones_vendedor', 'capturado_en')
    op.drop_column('ubicaciones_vendedor', 'precision_m')
