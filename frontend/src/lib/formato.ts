/** Un solo formato para dinero y fechas en todo el panel. Si algo se ve
 *  distinto en dos pantallas, el problema está en no haber pasado por aquí. */

const SOLES = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOLES_ENTEROS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const FECHA = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
const FECHA_HORA = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** S/ 1,250.00. Con `enteros`, S/ 1,250 para cifras grandes de resumen. */
export function soles(monto: number | null | undefined, enteros = false): string {
  if (monto == null || Number.isNaN(monto)) return '—';
  return `S/ ${(enteros ? SOLES_ENTEROS : SOLES).format(monto)}`;
}

/** Una fecha de solo día ('2026-12-18') se lee como fecha local: con
 *  `new Date('2026-12-18')` el navegador la toma en UTC y en Perú saldría el
 *  día anterior. */
function aFecha(valor: string | Date): Date {
  if (valor instanceof Date) return valor;
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00`) : new Date(valor);
}

/** 18 dic. 2026 */
export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = aFecha(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : FECHA.format(d);
}

/** 18 dic. 2026, 09:06 */
export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = aFecha(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : FECHA_HORA.format(d);
}
