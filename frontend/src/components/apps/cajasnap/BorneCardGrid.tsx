import { Icon } from '@iconify/react';
import { Avatar, AvatarFallback } from 'src/components/ui/avatar';
import type { Borne } from 'src/lib/cajasnap';

const ESTADO_ICON: Record<Borne['estado'], string> = {
  libre: 'tabler:plug-connected',
  ocupado: 'tabler:wifi',
  danado: 'tabler:alert-triangle-filled',
};

const ESTADO_LABEL: Record<Borne['estado'], string> = {
  libre: 'Libre',
  ocupado: 'Ocupado',
  danado: 'Dañado',
};

const CARD_STYLE: Record<Borne['estado'], string> = {
  libre: 'bg-card border-dashed border-border hover:border-primary/60 hover:bg-lightprimary/40',
  ocupado: 'bg-lightsuccess/60 border-success/30 border-l-4 border-l-success hover:shadow-success/10',
  danado: 'bg-lighterror/60 border-error/30 border-l-4 border-l-error hover:shadow-error/10',
};

const ESTADO_CHIP: Record<Borne['estado'], string> = {
  libre: 'bg-lightprimary text-primary',
  ocupado: 'bg-success text-white',
  danado: 'bg-error text-white',
};

const ESTADO_ICON_WRAP: Record<Borne['estado'], string> = {
  libre: 'bg-lightprimary text-primary',
  ocupado: 'bg-success/15 text-success',
  danado: 'bg-error/15 text-error',
};

interface Props {
  bornes: Borne[];
  onClickBorne?: (borne: Borne) => void;
}

const BorneCardGrid = ({ bornes, onClickBorne }: Props) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {bornes.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onClickBorne?.(b)}
          className={`group text-left rounded-xl border p-3 transition-all duration-150 hover:shadow-lg hover:-translate-y-0.5 ${CARD_STYLE[b.estado]} ${onClickBorne ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-mono font-bold text-foreground/70">#{b.numero}</span>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADO_CHIP[b.estado]}`}>
              <Icon icon={ESTADO_ICON[b.estado]} height={11} />
              {ESTADO_LABEL[b.estado]}
            </span>
          </div>

          {b.estado === 'ocupado' && b.cliente ? (
            <div className="flex items-start gap-2">
              <Avatar className="h-7 w-7 shrink-0 bg-success/15 text-success">
                <AvatarFallback className="bg-transparent text-success text-xs font-bold">
                  {b.cliente.nombre.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold truncate">{b.cliente.nombre}</p>
                {b.codigo_precinto && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon icon="tabler:tag" height={12} />
                    {b.codigo_precinto}
                  </span>
                )}
                {b.cliente.metros_cable != null && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon icon="tabler:ruler-2" height={12} />
                    {b.cliente.metros_cable} m
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ESTADO_ICON_WRAP[b.estado]}`}>
                <Icon icon={ESTADO_ICON[b.estado]} height={15} />
              </span>
              <p className="text-xs text-muted-foreground">
                {b.estado === 'libre' ? 'Disponible' : 'Requiere revisión'}
              </p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default BorneCardGrid;
