/**
 * Un titular con más de una línea de servicio.
 *
 * El MikroTik crea el secreto PPPoE con el nombre del DNI, así que dos
 * líneas del mismo documento necesitan dos nombres. La regla, que ya se
 * usaba a mano y aquí queda escrita una sola vez:
 *
 *     70111222     primera línea
 *     70111222b    segunda
 *     70111222c    tercera
 *
 * El equivalente del backend vive en `app/lineas.py`, y ahí está explicado
 * por qué la letra es global y no por zona. Estas constantes son solo para
 * poder decir en pantalla, antes de guardar, cómo se va a llamar.
 */

export const MAX_LINEAS = 3;

const SUFIJOS: Record<number, string> = { 1: '', 2: 'b', 3: 'c' };

const ORDINALES: Record<number, string> = {
  1: 'primera',
  2: 'segunda',
  3: 'tercera',
};

/** El usuario PPPoE que le tocaría a esa línea de ese DNI. */
export function usuarioDeLinea(dni: string, linea: number): string {
  return `${dni}${SUFIJOS[linea] ?? ''}`;
}

export function ordinal(linea: number): string {
  return ORDINALES[linea] ?? `${linea}.ª`;
}

/**
 * Cómo nombrar la línea cuando hay que distinguirla. Vacío en la primera.
 *
 * La primera no se etiqueta a propósito: casi todos los clientes tienen una
 * sola, y llamarla «primera línea» sembraría la duda de si tienen otra.
 */
export function etiquetaLinea(linea: number): string {
  return linea === 1 ? '' : `${ordinal(linea)} línea`;
}

/** Marca corta para listados: L2, L3. Vacía en la primera. */
export function marcaLinea(linea: number): string {
  return linea === 1 ? '' : `L${linea}`;
}
