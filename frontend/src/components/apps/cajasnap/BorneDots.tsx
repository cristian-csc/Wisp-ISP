import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';
import type { Borne } from 'src/lib/cajasnap';

/** Libre es un aro vacío (un puerto esperando cliente), ocupado va lleno y
 *  dañado en rojo. Así se lee sin depender solo del color. */
const ESTILO: Record<Borne['estado'], string> = {
  libre: 'border-2 border-success-solid bg-transparent text-success-text',
  ocupado: 'bg-foreground text-background',
  danado: 'bg-error-solid text-on-solid',
};

const LABEL: Record<Borne['estado'], string> = {
  libre: 'Libre',
  ocupado: 'Ocupado',
  danado: 'Dañado',
};

const TAMANO = {
  sm: 'size-3',
  md: 'size-5 text-[10px]',
  lg: 'size-6 text-[10px]',
} as const;

const BASE = 'flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums';

interface Props {
  bornes: Borne[];
  size?: keyof typeof TAMANO;
  onClickBorne?: (borne: Borne) => void;
}

const BorneDots = ({ bornes, size = 'lg', onClickBorne }: Props) => (
  <TooltipProvider delayDuration={150}>
    <div className={cn('flex flex-wrap', size === 'sm' ? 'gap-1.5' : 'gap-2')}>
      {[...bornes]
        .sort((a, b) => a.numero - b.numero)
        .map((b) => (
          <Tooltip key={b.id}>
            <TooltipTrigger asChild>
              {onClickBorne ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickBorne(b);
                  }}
                  aria-label={`Borne ${b.numero}: ${LABEL[b.estado]}`}
                  className={cn(BASE, TAMANO[size], ESTILO[b.estado], 'cursor-pointer transition-transform duration-150 active:scale-90')}
                >
                  {size !== 'sm' ? b.numero : ''}
                </button>
              ) : (
                // Sin acción no es un botón: así puede ir dentro de una fila que sí lo es.
                <span role="img" aria-label={`Borne ${b.numero}: ${LABEL[b.estado]}`} className={cn(BASE, TAMANO[size], ESTILO[b.estado])}>
                  {size !== 'sm' ? b.numero : ''}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">
                Borne {b.numero} — {LABEL[b.estado]}
              </p>
              {b.estado === 'ocupado' && (
                <p className="text-primary-foreground/90">
                  {b.codigo_precinto ?? 'Sin precinto registrado'}
                  {b.cliente ? ` — ${b.cliente.nombre}` : ''}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
    </div>
  </TooltipProvider>
);

export default BorneDots;
