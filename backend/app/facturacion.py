"""Cuándo le toca pagar a cada cliente.

La regla, decidida con el dueño:

  - El día de pago es el día en que el servicio se **activó**, no el día en que
    se instaló. Son cosas distintas: se puede tender el cable un martes y
    dejarlo funcionando el jueves porque la caja no tenía potencia. El cliente
    cuenta desde que tiene internet.

  - Ese día **no se mueve nunca**. Ni al pagar tarde, ni tras un corte, ni tras
    una reconexión. Es lo mismo que una cuota del banco: "pago los 8" y punto.
    Los días de gracia solo retrasan el corte; no corren la fecha.

  - Solo valen los días 1 al 25. El 26 en adelante no sirve: el 31 no existe
    en medio año y el 29 falta casi siempre. Quien se activa del 26 en
    adelante pasa a pagar **el 1**, y los días sueltos que quedan hasta ese 1
    no se cobran — son cuatro o cinco días, y explicar un recibo con decimales
    cuesta más que regalarlos.

Y el motivo de que cada cliente tenga su día en vez de facturar todos el 1:
el aviso de pago va por WhatsApp con una pausa de varios segundos entre
mensajes para que no bloqueen el número. Trescientos clientes venciendo el
mismo día son más de media hora de envío seguido, que es justo lo que WhatsApp
castiga. Repartidos a lo largo del mes son un puñado de mensajes por día.
"""
import calendar
from datetime import date

# Del 26 en adelante no hay día seguro: se pasa al 1. El límite duro sería 28
# —el único día que existe en los doce meses—; el 25 es el margen que quiso el
# dueño para que el corte (vencimiento + 3 días de gracia) caiga todavía
# dentro del mismo mes.
ULTIMO_DIA_DE_CICLO = 25
DIA_DE_CICLO_ALTERNATIVO = 1


def dia_de_pago(activacion: date) -> int:
    """El día del mes en que este cliente paga, para siempre."""
    return activacion.day if activacion.day <= ULTIMO_DIA_DE_CICLO else DIA_DE_CICLO_ALTERNATIVO


def con_dia(anio: int, mes: int, dia: int) -> date:
    """La fecha de ese mes, recortando el día si el mes es más corto.

    Con el tope en 25 no debería hacer falta, pero un cliente migrado puede
    traer un día de pago heredado del sistema viejo —el 30, por ejemplo— y
    entonces en febrero hay que caer en el 28.
    """
    return date(anio, mes, min(dia, calendar.monthrange(anio, mes)[1]))


def sumar_meses(desde: date, meses: int, dia: int) -> date:
    """La misma fecha `dia` del mes, `meses` más adelante."""
    total = desde.month - 1 + meses
    return con_dia(desde.year + total // 12, total % 12 + 1, dia)


def primer_vencimiento(activacion: date) -> date:
    """Cuándo vence el primer mes de un cliente recién activado.

    Un mes de servicio, no treinta días: instalar el 31 de enero y sumar 30
    da el 2 de marzo, y a partir de ahí el cliente ya no paga el día que le
    dijeron. Con "el mismo día del mes siguiente" la fecha es la misma
    siempre.

    Para quien se activa del 26 en adelante, el primer vencimiento es el 1 del
    mes **subsiguiente**: los días que van de su activación al 1 más próximo
    son los que se le regalan, y a partir de ahí paga meses completos.
    """
    dia = dia_de_pago(activacion)
    if activacion.day <= ULTIMO_DIA_DE_CICLO:
        return sumar_meses(activacion, 1, dia)
    return sumar_meses(activacion, 2, dia)


def proximo_vencimiento(vencimiento_actual: date, dia: int) -> date:
    """El vencimiento siguiente al pagar un mes."""
    return sumar_meses(vencimiento_actual, 1, dia)
