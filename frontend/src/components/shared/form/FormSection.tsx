import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

/** Rejilla estándar de los formularios: dos columnas en escritorio, una en móvil. */
export const FormGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2', className)}>{children}</div>
);

export interface FormSectionProps {
  /** Encabezado visual del grupo, p. ej. «Datos de la empresa» */
  title: string;
  icon?: string;
  /** Aclaración corta bajo el título */
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Agrupa campos afines bajo un encabezado con icono. Solo organiza: no añade
 * campos ni validaciones.
 */
const FormSection = ({ title, icon, hint, children, className }: FormSectionProps) => (
  <div className={cn('overflow-hidden rounded-xl border border-ld md:col-span-2', className)}>
    <div className="flex items-center gap-2 border-b border-ld bg-lightprimary px-4 py-2.5">
      {icon && <Icon icon={icon} width={17} className="shrink-0 text-primary-text" />}
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
    </div>
    <div className="bg-surface-2 px-4 py-4">
      <FormGrid>{children}</FormGrid>
    </div>
  </div>
);

export default FormSection;
