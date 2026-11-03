import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

export interface OpcionSegmentada<T extends string> {
  valor: T;
  etiqueta: string;
  icono?: string;
}

export interface SegmentedChoiceProps<T extends string> {
  opciones: readonly OpcionSegmentada<T>[];
  valor: T;
  onChange: (valor: T) => void;
  /** Nombre accesible del grupo */
  label?: string;
  className?: string;
}

/**
 * Elección entre pocas alternativas excluyentes (Persona/Empresa, por ejemplo)
 * en forma de botones grandes. Reemplaza a un radio pero se comporta igual.
 */
function SegmentedChoice<T extends string>({
  opciones,
  valor,
  onChange,
  label,
  className,
}: SegmentedChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-3', className)}>
      {opciones.map((op) => {
        const activo = op.valor === valor;
        return (
          <button
            key={op.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(op.valor)}
            className={cn(
              'transition-ui flex min-w-[9rem] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
              activo
                ? 'border-primary bg-lightprimary text-primary-text'
                : 'border-ld hover:border-primary/40 hover:bg-lightprimary/40',
            )}
          >
            {op.icono && <Icon icon={op.icono} width={18} className="shrink-0" />}
            {op.etiqueta}
            <Icon
              icon="tabler:circle-check-filled"
              width={18}
              className={cn('ml-auto shrink-0 text-primary', !activo && 'invisible')}
            />
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedChoice;
