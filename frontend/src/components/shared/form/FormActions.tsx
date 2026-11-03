import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';

export interface FormActionsProps {
  /** Cierra sin guardar */
  onCancel: () => void;
  cancelLabel?: string;
  /** Texto del botón principal. El azul corporativo es siempre el de acción. */
  submitLabel: string;
  submitIcon?: string;
  /** id del <form> al que pertenece, cuando el botón vive fuera de él */
  submitForm?: string;
  /** Se dispara en vez de enviar un <form> */
  onSubmit?: () => void;
  /** Deshabilita y muestra «guardando» */
  submitting?: boolean;
  disabled?: boolean;
  /** Variante del botón principal, para acciones destructivas */
  submitVariant?: 'default' | 'destructive';
  /** Botones extra a la izquierda */
  children?: ReactNode;
}

/** Botonera de formulario: cancelar discreto, acción principal destacada. */
const FormActions = ({
  onCancel,
  cancelLabel = 'Cancelar',
  submitLabel,
  submitIcon = 'tabler:device-floppy',
  submitForm,
  onSubmit,
  submitting,
  disabled,
  submitVariant = 'default',
  children,
}: FormActionsProps) => (
  <>
    {children && <div className="mr-auto flex flex-wrap items-center gap-2">{children}</div>}
    <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
      <Icon icon="tabler:x" width={17} />
      {cancelLabel}
    </Button>
    <Button
      type={submitForm ? 'submit' : 'button'}
      form={submitForm}
      variant={submitVariant}
      onClick={onSubmit}
      disabled={submitting || disabled}
      className="gap-2"
    >
      <Icon icon={submitting ? 'tabler:loader-2' : submitIcon} width={17} className={submitting ? 'animate-spin' : ''} />
      {submitting ? 'Guardando…' : submitLabel}
    </Button>
  </>
);

export default FormActions;
