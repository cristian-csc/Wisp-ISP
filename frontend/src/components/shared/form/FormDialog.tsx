import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { Dialog, DialogContent, DialogTitle } from 'src/components/ui/dialog';
import { cn } from 'src/lib/utils';

const ANCHOS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
  xxl: 'sm:max-w-5xl',
} as const;

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título del encabezado */
  title: string;
  /** Línea de apoyo bajo el título */
  subtitle?: string;
  /** Icono del recuadro del encabezado (set de Iconify) */
  icon?: string;
  /** Color del recuadro del icono: naranja WISP (acento) o azul corporativo */
  tone?: 'brand' | 'primary' | 'success' | 'warning' | 'error';
  size?: keyof typeof ANCHOS;
  /** Botonera inferior, siempre visible aunque el cuerpo tenga scroll */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TONOS = {
  brand: 'bg-lightbrand text-brand-strong',
  primary: 'bg-lightprimary text-primary-text',
  success: 'bg-lightsuccess text-success-text',
  warning: 'bg-lightwarning text-warning-text',
  error: 'bg-lighterror text-error-text',
} as const;

/**
 * Carcasa común de todos los formularios en ventana: encabezado con icono,
 * cuerpo con scroll propio y botonera fija abajo. El contenido se pasa como
 * children; la validación y el envío siguen siendo del formulario de cada
 * módulo — esto es solo la presentación.
 */
const FormDialog = ({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  tone = 'brand',
  size = 'lg',
  footer,
  children,
  className,
}: FormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn(
        'flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0',
        ANCHOS[size],
        className,
      )}
    >
      {/* Encabezado */}
      <div className="relative shrink-0 overflow-hidden border-b border-ld bg-[linear-gradient(100deg,var(--lightprimary)_0%,var(--card)_52%,var(--lightbrand)_100%)] px-6 py-5">
        {/* Adorno: antena y ondas de señal, puramente decorativo. Solo en las
            ventanas anchas — en las chicas le quitaría sitio al texto. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          className={cn(
            'pointer-events-none absolute right-16 top-1/2 hidden h-20 w-20 -translate-y-1/2',
            (size === 'lg' || size === 'xl' || size === 'xxl') && 'sm:block',
          )}
        >
          <g fill="none" strokeLinecap="round" strokeWidth="7">
            <g className="text-brand opacity-30" stroke="currentColor">
              <path d="M42 74a26 26 0 0136 0" />
              <path d="M28 58a46 46 0 0164 0" />
              <path d="M15 43a65 65 0 0190 0" />
            </g>
            <g className="text-primary opacity-25" stroke="currentColor">
              <path d="M60 78v22" />
              <path d="M40 104h40" strokeWidth="9" />
            </g>
          </g>
        </svg>

        <div className="relative flex items-start gap-4 pr-12">
          {icon && (
            <span
              className={cn(
                'grid h-12 w-12 shrink-0 place-items-center rounded-2xl',
                TONOS[tone],
              )}
            >
              <Icon icon={icon} width={24} />
            </span>
          )}
          <div className="min-w-0">
            <DialogTitle className="truncate text-xl font-semibold">{title}</DialogTitle>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

      {/* Botonera */}
      {footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-ld bg-surface-2 px-6 py-4">
          {footer}
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default FormDialog;
