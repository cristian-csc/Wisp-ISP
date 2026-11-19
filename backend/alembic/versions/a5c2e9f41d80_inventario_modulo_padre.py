"""Inventario: un módulo padre propio, y las ONUs se mudan ahí

Hasta ahora «Inventario de ONUs» colgaba de Red, junto a Zonas y Cajas NAP.
Son dos preguntas distintas: Red responde «dónde se conecta» —la planta— e
Inventario responde «qué tengo y quién lo tiene» —el almacén—. Un equipo que
todavía está en una caja del almacén no pertenece a ninguna zona.

El módulo conserva su clave `panel.onus`, así que ni acceso.py ni los permisos
de ningún rol se enteran: lo que cambia es de qué grupo cuelga y cómo se
llama. Nadie gana ni pierde acceso con esta migración.

Pasa a llamarse «Equipos» porque es donde van a vivir también los materiales
de fibra, y «Inventario de ONUs» dentro de «Inventario» se leía dos veces.

Revision ID: a5c2e9f41d80
Revises: f3a8c1d6e724
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa


revision = 'a5c2e9f41d80'
down_revision = 'f3a8c1d6e724'
branch_labels = None
depends_on = None

# Entra después de Red: primero la planta, luego lo que se instala en ella.
ORDEN = 4


def upgrade() -> None:
    conn = op.get_bind()

    # Hueco para el grupo nuevo. No hay restricción de unicidad sobre `orden`,
    # pero se desplaza igual para que el menú no quede con dos cuartos.
    conn.execute(sa.text(
        "UPDATE modulos_padre SET orden = orden + 1 "
        "WHERE plataforma = 'panel' AND orden >= :orden"
    ), {"orden": ORDEN})

    conn.execute(sa.text(
        "INSERT INTO modulos_padre (nombre, icono, plataforma, orden) "
        "VALUES ('Inventario', 'solar:inbox-archive-linear', 'panel', :orden)"
    ), {"orden": ORDEN})

    # La mudanza. Se busca el padre por nombre y plataforma, que es su clave
    # única: el id es autonumérico y no se puede dar por supuesto.
    conn.execute(sa.text(
        "UPDATE modulos SET "
        "  modulo_padre_id = (SELECT id FROM modulos_padre "
        "                     WHERE plataforma = 'panel' AND nombre = 'Inventario'), "
        "  nombre = 'Equipos' "
        "WHERE clave = 'panel.onus'"
    ))


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text(
        "UPDATE modulos SET "
        "  modulo_padre_id = (SELECT id FROM modulos_padre "
        "                     WHERE plataforma = 'panel' AND nombre = 'Red'), "
        "  nombre = 'Inventario de ONUs' "
        "WHERE clave = 'panel.onus'"
    ))

    conn.execute(sa.text(
        "DELETE FROM modulos_padre WHERE plataforma = 'panel' AND nombre = 'Inventario'"
    ))

    conn.execute(sa.text(
        "UPDATE modulos_padre SET orden = orden - 1 "
        "WHERE plataforma = 'panel' AND orden > :orden"
    ), {"orden": ORDEN})
