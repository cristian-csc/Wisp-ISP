import { Link } from 'react-router';
import { Icon } from '@iconify/react';

interface Props {
  titulo: string;
  descripcion?: string;
  /** Enlace de regreso, ej. { a: '/clientes', texto: 'Volver a clientes' } */
  volver?: { a: string; texto: string };
  /** Botones de acción, alineados a la derecha */
  acciones?: React.ReactNode;
}

/** Encabezado de página uniforme para todos los módulos: antes cada pantalla
 *  inventaba el suyo (unas con h1, otras sin título). */
const PageHeader = ({ titulo, descripcion, volver, acciones }: Props) => (
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
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  </div>
);

export default PageHeader;
