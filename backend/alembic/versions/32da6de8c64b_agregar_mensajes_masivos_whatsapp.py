"""agregar mensajes masivos de whatsapp

Revision ID: 32da6de8c64b
Revises: 5c94f081b5ea
Create Date: 2026-10-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32da6de8c64b'
down_revision: Union[str, None] = '5c94f081b5ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_table ya crea el tipo ENUM de Postgres por su cuenta — no hay que
    # crearlo a mano antes (eso duplica el CREATE TYPE y falla).
    estado_mensaje_masivo = sa.Enum('en_progreso', 'completado', 'cancelado', name='estadomensajemasivo')
    estado_envio_masivo = sa.Enum('pendiente', 'enviado', 'fallido', name='estadoenviomasivo')

    op.create_table(
        'mensajes_masivos',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('mensaje', sa.Text(), nullable=False),
        sa.Column('plantilla_nombre', sa.String(length=50), nullable=True),
        sa.Column('zona_ids', sa.JSON(), nullable=True),
        sa.Column('estados_incluidos', sa.JSON(), nullable=False),
        sa.Column('total_destinatarios', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('enviados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fallidos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estado', estado_mensaje_masivo, nullable=False, server_default='en_progreso'),
        sa.Column('creado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('finalizado_en', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_mensajes_masivos_estado'), 'mensajes_masivos', ['estado'])

    op.create_table(
        'mensajes_masivos_envios',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('mensaje_masivo_id', sa.Integer(), sa.ForeignKey('mensajes_masivos.id'), nullable=False),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=False),
        sa.Column('estado', estado_envio_masivo, nullable=False, server_default='pendiente'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('enviado_en', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_mensajes_masivos_envios_mensaje_masivo_id'), 'mensajes_masivos_envios', ['mensaje_masivo_id'])
    op.create_index(op.f('ix_mensajes_masivos_envios_estado'), 'mensajes_masivos_envios', ['estado'])


def downgrade() -> None:
    op.drop_index(op.f('ix_mensajes_masivos_envios_estado'), table_name='mensajes_masivos_envios')
    op.drop_index(op.f('ix_mensajes_masivos_envios_mensaje_masivo_id'), table_name='mensajes_masivos_envios')
    op.drop_table('mensajes_masivos_envios')
    op.drop_index(op.f('ix_mensajes_masivos_estado'), table_name='mensajes_masivos')
    op.drop_table('mensajes_masivos')
    sa.Enum(name='estadoenviomasivo').drop(op.get_bind())
    sa.Enum(name='estadomensajemasivo').drop(op.get_bind())
