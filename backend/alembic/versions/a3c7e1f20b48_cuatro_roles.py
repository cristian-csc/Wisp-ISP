"""cuatro roles: quita super_admin y subadmin, renombra vendedor_tienda

Revision ID: a3c7e1f20b48
Revises: f7df1c79e62a
Create Date: 2026-11-10 00:00:00.000000

Decisión de la empresa: el sistema tiene cuatro roles y nada más.

- `super_admin` desaparece. Sus 6 permisos exclusivos (crear/editar/borrar
  zonas, peers de WireGuard y terminal SSH del MikroTik) pasan a `admin`:
  dejarlos sin dueño habría hecho imposible crear una zona nunca más.
- `subadmin` desaparece. Se definió al principio y ningún flujo del negocio
  llegó a usarlo; en los endpoints siempre acompañaba a `admin`, así que
  quitarlo no deja ninguna acción sin dueño.
- `vendedor_tienda` pasa a llamarse `atencion_cliente`, que es como se le
  dice en pantalla y como lo llama la empresa.

Postgres no sabe quitar valores de un enum (no existe ALTER TYPE ... DROP
VALUE), así que hay que crear el tipo nuevo, mover la columna y borrar el
viejo. El renombrado se hace dentro de ese mismo paso para no recorrer la
tabla dos veces.

Por si alguna instalación tuviera gente con los roles que desaparecen, se
les pasa a `admin` antes de convertir: `super_admin` era más que admin y
`subadmin` iba siempre junto a admin, así que nadie pierde acceso. Es
preferible a que la migración falle a mitad por un valor que ya no existe.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3c7e1f20b48'
down_revision: Union[str, None] = 'f7df1c79e62a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROLES_NUEVOS = "'admin', 'tecnico', 'vendedor_campo', 'atencion_cliente'"
ROLES_VIEJOS = (
    "'super_admin', 'admin', 'subadmin', 'tecnico', "
    "'vendedor_campo', 'vendedor_tienda'"
)


def upgrade() -> None:
    # Nadie se queda fuera: los roles que desaparecen pasan a admin.
    op.execute(
        "UPDATE usuarios SET rol = 'admin' "
        "WHERE rol::text IN ('super_admin', 'subadmin')"
    )

    op.execute(f"CREATE TYPE rolusuario_nuevo AS ENUM ({ROLES_NUEVOS})")
    op.execute(
        "ALTER TABLE usuarios ALTER COLUMN rol TYPE rolusuario_nuevo "
        "USING (CASE WHEN rol::text = 'vendedor_tienda' "
        "            THEN 'atencion_cliente' "
        "            ELSE rol::text END)::rolusuario_nuevo"
    )
    op.execute("DROP TYPE rolusuario")
    op.execute("ALTER TYPE rolusuario_nuevo RENAME TO rolusuario")


def downgrade() -> None:
    # Se puede volver al tipo de seis valores, pero quien era
    # `atencion_cliente` vuelve a llamarse `vendedor_tienda`. A los que
    # fueron `super_admin` o `subadmin` no hay forma de devolverlos: esa
    # información se perdió al pasarlos a admin, y adivinarla sería peor.
    op.execute(f"CREATE TYPE rolusuario_viejo AS ENUM ({ROLES_VIEJOS})")
    op.execute(
        "ALTER TABLE usuarios ALTER COLUMN rol TYPE rolusuario_viejo "
        "USING (CASE WHEN rol::text = 'atencion_cliente' "
        "            THEN 'vendedor_tienda' "
        "            ELSE rol::text END)::rolusuario_viejo"
    )
    op.execute("DROP TYPE rolusuario")
    op.execute("ALTER TYPE rolusuario_viejo RENAME TO rolusuario")
