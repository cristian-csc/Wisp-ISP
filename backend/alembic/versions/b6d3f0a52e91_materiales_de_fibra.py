"""Materiales de fibra: catálogo, presentaciones y movimientos

Lo que sale a campo en una instalación de fibra y no es un equipo con serie:
cable drop, tensadores, conectores, rosetas y patch cords.

Tres tablas y una regla:

* `materiales` — qué cosas existen y cómo se cuentan.
* `material_presentaciones` — cómo se compran. El drop se gasta por metro
  pero se compra en bobinas de 1000 o rollos de 150 y 200; los tensadores se
  gastan de uno en uno pero vienen en bolsas de 10. Guardar solo la
  presentación impide descontar 45 metros; guardar solo la unidad hace perder
  de vista que se compraron tres bobinas. Hacen falta las dos.
* `movimientos_material` — todo lo que entra, sale, se consume o se ajusta.

La regla: **ningún saldo se guarda en una columna**. El almacén y lo que
lleva cada técnico se calculan sumando movimientos. Un saldo guardado y un
historial son dos números que tarde o temprano se contradicen, y entonces no
se sabe cuál creer. Con los volúmenes de esta empresa, sumar es gratis.

Lo que se siembra sale de cómo trabaja WISP hoy: de todo lo que sale a campo
solo vuelven la roseta y el patch cord (y el router/ONU, que es equipo con
serie y vive en otra tabla). El cable tendido y los tensadores se quedan en
el poste para siempre.

Revision ID: b6d3f0a52e91
Revises: a5c2e9f41d80
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa


revision = 'b6d3f0a52e91'
down_revision = 'a5c2e9f41d80'
branch_labels = None
depends_on = None


# clave, nombre, unidad, se_recupera, consumo_estandar, [(presentación, equivale_a)]
MATERIALES = [
    ('cable_drop', 'Cable drop', 'metro', False, None,
     [('Bobina 1000 m', 1000), ('Rollo 200 m', 200), ('Rollo 150 m', 150)]),
    ('tensador', 'Tensador', 'unidad', False, None,
     [('Bolsa de 10', 10), ('Unidad', 1)]),
    ('conector', 'Conector', 'unidad', False, 2,
     [('Unidad', 1)]),
    ('roseta', 'Roseta', 'unidad', True, 1,
     [('Unidad', 1)]),
    ('patchcord', 'Patch cord', 'unidad', True, 1,
     [('Unidad', 1)]),
]


def upgrade() -> None:
    materiales = op.create_table(
        'materiales',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clave', sa.String(40), nullable=False),
        sa.Column('nombre', sa.String(80), nullable=False),
        # Cómo se cuenta lo que queda. El drop en metros, el resto de a uno.
        sa.Column('unidad', sa.String(10), nullable=False),
        # Si vuelve al retirar a un cliente. Lo que no vuelve se da de baja el
        # día de la instalación y nadie lo espera.
        sa.Column('se_recupera', sa.Boolean(), nullable=False, server_default=sa.false()),
        # Cuánto se gasta en una instalación normal, cuando es siempre igual:
        # una roseta, un patch cord, dos conectores. Vacío = es variable y lo
        # dice el técnico (los metros de drop, los tensadores por poste).
        sa.Column('consumo_estandar', sa.Numeric(10, 2)),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('clave', name='uq_materiales_clave'),
        sa.CheckConstraint("unidad IN ('metro', 'unidad')", name='ck_materiales_unidad'),
    )

    presentaciones = op.create_table(
        'material_presentaciones',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('material_id', sa.Integer(),
                  sa.ForeignKey('materiales.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('nombre', sa.String(60), nullable=False),
        # Cuántas unidades base trae. Una bolsa de tensadores, 10.
        sa.Column('equivale_a', sa.Numeric(10, 2), nullable=False),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('material_id', 'nombre', name='uq_presentacion_nombre'),
        sa.CheckConstraint('equivale_a > 0', name='ck_presentacion_equivale'),
    )

    op.create_table(
        'movimientos_material',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('material_id', sa.Integer(),
                  sa.ForeignKey('materiales.id', ondelete='RESTRICT'), nullable=False, index=True),
        # entrada     proveedor -> almacén   (una compra)
        # entrega     almacén   -> técnico
        # consumo     técnico   -> cliente   (se gastó en una instalación)
        # devolucion  cliente   -> almacén   (roseta y patch cord recuperados)
        # ajuste      corrección de un cuadre; es el único que admite negativo
        sa.Column('tipo', sa.String(12), nullable=False, index=True),
        sa.Column('cantidad', sa.Numeric(10, 2), nullable=False),
        # Quién lo lleva o lo gastó. Vacío cuando el movimiento es solo de
        # almacén.
        sa.Column('tecnico_id', sa.Integer(), sa.ForeignKey('usuarios.id'), index=True),
        # En qué instalación se gastó, cuando se sabe.
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), index=True),
        # Con qué presentación entró: para poder decir "entraron 2 bolsas" y
        # no solo "entraron 20 unidades".
        sa.Column('presentacion_id', sa.Integer(), sa.ForeignKey('material_presentaciones.id')),
        # Por qué, sobre todo en los ajustes y en el conector de más: "se
        # malogró", "vino fallado", "se cayó del poste".
        sa.Column('motivo', sa.String(200)),
        sa.Column('registrado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id')),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.CheckConstraint(
            "tipo IN ('entrada', 'entrega', 'consumo', 'devolucion', 'ajuste')",
            name='ck_movimiento_tipo',
        ),
        # Solo el ajuste puede restar. Los demás describen un traslado y su
        # dirección ya la dice el tipo.
        sa.CheckConstraint(
            "cantidad > 0 OR tipo = 'ajuste'", name='ck_movimiento_cantidad',
        ),
        # Una entrega o un consumo sin técnico no dice quién lo tiene, que es
        # justo lo que este módulo existe para responder.
        sa.CheckConstraint(
            "tecnico_id IS NOT NULL OR tipo NOT IN ('entrega', 'consumo')",
            name='ck_movimiento_tecnico',
        ),
    )

    op.bulk_insert(materiales, [
        {'clave': c, 'nombre': n, 'unidad': u, 'se_recupera': r,
         'consumo_estandar': ce, 'activo': True}
        for c, n, u, r, ce, _ in MATERIALES
    ])

    conn = op.get_bind()
    id_material = {clave: id_ for id_, clave in conn.execute(sa.text('SELECT id, clave FROM materiales'))}
    op.bulk_insert(presentaciones, [
        {'material_id': id_material[clave], 'nombre': pn, 'equivale_a': eq, 'activo': True}
        for clave, _, _, _, _, pres in MATERIALES
        for pn, eq in pres
    ])


def downgrade() -> None:
    op.drop_table('movimientos_material')
    op.drop_table('material_presentaciones')
    op.drop_table('materiales')
