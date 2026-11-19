"""ONUs y Cajas NAP se gestionan desde Inventario; Red queda para consultar

Se agregan dos módulos dentro de Inventario: "ONUs" y "Cajas NAP". Ahí se
registran y entregan ONUs, se crean y amplían cajas y se marcan bornes. Los
módulos de Red con el mismo nombre siguen existiendo, pero solo para mirar.
Los módulos nuevos se le dan al administrador, que puede delegarlos.

Revision ID: e8f3b6c2d579
Revises: d7e2a5b1c468
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'e8f3b6c2d579'
down_revision = 'd7e2a5b1c468'
branch_labels = None
depends_on = None

NUEVOS = [
    ('panel.inventario_onus', 'ONUs', '/inventario/onus', 'solar:wi-fi-router-minimalistic-linear'),
    ('panel.inventario_cajas', 'Cajas NAP', '/inventario/cajas-nap', 'solar:box-linear'),
]
ANTES_DE = 'panel.inventario_unidades'


def upgrade() -> None:
    n = len(NUEVOS)
    op.execute(sa.text("UPDATE modulos SET orden = orden + :n WHERE orden >= (SELECT orden FROM modulos WHERE clave = :c)").bindparams(n=n, c=ANTES_DE))
    op.execute(sa.text("""
        UPDATE rol_modulo rm SET orden = rm.orden + :n
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden >= (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                           WHERE x.rol_id = r.id AND m.clave = :c)
    """).bindparams(n=n, c=ANTES_DE))
    for k, (clave, nombre, ruta, icono) in enumerate(NUEVOS):
        op.execute(sa.text("""
            INSERT INTO modulos (clave, nombre, modulo_padre_id, plataforma, audiencia, ruta, icono, orden)
            SELECT :clave, :nombre, p.id, 'panel', 'personal', :ruta, :icono,
                   (SELECT orden FROM modulos WHERE clave = :c) - :n + :k
            FROM modulos_padre p WHERE p.plataforma = 'panel' AND p.nombre = 'Inventario'
        """).bindparams(clave=clave, nombre=nombre, ruta=ruta, icono=icono, c=ANTES_DE, n=n, k=k))
        op.execute(sa.text("""
            INSERT INTO rol_modulo (rol_id, modulo_id, orden, es_central)
            SELECT r.id, m.id,
                   COALESCE((SELECT x.orden FROM rol_modulo x JOIN modulos o ON o.id = x.modulo_id
                             WHERE x.rol_id = r.id AND o.clave = :c) - :n + :k,
                            (SELECT COALESCE(MAX(x.orden), 0) + 1 FROM rol_modulo x WHERE x.rol_id = r.id)),
                   false
            FROM roles r, modulos m
            WHERE r.clave = 'admin' AND m.clave = :clave
        """).bindparams(clave=clave, c=ANTES_DE, n=n, k=k))


def downgrade() -> None:
    n = len(NUEVOS)
    op.execute(sa.text("""
        UPDATE rol_modulo rm SET orden = rm.orden - :n
        FROM roles r
        WHERE r.id = rm.rol_id AND r.clave = 'admin'
          AND rm.orden >= (SELECT x.orden FROM rol_modulo x JOIN modulos m ON m.id = x.modulo_id
                           WHERE x.rol_id = r.id AND m.clave = :c)
    """).bindparams(n=n, c=ANTES_DE))
    op.execute(sa.text("UPDATE modulos SET orden = orden - :n WHERE orden >= (SELECT orden FROM modulos WHERE clave = :c)").bindparams(n=n, c=ANTES_DE))
    op.execute("DELETE FROM modulos WHERE clave IN ('panel.inventario_onus', 'panel.inventario_cajas')")
