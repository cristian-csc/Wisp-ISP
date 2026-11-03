import { Icon } from '@iconify/react';
import { etiquetaMes, mesesCubiertos } from 'src/lib/pagos';

interface Props {
  /** Primer mes que cubre el cobro (el que el cliente debe) */
  mesInicio: string;
  /** Cuántos meses hay en el carrito */
  meses: number;
  /** Cambia la cantidad de meses */
  onChange: (meses: number) => void;
  /** Cuota mensual, para mostrar cuánto suma cada mes */
  cuota: number;
  /** Tope de meses que se pueden adelantar */
  maximo?: number;
}

/**
 * Los meses que se están cobrando, como un carrito: se agregan uno a uno y el
 * último se puede quitar. Siempre son consecutivos — no se puede pagar enero
 * debiendo noviembre.
 */
const CarritoMeses = ({ mesInicio, meses, onChange, cuota, maximo = 12 }: Props) => {
  if (!mesInicio) {
    return (
      <p className="rounded-xl border border-dashed border-ld px-4 py-3 text-sm text-muted-foreground">
        Elige primero el mes que paga.
      </p>
    );
  }

  const lista = mesesCubiertos(mesInicio, meses);
  const siguiente = mesesCubiertos(mesInicio, meses + 1)[meses];

  return (
    <div className="overflow-hidden rounded-xl border border-ld bg-card">
      <ul className="divide-y divide-border">
        {lista.map((mes, i) => (
          <li key={mes} className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lightprimary text-[11px] font-semibold text-primary-text">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{etiquetaMes(mes)}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              S/ {cuota.toFixed(2)}
            </span>
            {i === lista.length - 1 && lista.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(meses - 1)}
                aria-label={`Quitar ${etiquetaMes(mes)}`}
                className="transition-ui grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-lighterror hover:text-error-text"
              >
                <Icon icon="tabler:x" width={15} />
              </button>
            ) : (
              <span className="h-7 w-7 shrink-0" />
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={meses >= maximo}
        onClick={() => onChange(meses + 1)}
        className="transition-ui flex w-full items-center justify-center gap-2 border-t border-ld bg-surface-2 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-lightprimary disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-surface-2"
      >
        <Icon icon="tabler:plus" width={16} />
        {meses >= maximo ? `Máximo ${maximo} meses` : `Agregar ${etiquetaMes(siguiente)}`}
      </button>
    </div>
  );
};

export default CarritoMeses;
