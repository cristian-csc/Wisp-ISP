import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

export interface Pestana<T extends string> {
  valor: T;
  etiqueta: string;
  cuenta?: number;
  icono?: string;
  /** Clase del punto de color a la izquierda, solo cuando el color significa algo. */
  punto?: string;
}

interface Props<T extends string> {
  pestanas: readonly Pestana<T>[];
  valor: T;
  onChange: (valor: T) => void;
  label: string;
  className?: string;
}

/** Pestañas subrayadas para filtrar una lista. En teléfono se desplazan de
 *  lado en vez de partirse en dos filas. */
function Pestanas<T extends string>({ pestanas, valor, onChange, label, className }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ld px-1 [scrollbar-width:none]', className)}
    >
      {pestanas.map((p) => {
        const elegida = p.valor === valor;
        return (
          <button
            key={p.valor}
            type="button"
            role="tab"
            aria-selected={elegida}
            onClick={() => onChange(p.valor)}
            className={cn(
              'relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm transition-colors duration-150',
              elegida ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.punto && <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', p.punto)} />}
            {p.icono && <Icon icon={p.icono} width={16} aria-hidden="true" />}
            <span className="whitespace-nowrap">{p.etiqueta}</span>
            {p.cuenta != null && (
              <span
                className={cn(
                  'rounded-md px-1.5 text-xs tabular-nums',
                  elegida ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {p.cuenta}
              </span>
            )}
            {elegida && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}

export default Pestanas;
