import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { Label } from 'src/components/ui/label';
import { cn } from 'src/lib/utils';

export interface FormFieldProps {
  label: string;
  /** Icono a la izquierda de la etiqueta */
  icon?: string;
  /** Marca el asterisco. Solo donde el sistema realmente lo exige. */
  required?: boolean;
  /** id del control, para que la etiqueta lo enfoque al pulsarla */
  htmlFor?: string;
  /** Texto de ayuda bajo el campo */
  hint?: ReactNode;
  /** Mensaje de validación; cuando llega, reemplaza a la ayuda */
  error?: string | null;
  /** Ocupa las dos columnas */
  wide?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Etiqueta + control + ayuda, con el mismo ritmo en todo el sistema.
 * No valida nada: el asterisco y el error los decide quien lo usa.
 */
const FormField = ({
  label,
  icon,
  required,
  htmlFor,
  hint,
  error,
  wide,
  children,
  className,
}: FormFieldProps) => (
  <div className={cn(wide && 'md:col-span-2', className)}>
    <Label htmlFor={htmlFor} className="mb-2 gap-1.5 text-[13px] font-semibold">
      {icon && <Icon icon={icon} width={16} className="shrink-0 text-primary-text" />}
      {label}
      {required && (
        <span aria-hidden="true" className="text-error-text">
          *
        </span>
      )}
    </Label>
    {children}
    {error ? (
      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-error-text">
        <Icon icon="tabler:alert-circle" width={14} className="mt-px shrink-0" />
        {error}
      </p>
    ) : (
      hint && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Icon icon="tabler:info-circle" width={14} className="mt-px shrink-0" />
          <span>{hint}</span>
        </p>
      )
    )}
  </div>
);

/**
 * Pone un icono dentro del control y le abre sitio. Sirve igual para Input,
 * SelectTrigger y cualquier control que reciba padding por clase.
 */
export const FieldIcon = ({
  icon,
  children,
  className,
}: {
  icon: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('relative [&_input]:pl-10 [&>button]:pl-10', className)}>
    <Icon
      icon={icon}
      width={17}
      aria-hidden="true"
      className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
    />
    {children}
  </div>
);

export default FormField;
