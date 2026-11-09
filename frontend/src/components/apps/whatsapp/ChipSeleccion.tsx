import { Icon } from '@iconify/react';

export type TonoChip = 'primary' | 'success' | 'info';

const TONOS: Record<TonoChip, { activo: string; inactivo: string }> = {
  primary: {
    activo: 'border-primary bg-lightprimary text-primary',
    inactivo: 'border-ld text-muted-foreground hover:border-primary/40 hover:text-primary',
  },
  success: {
    activo: 'border-success bg-lightsuccess text-success-text',
    inactivo: 'border-ld text-muted-foreground hover:border-success/40 hover:text-success-text',
  },
  info: {
    activo: 'border-info bg-lightinfo text-info-text',
    inactivo: 'border-ld text-muted-foreground hover:border-info/40 hover:text-info-text',
  },
};

interface Props {
  texto: string;
  activo: boolean;
  onClick: () => void;
  /** Icono fijo; si se pasa `iconoActivo`, éste se usa cuando está marcado. */
  icono?: string;
  iconoActivo?: string;
  tono?: TonoChip;
  disabled?: boolean;
}

/** Botón redondeado que se marca y desmarca.
 *
 *  Lo usan las zonas, los estados de cliente y las plantillas del módulo de
 *  WhatsApp, que antes repetían el mismo bloque de clases tres veces con
 *  pequeñas diferencias entre sí. */
const ChipSeleccion = ({
  texto,
  activo,
  onClick,
  icono,
  iconoActivo,
  tono = 'primary',
  disabled = false,
}: Props) => {
  const estilo = TONOS[tono];
  const mostrado = activo ? (iconoActivo ?? icono) : icono;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`transition-ui inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
        disabled:cursor-not-allowed disabled:opacity-50
        ${activo ? `${estilo.activo} font-semibold` : estilo.inactivo}`}
    >
      {mostrado && <Icon icon={mostrado} width={13} className="shrink-0" />}
      {texto}
    </button>
  );
};

export default ChipSeleccion;
