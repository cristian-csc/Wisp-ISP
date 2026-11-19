import { Link } from 'react-router';
import { Icon } from '@iconify/react';

/** Una cifra grande con su etiqueta, para las tiras de indicadores. Va dentro
 *  de una rejilla `gap-px bg-border` para que las divisiones sean líneas finas. */
const Cifra = ({
  etiqueta,
  valor,
  nota,
  to,
  delta,
}: {
  etiqueta: string;
  valor: string | number;
  nota?: string;
  to?: string;
  delta?: number | null;
}) => {
  const cuerpo = (
    <div className="flex h-full flex-col gap-1 px-5 py-4">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none tracking-tight">{valor}</span>
        {delta != null && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              delta > 0 ? 'text-success-text' : delta < 0 ? 'text-error-text' : 'text-muted-foreground'
            }`}
          >
            <Icon icon={delta >= 0 ? 'tabler:arrow-up-right' : 'tabler:arrow-down-right'} width={14} />
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block transition-colors duration-150 hover:bg-surface-2">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
};

export default Cifra;
