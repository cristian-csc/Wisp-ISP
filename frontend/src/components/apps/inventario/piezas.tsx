import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';
import { TIPO_MOVIMIENTO, type EstadoStock, type MovimientoInv } from 'src/lib/inventario';

const ESTADO: Record<EstadoStock, { texto: string; clase: string; icono: string }> = {
  sin_stock: { texto: 'Sin stock', clase: 'bg-lighterror text-error-text', icono: 'tabler:circle-x' },
  bajo: { texto: 'Reponer', clase: 'bg-lightwarning text-warning-text', icono: 'tabler:alert-triangle' },
  ok: { texto: 'Suficiente', clase: 'bg-lightsuccess text-success-text', icono: 'tabler:circle-check' },
};

export const EstadoStockBadge = ({ estado }: { estado: EstadoStock }) => {
  const e = ESTADO[estado];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', e.clase)}>
      <Icon icon={e.icono} width={13} aria-hidden="true" />
      {e.texto}
    </span>
  );
};

/** Cuánto hay frente al mínimo. La marca vertical es el mínimo; la barra se
 *  llena hasta el doble del mínimo, que es donde ya no preocupa. */
export const BarraStock = ({ stock, minimo, estado }: { stock: number; minimo: number; estado: EstadoStock }) => {
  const tope = Math.max(minimo * 2, stock, 1);
  const lleno = Math.min(100, (stock / tope) * 100);
  const marca = minimo > 0 ? (minimo / tope) * 100 : null;
  const color = estado === 'sin_stock' ? 'bg-error-solid' : estado === 'bajo' ? 'bg-warning-solid' : 'bg-foreground/70';
  return (
    <div className="relative h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${lleno}%` }} />
      {marca != null && <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${marca}%` }} />}
    </div>
  );
};

/** El tipo de movimiento con su icono. Neutro a propósito: el color se lo
 *  lleva la cantidad (+ entra al almacén). */
export const TipoMovimientoEtiqueta = ({ tipo }: { tipo: MovimientoInv['tipo'] }) => {
  const t = TIPO_MOVIMIENTO[tipo];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon icon={t.icono} width={14} aria-hidden="true" />
      </span>
      {t.etiqueta}
    </span>
  );
};

/** La cantidad con signo según cómo mueve el almacén. */
export const CantidadMovimiento = ({ m }: { m: MovimientoInv }) => {
  const signo = m.tipo === 'ajuste' ? Math.sign(m.cantidad) : TIPO_MOVIMIENTO[m.tipo].signo;
  const n = Math.abs(m.cantidad);
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        signo > 0 && 'text-success-text',
        signo < 0 && 'text-foreground',
        signo === 0 && 'text-muted-foreground',
      )}
    >
      {signo > 0 ? '+' : signo < 0 ? '−' : ''}
      {n.toLocaleString('es-PE')}
    </span>
  );
};

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
