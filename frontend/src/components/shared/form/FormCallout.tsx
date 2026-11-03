import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

const TONOS = {
  info: { caja: 'bg-lightprimary text-foreground', icono: 'text-primary-text', glifo: 'tabler:info-circle' },
  warning: { caja: 'bg-lightwarning text-foreground', icono: 'text-warning-text', glifo: 'tabler:alert-triangle' },
  error: { caja: 'bg-lighterror text-foreground', icono: 'text-error-text', glifo: 'tabler:alert-circle' },
  success: { caja: 'bg-lightsuccess text-foreground', icono: 'text-success-text', glifo: 'tabler:circle-check' },
} as const;

export interface FormCalloutProps {
  tone?: keyof typeof TONOS;
  icon?: string;
  children: ReactNode;
  className?: string;
}

/** Aviso dentro de un formulario: explica una regla, no sustituye a un error. */
const FormCallout = ({ tone = 'info', icon, children, className }: FormCalloutProps) => {
  const t = TONOS[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm', t.caja, className)}>
      <Icon icon={icon ?? t.glifo} width={19} className={cn('mt-0.5 shrink-0', t.icono)} />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
};

export default FormCallout;
