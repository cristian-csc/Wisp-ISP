import { Icon } from '@iconify/react';

/** Mapa único de estados del negocio a color semántico: verde = activo o
 *  correcto, ámbar = pendiente o advertencia, rojo = problema o acción
 *  crítica, azul = en curso. Si un módulo necesita un estado nuevo se agrega
 *  AQUÍ y queda igual en todo el sistema. */
const ESTADOS: Record<string, { texto: string; clase: string; icono: string }> = {
  // Clientes
  activo: { texto: 'Activo', clase: 'bg-lightsuccess text-success-text', icono: 'tabler:circle-check' },
  suspendido: { texto: 'Suspendido', clase: 'bg-lighterror text-error-text', icono: 'tabler:circle-x' },
  pausado: { texto: 'Pausado', clase: 'bg-lightwarning text-warning-text', icono: 'tabler:player-pause' },
  pendiente_aprobacion: {
    texto: 'Pendiente',
    clase: 'bg-lightwarning text-warning-text',
    icono: 'tabler:clock',
  },
  aprobado: { texto: 'Aprobado', clase: 'bg-lightprimary text-primary-text', icono: 'tabler:thumb-up' },
  no_instalado: {
    texto: 'Por instalar',
    clase: 'bg-lightbrand text-brand-strong dark:text-brand',
    icono: 'tabler:tool',
  },
  rechazado: { texto: 'Rechazado', clase: 'bg-lighterror text-error-text', icono: 'tabler:ban' },
  anulado: { texto: 'Anulado', clase: 'bg-muted text-muted-foreground', icono: 'tabler:archive' },

  // Pagos
  pagado: { texto: 'Pagado', clase: 'bg-lightsuccess text-success-text', icono: 'tabler:circle-check' },
  pendiente: { texto: 'Pendiente', clase: 'bg-lightwarning text-warning-text', icono: 'tabler:clock' },
  vencido: { texto: 'Vencido', clase: 'bg-lighterror text-error-text', icono: 'tabler:alert-triangle' },
  corte_temporal: {
    texto: 'Corte temporal',
    clase: 'bg-lighterror text-error-text',
    icono: 'tabler:plug-off',
  },

  // Averías y órdenes de retiro
  asignada: { texto: 'Asignada', clase: 'bg-lightprimary text-primary-text', icono: 'tabler:user-check' },
  en_proceso: { texto: 'En proceso', clase: 'bg-lightinfo text-info-text', icono: 'tabler:progress' },
  resuelta: { texto: 'Resuelta', clase: 'bg-lightsuccess text-success-text', icono: 'tabler:circle-check' },
  completado: {
    texto: 'Completado',
    clase: 'bg-lightsuccess text-success-text',
    icono: 'tabler:circle-check',
  },
};

interface Props {
  estado: string;
  /** El icono acompaña al color para que el estado no dependa solo del tono */
  conIcono?: boolean;
  className?: string;
}

const StatusBadge = ({ estado, conIcono = true, className = '' }: Props) => {
  const e = ESTADOS[estado] ?? {
    texto: estado.replace(/_/g, ' '),
    clase: 'bg-muted text-muted-foreground',
    icono: 'tabler:point',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${e.clase} ${className}`}
    >
      {conIcono && <Icon icon={e.icono} width={14} className="shrink-0" />}
      {e.texto}
    </span>
  );
};

export default StatusBadge;
