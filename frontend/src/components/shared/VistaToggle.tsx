import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

export type Vista = 'tarjetas' | 'lista';

const OPCIONES: { valor: Vista; icono: string; etiqueta: string }[] = [
  { valor: 'tarjetas', icono: 'tabler:layout-grid', etiqueta: 'Tarjetas' },
  { valor: 'lista', icono: 'tabler:list', etiqueta: 'Lista' },
];

/** Cambia entre tarjetas y lista. Se recuerda por pantalla en el navegador. */
const VistaToggle = ({ valor, onChange }: { valor: Vista; onChange: (v: Vista) => void }) => (
  <div role="group" aria-label="Vista" className="inline-flex h-9 shrink-0 rounded-lg border border-ld bg-card p-0.5">
    {OPCIONES.map((o) => (
      <button
        key={o.valor}
        type="button"
        aria-pressed={valor === o.valor}
        aria-label={o.etiqueta}
        title={o.etiqueta}
        onClick={() => onChange(o.valor)}
        className={cn(
          'grid w-8 place-items-center rounded-md transition-colors duration-150',
          valor === o.valor ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon icon={o.icono} width={16} />
      </button>
    ))}
  </div>
);

/** La vista guardada para una pantalla, o la que se pase por defecto. */
export function vistaGuardada(clave: string, porDefecto: Vista): Vista {
  try {
    const v = localStorage.getItem(`wisp_vista_${clave}`);
    return v === 'tarjetas' || v === 'lista' ? v : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarVista(clave: string, v: Vista) {
  try {
    localStorage.setItem(`wisp_vista_${clave}`, v);
  } catch {
    /* sin almacenamiento: vuelve a la vista por defecto */
  }
}

export default VistaToggle;
