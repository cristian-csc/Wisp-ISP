import { Icon } from '@iconify/react';
import type { DescripcionEstado } from './estadoConexion';

/** Indicador del estado de la conexión con WhatsApp. El punto late solo
 *  cuando está conectado, para que el movimiento signifique algo. */
const BadgeConexion = ({ estado }: { estado: DescripcionEstado }) => (
  <span
    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${estado.clases}`}
    role="status"
  >
    {estado.estado === 'conectando' ? (
      <Icon icon="tabler:loader-2" width={13} className="animate-spin" />
    ) : (
      <span className="relative grid size-2 place-items-center">
        {estado.estado === 'conectado' && (
          <span className={`absolute inline-flex size-2 animate-ping rounded-full opacity-75 ${estado.punto}`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${estado.punto}`} />
      </span>
    )}
    {estado.etiqueta}
  </span>
);

export default BadgeConexion;
