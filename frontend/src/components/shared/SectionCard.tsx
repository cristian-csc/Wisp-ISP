import { Icon } from '@iconify/react';
import CardBox from './CardBox';

interface Props {
  titulo: string;
  icono?: string;
  descripcion?: string;
  /** Contenido alineado a la derecha del título: enlaces, selectores, leyenda */
  extra?: React.ReactNode;
  /** Quita el relleno del cuerpo, para tablas que llegan al borde */
  sinRelleno?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Tarjeta con cabecera: el patrón que repiten casi todos los módulos
 *  (un título, algo a la derecha y contenido debajo). */
const SectionCard = ({
  titulo,
  icono,
  descripcion,
  extra,
  sinRelleno = false,
  className = '',
  children,
}: Props) => (
  <CardBox className={`flex h-full flex-col ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icono && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lightprimary">
            <Icon icon={icono} width={17} className="text-primary" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight">{titulo}</h2>
          {descripcion && (
            <p className="truncate text-xs text-muted-foreground">{descripcion}</p>
          )}
        </div>
      </div>
      {extra && <div className="flex min-w-0 flex-wrap items-center gap-2">{extra}</div>}
    </div>
    <div className={`flex-1 ${sinRelleno ? '' : 'px-5 pb-5'}`}>{children}</div>
  </CardBox>
);

export default SectionCard;
