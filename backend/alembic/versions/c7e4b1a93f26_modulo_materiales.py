"""El módulo Materiales entra al menú

Va aparte de la migración que creó las tablas a propósito: aquella podía
desplegarse sin que nadie notara nada, porque sin pantalla un módulo en el
menú es un enlace que no lleva a ningún lado. Ahora la pantalla existe.

Con este segundo módulo, «Inventario» pasa a tener dos hijos y el menú lo
dibuja ya como grupo plegable — antes, con uno solo, mostraba el hijo suelto.

Entra solo para el administrador. El almacén se delega desde «Roles y
módulos» el día que haya un encargado, sin tocar código: `acceso.py` lo tiene
como módulo delegable, así que el permiso viaja con el módulo.

Revision ID: c7e4b1a93f26
Revises: b6d3f0a52e91
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa


revision = 'c7e4b1a93f26'
down_revision = 'b6d3f0a52e91'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
        SELECT 'panel.materiales', 'Materiales', p.id, 'panel', 'personal',
               '/materiales', 'solar:layers-minimalistic-linear',
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos WHERE plataforma = 'panel')
        FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Inventario'
    """))
    conn.execute(sa.text("""
        INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
        SELECT r.id, m.id,
               (SELECT COALESCE(MAX(rm.orden), 0) + 1 FROM rol_modulo rm WHERE rm.rol_id = r.id),
               false
        FROM roles r, modulos m
        WHERE r.clave = 'admin' AND m.clave = 'panel.materiales'
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM rol_modulo WHERE modulo_id IN "
        "(SELECT id FROM modulos WHERE clave = 'panel.materiales')"
    ))
    conn.execute(sa.text("DELETE FROM modulos WHERE clave = 'panel.materiales'"))
