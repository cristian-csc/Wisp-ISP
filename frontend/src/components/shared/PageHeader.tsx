import { Link } from 'react-router';
import { Icon } from '@iconify/react';

/** Color del recuadro del icono. `brand` es el de siempre; los demás solo
 *  para módulos con un color propio reconocible (WhatsApp es verde). */
type TonoIcono = 'brand' | 'success' | 'warning' | 'info';

const TONOS: Record<TonoIcono, string> = {
  brand: 'bg-lightbrand text-brand-strong dark:text-brand',
  success: 'bg-lightsuccess text-success',
  warning: 'bg-lightwarning text-warning',
  info: 'bg-lightinfo text-info',
};

interface Props {
  titulo: string;
  descripcion?: string;
  /** Icono en recuadro a la izquierda del título */
  icono?: string;
  /** Color del recuadro del icono. Por omisión, el de la marca. */
  tonoIcono?: TonoIcono;
  /** Contenido pegado al título, ej. un badge de estado */
  juntoAlTitulo?: React.ReactNode;
  /** Enlace de regreso, ej. { a: '/clientes', texto: 'Volver a clientes' } */
  volver?: { a: string; texto: string };
  /** Botones de acción, alineados a la derecha */
  acciones?: React.ReactNode;
}

/** Encabezado de página uniforme para todos los módulos: antes cada pantalla
 *  inventaba el suyo (unas con h1, otras sin título). */
const PageHeader = ({
  titulo,
  descripcion,
  icono,
  tonoIcono = 'brand',
  juntoAlTitulo,
  volver,
  acciones,
}: Props) => (
  <div className="mb-6">
    {volver && (
      <Link
        to={volver.a}
        className="transition-ui mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <Icon icon="tabler:arrow-left" width={16} />
        {volver.texto}
      </Link>
    )}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icono && (
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${TONOS[tonoIcono]}`}>
            <Icon icon={icono} width={22} />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold leading-tight">{titulo}</h1>
            {juntoAlTitulo}
          </div>
          {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  </div>
);

export default PageHeader;
