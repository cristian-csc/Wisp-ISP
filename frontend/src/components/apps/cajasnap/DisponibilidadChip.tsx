import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';
import { disponibilidad, resumenBornes, type CajaNap } from 'src/lib/cajasnap';

export type FiltroCajas = 'todas' | 'libres' | 'casi' | 'llenas' | 'danados';

/** Los filtros de disponibilidad, iguales en todas las pantallas de cajas. */
export const PESTANAS_DISPONIBILIDAD: { valor: FiltroCajas; etiqueta: string; punto?: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'libres', etiqueta: 'Con bornes libres', punto: 'bg-success-solid' },
  { valor: 'casi', etiqueta: 'Casi llenas', punto: 'bg-warning-solid' },
  { valor: 'llenas', etiqueta: 'Llenas', punto: 'bg-foreground' },
  { valor: 'danados', etiqueta: 'Con dañados', punto: 'bg-error-solid' },
];

export function coincideFiltro(c: CajaNap, f: FiltroCajas): boolean {
  if (f === 'todas') return true;
  if (f === 'danados') return resumenBornes([c]).danados > 0;
  if (f === 'libres') return resumenBornes([c]).libres > 0;
  const d = disponibilidad(c);
  return f === 'casi' ? d === 'casi_llena' : d === 'llena';
}

/** Solo se marca lo que pide atención: llena, casi llena o con dañados. Una
 *  caja con espacio no lleva etiqueta: el número de libres ya lo dice. */
const DisponibilidadChip = ({ caja }: { caja: CajaNap }) => {
  const r = resumenBornes([caja]);
  const d = disponibilidad(caja);
  const chips: { texto: string; clase: string; icono: string }[] = [];
  if (d === 'llena') chips.push({ texto: 'Llena', clase: 'bg-muted text-foreground', icono: 'tabler:lock' });
  else if (d === 'casi_llena') chips.push({ texto: 'Casi llena', clase: 'bg-lightwarning text-warning-text', icono: 'tabler:alert-triangle' });
  if (r.danados) chips.push({ texto: `${r.danados} dañado${r.danados === 1 ? '' : 's'}`, clase: 'bg-lighterror text-error-text', icono: 'tabler:plug-x' });
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {chips.map((c) => (
        <span key={c.texto} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', c.clase)}>
          <Icon icon={c.icono} width={12} aria-hidden="true" />
          {c.texto}
        </span>
      ))}
    </span>
  );
};

export default DisponibilidadChip;
