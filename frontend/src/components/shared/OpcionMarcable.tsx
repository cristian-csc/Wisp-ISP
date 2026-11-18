import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

interface Props {
  titulo: string;
  descripcion?: string;
  /** Cifra a la derecha, por ejemplo cuántos clientes entran con esta opción. */
  cuenta?: number | string | null;
  icono?: string;
  marcada: boolean;
  onCambiar: () => void;
  /** 'casilla' marca varias a la vez; 'unica' es una entre varias. */
  tipo?: 'casilla' | 'unica';
  disabled?: boolean;
}

/** Una opción grande que se marca tocándola entera: más fácil de acertar que
 *  una casilla suelta y con sitio para explicar qué significa. */
const OpcionMarcable = ({
  titulo,
  descripcion,
  cuenta,
  icono,
  marcada,
  onCambiar,
  tipo = 'casilla',
  disabled = false,
}: Props) => (
  <button
    type="button"
    role={tipo === 'unica' ? 'radio' : 'checkbox'}
    aria-checked={marcada}
    disabled={disabled}
    onClick={onCambiar}
    className={cn(
      'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 active:scale-[0.99]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      marcada ? 'border-brand bg-lightbrand' : 'border-ld bg-card hover:border-foreground/25',
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 shrink-0 place-items-center border transition-colors duration-150',
        tipo === 'unica' ? 'rounded-full' : 'rounded-md',
        marcada ? 'border-brand bg-brand text-brand-foreground' : 'border-foreground/30 bg-card',
      )}
    >
      {marcada && (tipo === 'unica' ? <span className="size-2 rounded-full bg-brand-foreground" /> : <Icon icon="tabler:check" width={14} />)}
    </span>
    {icono && <Icon icon={icono} width={18} className="shrink-0 text-muted-foreground" />}
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium leading-tight">{titulo}</span>
      {descripcion && <span className="mt-0.5 block text-xs text-muted-foreground">{descripcion}</span>}
    </span>
    {cuenta != null && <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{cuenta}</span>}
  </button>
);

export default OpcionMarcable;
