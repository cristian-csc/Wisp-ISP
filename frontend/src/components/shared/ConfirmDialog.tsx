import { useState } from 'react';
import { Icon } from '@iconify/react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from 'src/components/ui/alert-dialog';
import { cn } from 'src/lib/utils';

const TONOS = {
  error: { caja: 'bg-lighterror text-error-text', glifo: 'tabler:trash' },
  warning: { caja: 'bg-lightwarning text-warning-text', glifo: 'tabler:alert-triangle' },
  primary: { caja: 'bg-lightprimary text-primary-text', glifo: 'tabler:help-circle' },
} as const;

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Color e icono del aviso. Por omisión, el de borrar. */
  tone?: keyof typeof TONOS;
  icon?: string;
  onConfirm: () => Promise<void> | void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  tone = 'error',
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const t = TONOS[tone];

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="flex-row items-start gap-4 space-y-0">
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', t.caja)}>
            <Icon icon={icon ?? t.glifo} width={22} />
          </span>
          <div className="min-w-0">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && (
              <AlertDialogDescription className="mt-1.5 leading-relaxed">
                {description}
              </AlertDialogDescription>
            )}
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} className="gap-2">
            <Icon icon="tabler:x" width={17} />
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            className={cn('gap-2', tone === 'error' && 'bg-error hover:bg-error/90')}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            <Icon
              icon={loading ? 'tabler:loader-2' : (icon ?? t.glifo)}
              width={17}
              className={loading ? 'animate-spin' : ''}
            />
            {loading ? 'Eliminando…' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
