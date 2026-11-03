import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from './CardBox';

export type TonoStat = 'primary' | 'brand' | 'success' | 'warning' | 'error' | 'info';

/** Cada tono usa un color semántico del sistema; nada escrito a mano. */
const TONOS: Record<TonoStat, { tile: string; icono: string }> = {
  primary: { tile: 'bg-lightprimary', icono: 'text-primary' },
  brand: { tile: 'bg-lightbrand', icono: 'text-brand-strong dark:text-brand' },
  success: { tile: 'bg-lightsuccess', icono: 'text-success' },
  warning: { tile: 'bg-lightwarning', icono: 'text-warning' },
  error: { tile: 'bg-lighterror', icono: 'text-error' },
  info: { tile: 'bg-lightinfo', icono: 'text-info' },
};

interface Props {
  icono: string;
  etiqueta: string;
  valor: string | number;
  /** Línea pequeña bajo el valor */
  nota?: React.ReactNode;
  /** Variación respecto al periodo anterior, en porcentaje */
  delta?: number | null;
  tono?: TonoStat;
  to?: string;
}

const StatCard = ({ icono, etiqueta, valor, nota, delta, tono = 'primary', to }: Props) => {
  const t = TONOS[tono];
  const sube = (delta ?? 0) >= 0;

  const cuerpo = (
    <CardBox className={`transition-ui h-full p-5 ${to ? 'card-hover' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${t.tile}`}>
          <Icon icon={icono} width={22} className={t.icono} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">{etiqueta}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold leading-none">{valor}</span>
            {delta !== null && delta !== undefined && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  sube ? 'bg-lightsuccess text-success' : 'bg-lighterror text-error'
                }`}
              >
                <Icon icon={sube ? 'tabler:trending-up' : 'tabler:trending-down'} width={13} />
                {sube ? '+' : ''}
                {delta.toFixed(0)}%
              </span>
            )}
          </div>
          {nota && <div className="mt-1.5 text-xs text-muted-foreground">{nota}</div>}
        </div>
      </div>
    </CardBox>
  );

  return to ? (
    <Link to={to} className="block h-full">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
};

export default StatCard;
