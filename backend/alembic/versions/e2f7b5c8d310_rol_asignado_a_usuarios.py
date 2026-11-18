"""Rol asignado a cada usuario y tipo de cuenta de cada rol

`usuarios.rol_id` dice qué rol tiene la persona y, por tanto, qué módulos.
`usuarios.rol` se conserva como tipo de cuenta: decide las reglas de datos, por
ejemplo que un técnico solo vea sus zonas. Un rol nuevo declara en
`roles.perfil_base` de qué tipo son sus cuentas.

Cada usuario existente queda en el rol del sistema que ya tenía, así que nadie
gana ni pierde acceso con esta migración.

Revision ID: e2f7b5c8d310
Revises: d1e6a4b7c209
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'e2f7b5c8d310'
down_revision = 'd1e6a4b7c209'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('roles', sa.Column('perfil_base', sa.String(20)))
    op.execute("UPDATE roles SET perfil_base = clave WHERE clave <> 'cliente'")

    op.add_column('usuarios', sa.Column('rol_id', sa.Integer()))
    op.execute("UPDATE usuarios u SET rol_id = r.id FROM roles r WHERE r.clave = u.rol::text")
    op.create_foreign_key(
        'fk_usuarios_rol_id', 'usuarios', 'roles', ['rol_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_usuarios_rol_id', 'usuarios', ['rol_id'])


def downgrade() -> None:
    op.drop_index('ix_usuarios_rol_id', table_name='usuarios')
    op.drop_constraint('fk_usuarios_rol_id', 'usuarios', type_='foreignkey')
    op.drop_column('usuarios', 'rol_id')
    op.drop_column('roles', 'perfil_base')
