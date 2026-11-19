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
  <div className={cn('rounded-xl border border-ld bg-card p-4 md:col-span-2', className)}>
    {/* Un filete bajo el titulo en vez de una franja de color: separa igual
        y no mete un bloque de color por cada grupo de campos. */}
    <div className="mb-4 flex items-center gap-2 border-b border-ld pb-2.5">
      {icon && (
        <Icon icon={icon} width={19} className="shrink-0 text-brand-strong dark:text-brand" />
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
    </div>
    <FormGrid>{children}</FormGrid>
  </div>
);

export default FormSection;
