import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

export type TonoCifra = 'neutro' | 'ok' | 'alerta' | 'peligro' | 'marca';

const TONO: Record<TonoCifra, { chip: string; barra: string; acento: string }> = {
  neutro: { chip: 'bg-muted text-foreground', barra: 'bg-foreground/70', acento: '' },
  marca: { chip: 'bg-lightbrand text-brand-strong dark:text-brand', barra: 'bg-brand', acento: '' },
  ok: { chip: 'bg-lightsuccess text-success-text', barra: 'bg-success-solid', acento: '' },
  alerta: { chip: 'bg-lightwarning text-warning-text', barra: 'bg-warning-solid', acento: 'before:bg-warning-solid' },
  peligro: { chip: 'bg-lighterror text-error-text', barra: 'bg-error-solid', acento: 'before:bg-error-solid' },
};

interface Props {
  etiqueta: string;
  valor: string | number;
  nota?: React.ReactNode;
  to?: string;
  /** Variación porcentual frente al período anterior. */
  delta?: number | null;
  icono?: string;
  /** El color solo cuando significa algo: alerta o peligro piden atención. */
  tono?: TonoCifra;
  /** Barra de avance: cuánto de un total (activos de registrados, etc.). */
  progreso?: { valor: number; total: number } | null;
  /** Valores recientes para un minigráfico, del más viejo al más nuevo. */
  serie?: number[] | null;
}

/** Minigráfico de línea, sin ejes: solo la forma de la tendencia. */
const Mini = ({ serie }: { serie: number[] }) => {
  if (serie.length < 2) return null;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const rango = max - min || 1;
  const puntos = serie.map((v, i) => [(i / (serie.length - 1)) * 100, 28 - ((v - min) / rango) * 24 - 2] as const);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [ux, uy] = puntos[puntos.length - 1];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-24 shrink-0 overflow-visible" aria-hidden="true">
      <path d={`${linea} L100,30 L0,30 Z`} className="fill-foreground/[0.06]" />
      <path d={linea} fill="none" className="stroke-foreground/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r={2.2} className="fill-brand" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** Una cifra grande con su contexto, para las tiras de indicadores de arriba.
 *  Va dentro de una rejilla `gap-px bg-border` para que las divisiones sean
 *  líneas finas. */
const Cifra = ({ etiqueta, valor, nota, to, delta, icono, tono = 'neutro', progreso, serie }: Props) => {
  const t = TONO[tono];
  const pct = progreso && progreso.total > 0 ? Math.min(100, (progreso.valor / progreso.total) * 100) : null;
  const cuerpo = (
    <div
      className={cn(
        'relative flex h-full flex-col gap-3 px-5 py-4',
        // Una franja fina arriba marca las cifras que piden atención.
        t.acento && `before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${t.acento}`,
      )}
    >
      <div className="flex items-center gap-2.5">
        {icono && (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', t.chip)}>
            <Icon icon={icono} width={17} aria-hidden="true" />
          </span>
        )}
        <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight text-muted-foreground">{etiqueta}</p>
        {to && (
          <Icon
            icon="tabler:arrow-up-right"
            width={16}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[30px] font-semibold leading-none tracking-tight tabular-nums">{valor}</span>
          {delta != null && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
                delta > 0 ? 'bg-lightsuccess text-success-text' : delta < 0 ? 'bg-lighterror text-error-text' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon icon={delta >= 0 ? 'tabler:trending-up' : 'tabler:trending-down'} width={13} />
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
        {serie && <Mini serie={serie} />}
      </div>
      {pct != null && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className={cn('h-full rounded-full', t.barra)} style={{ width: `${pct}%` }} />
        </div>
      )}
      {nota && <div className="-mt-1 text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="group block outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
};

export default Cifra;
