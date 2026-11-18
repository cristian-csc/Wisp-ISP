import { Icon } from '@iconify/react';
import { cn } from 'src/lib/utils';

export interface Paso {
  titulo: string;
  /** Una línea con lo que ya se eligió en ese paso, para no tener que volver. */
  resumen?: string;
}

interface Props {
  pasos: Paso[];
  actual: number;
  /** Permite volver a un paso ya hecho tocándolo. */
  onIr?: (indice: number) => void;
  className?: string;
}

/** Indicador de avance para tareas en varios pasos. Los pasos hechos se
 *  pueden volver a abrir; los que faltan no, para no saltarse ninguno. */
const Pasos = ({ pasos, actual, onIr, className }: Props) => (
  <ol className={cn('flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0', className)}>
    {pasos.map((p, i) => {
      const hecho = i < actual;
      const enCurso = i === actual;
      const contenido = (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-150',
              hecho && 'bg-foreground text-background',
              enCurso && 'bg-brand text-brand-foreground',
              !hecho && !enCurso && 'border border-ld text-muted-foreground',
            )}
          >
            {hecho ? <Icon icon="tabler:check" width={15} /> : i + 1}
          </span>
          <span className="min-w-0 text-left">
            <span className={cn('block text-sm leading-tight', enCurso ? 'font-semibold' : hecho ? 'font-medium' : 'text-muted-foreground')}>
              {p.titulo}
            </span>
            {p.resumen && hecho && <span className="block truncate text-xs text-muted-foreground">{p.resumen}</span>}
          </span>
        </>
      );
      return (
        <li key={p.titulo} className="flex min-w-0 flex-1 items-center gap-3 sm:pe-3">
          {hecho && onIr ? (
            <button
              type="button"
              onClick={() => onIr(i)}
              className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 transition-colors duration-150 hover:bg-surface-2"
            >
              {contenido}
            </button>
          ) : (
            <div aria-current={enCurso ? 'step' : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-1">
              {contenido}
            </div>
          )}
          {i < pasos.length - 1 && <span aria-hidden="true" className="hidden h-px w-6 shrink-0 bg-border sm:block lg:w-10" />}
        </li>
      );
    })}
  </ol>
);

export default Pasos;
