"""Un cliente no puede tener dos pagos del mismo mes

El endpoint ya lo comprobaba con un SELECT antes de insertar, pero un SELECT no
garantiza nada: dos peticiones a la vez -- un doble clic, la cajera
reintentando porque el navegador se quedo pensando, dos personas cobrando al
mismo cliente -- pasaban las dos la comprobacion y hacian las dos el INSERT.
Quedaban dos pagos del mismo mes y la fecha de vencimiento avanzaba DOS meses:
un mes regalado al cliente y la caja descuadrada contra el informe mensual.

La ventana no era teorica. Entre el SELECT y el commit el endpoint genera el
PDF del recibo y espera la respuesta de WhatsApp: segundos, no milisegundos.

Las unicas restricciones que tenia la tabla eran la clave primaria y
uq_pagos_numero_operacion, y ese campo es NULL en todo cobro en efectivo, que
es la mayoria.

ESTA MIGRACION NO BORRA PAGOS

Si al subirla ya hay duplicados, se para y los lista en el error. Es a
proposito: son registros de dinero cobrado, y elegir cual se queda no es una
decision que deba tomar una migracion en silencio a las tres de la madrugada.
El mensaje trae la consulta para verlos y que alguien decida.

Para revisarlos a mano antes de subir la migracion:

    SELECT cliente_id, mes_pagado, count(*) AS veces,
           array_agg(id ORDER BY creado_en) AS ids,
           array_agg(monto ORDER BY creado_en) AS montos
    FROM pagos
    GROUP BY cliente_id, mes_pagado
    HAVING count(*) > 1;

Y si se confirma que son cobros repetidos por error, borrar el que sobre por
su id -- comprobando antes si hay que devolver dinero, que eso el sistema no
lo sabe.

Revision ID: b2c8d4f61a07
Revises: a1b7c3e95d84
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c8d4f61a07'
down_revision: Union[str, None] = 'a1b7c3e95d84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conexion = op.get_bind()
    duplicados = conexion.execute(sa.text("""
        SELECT cliente_id, mes_pagado, count(*) AS veces
        FROM pagos
        GROUP BY cliente_id, mes_pagado
        HAVING count(*) > 1
        ORDER BY veces DESC, cliente_id
    """)).fetchall()

    if duplicados:
        detalle = "\n".join(
            f"    cliente {fila.cliente_id}, mes {fila.mes_pagado}: {fila.veces} pagos"
            for fila in duplicados[:25]
        )
        de_mas = (
            f"\n    ... y {len(duplicados) - 25} caso(s) mas"
            if len(duplicados) > 25 else ""
        )
        raise RuntimeError(
            "No se puede anadir uq_pagos_cliente_mes: ya hay pagos repetidos.\n\n"
            f"{detalle}{de_mas}\n\n"
            "Esta migracion no los borra a proposito: son registros de dinero "
            "cobrado y hay que mirar si alguno exige devolucion. Revisalos con "
            "la consulta que esta en la cabecera de este archivo, deja un solo "
            "pago por cliente y mes, y vuelve a subir la migracion."
        )

    op.create_unique_constraint(
        'uq_pagos_cliente_mes', 'pagos', ['cliente_id', 'mes_pagado'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_pagos_cliente_mes', 'pagos', type_='unique')
