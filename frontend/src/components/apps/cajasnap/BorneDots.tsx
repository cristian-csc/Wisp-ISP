import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import type { Borne } from 'src/lib/cajasnap';

const COLOR: Record<Borne['estado'], string> = {
  libre: 'bg-info',
  ocupado: 'bg-success',
  danado: 'bg-error',
};

const LABEL: Record<Borne['estado'], string> = {
  libre: 'Libre',
  ocupado: 'Ocupado',
  danado: 'Dañado',
};

interface Props {
  bornes: Borne[];
  size?: 'sm' | 'lg';
  onClickBorne?: (borne: Borne) => void;
}

const BorneDots = ({ bornes, size = 'lg', onClickBorne }: Props) => {
  const dot = size === 'lg' ? 'w-6 h-6' : 'w-3 h-3';
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {bornes.map((b) => (
          <Tooltip key={b.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onClickBorne?.(b)}
                className={`${dot} rounded-full ${COLOR[b.estado]} ${onClickBorne ? 'cursor-pointer' : 'cursor-default'} flex items-center justify-center text-[10px] text-white font-medium shrink-0`}
              >
                {size === 'lg' ? b.numero : ''}
              </button>
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
};

export default BorneDots;
