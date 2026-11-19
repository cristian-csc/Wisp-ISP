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

/* El icono va suelto sobre el azul noche, sin recuadro detras. Los cinco
   tonos se comprobaron sobre #0b1220: el mas flojo es el rojo con 3,83:1,
   por encima del 3:1 que piden los elementos graficos. */
const TONOS = {
  brand: 'text-brand',
  primary: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
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
      {/* Encabezado en azul noche.
          Antes era un degradado claro con una antena dibujada al fondo. El
          adorno competia con el titulo y, sobre todo, la cabecera clara se
          confundia con los campos: no se veia donde terminaba el encabezado
          y empezaba el formulario. En oscuro esa frontera se lee sola. */}
      <div className="shrink-0 border-b border-sidebar-border bg-sidebar px-6 py-5">
        <div className="flex items-start gap-3.5 pr-12">
          {icon && <Icon icon={icon} width={32} className={cn('mt-0.5 shrink-0', TONOS[tone])} />}
          <div className="min-w-0">
            <DialogTitle className="truncate text-xl font-semibold text-sidebar-foreground-strong">
              {title}
            </DialogTitle>
            {subtitle && <p className="mt-0.5 text-sm text-sidebar-foreground">{subtitle}</p>}
          </div>
        </div>
      </div>

      {/* Cuerpo, sobre el gris del area de trabajo: asi las secciones
          blancas de dentro se separan del fondo en vez de fundirse con el. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-6 py-5">{children}</div>

      {/* Botonera */}
      {footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-ld bg-card px-6 py-4">
          {footer}
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default FormDialog;
