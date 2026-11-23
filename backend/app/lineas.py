"""Un mismo titular con más de una línea de servicio.

El caso: alguien que ya tiene internet contrata otra línea a su nombre —
para un segundo ambiente, para la casa de un familiar, para un negocio. En
el MikroTik cada línea es un `/ppp secret` distinto, y el secreto se llama
como el DNI del titular. Dos líneas del mismo DNI necesitan, entonces, dos
nombres distintos.

La regla que ya usaba el ingeniero a mano, y que aquí se automatiza:

    70111222     primera línea
    70111222b    segunda
    70111222c    tercera

**El sufijo es global, no por zona.** Es cierto que los MikroTik son
independientes y que la segunda línea en otra zona no chocaría con nada
aunque se llamara igual. Aun así se le pone la letra, por tres razones que
cuestan caro el día que aparecen:

  * Si el cliente se muda de zona, su usuario viaja con él. Dos `70111222`
    que antes vivían en routers distintos pasan a estar en el mismo, y
    arreglarlo significa renombrar el secreto: el cliente se queda sin
    servicio hasta que alguien lo note.
  * `usuario_pppoe` es único en toda la base, no por zona. Un sufijo que
    dependiera de la zona obligaría a levantar esa restricción, y esa sí
    protege de verdad.
  * Dos filas iguales en un reporte no se pueden leer. ¿A cuál de las dos
    se le cortó el servicio?

Tres líneas es el tope, y es deliberado: con la letra alcanza, y un cliente
con diez líneas sería otro negocio (una empresa con varias sedes) que pide
otro diseño, no una letra más.
"""
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:  # pragma: no cover - solo para los tipos
    from sqlalchemy.orm import Session


MAX_LINEAS = 3

#: Qué se le pega al DNI para formar el usuario PPPoE de cada línea.
SUFIJOS = {1: "", 2: "b", 3: "c"}

ORDINALES = {1: "primera", 2: "segunda", 3: "tercera"}


def usuario_de_linea(dni: str, linea: int) -> str:
    """El usuario PPPoE que le toca a esa línea de ese DNI."""
    if linea not in SUFIJOS:
        raise ValueError(f"Línea fuera de rango: {linea}")
    return f"{dni}{SUFIJOS[linea]}"


def ordinal(linea: int) -> str:
    """«segunda», «tercera»… para escribirlo en un mensaje o en pantalla."""
    return ORDINALES.get(linea, f"{linea}.ª")


def etiqueta(linea: int) -> str:
    """Cómo nombrar la línea cuando hay que distinguirla. Vacío en la 1.

    La primera línea no se etiqueta a propósito: la inmensa mayoría de los
    clientes tiene una sola, y llamarla «primera línea» en cada mensaje de
    WhatsApp sembraría la duda de si tienen otra.
    """
    return "" if linea == 1 else f"{ordinal(linea)} línea"


def lineas_del_dni(db: "Session", dni: str, excluir_id: Optional[int] = None) -> List:
    """Todas las fichas registradas con ese DNI, de la 1 en adelante.

    Incluye las anuladas y las suspendidas: siguen ocupando su número de
    línea y su usuario PPPoE, así que para decidir el siguiente cuentan
    igual que las activas.
    """
    from . import models

    q = db.query(models.Cliente).filter(models.Cliente.dni == dni)
    if excluir_id is not None:
        q = q.filter(models.Cliente.id != excluir_id)
    return q.order_by(models.Cliente.linea).all()


def siguiente_linea(db: "Session", dni: str) -> int:
    """Qué número le toca a la próxima línea de ese DNI.

    Siempre la siguiente a la más alta usada, nunca el primer hueco libre.
    Si el cliente tuvo la 1, la 2 y la 3 y se dio de baja la 2, la próxima
    no es la 2: reutilizar el número reutilizaría el usuario PPPoE, y un
    cobro viejo de `70111222b` dejaría de poder atribuirse a nadie.
    """
    existentes = lineas_del_dni(db, dni)
    if not existentes:
        return 1
    siguiente = max(c.linea for c in existentes) + 1
    if siguiente > MAX_LINEAS:
        raise ValueError(
            f"Este DNI ya tiene {MAX_LINEAS} líneas registradas, que es el "
            f"máximo. Para una más hay que dar de baja alguna."
        )
    return siguiente
