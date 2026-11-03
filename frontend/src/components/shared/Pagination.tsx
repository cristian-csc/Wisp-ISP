import { Icon } from '@iconify/react';

interface Props {
  pagina: number;
  totalPaginas: number;
  onCambiar: (p: number) => void;
  /** Texto a la izquierda, ej. "312 clientes" */
  resumen?: string;
}

/** Páginas a mostrar, con puntos suspensivos cuando hay muchas. */
function paginasVisibles(actual: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const cerca = [actual - 1, actual, actual + 1].filter((p) => p > 1 && p < total);
  const salida: (number | 'gap')[] = [1];
  if (cerca.length && cerca[0] > 2) salida.push('gap');
  salida.push(...cerca);
  const ultimo = cerca.length ? cerca[cerca.length - 1] : 1;
  if (ultimo < total - 1) salida.push('gap');
  salida.push(total);
  return salida;
}

const Pagination = ({ pagina, totalPaginas, onCambiar, resumen }: Props) => {
  if (totalPaginas <= 1) {
    return resumen ? <p className="px-1 py-3 text-sm text-muted-foreground">{resumen}</p> : null;
  }

  const flecha =
    'transition-ui grid size-8 place-items-center rounded-lg border border-ld text-sm hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      {resumen && <p className="text-sm text-muted-foreground">{resumen}</p>}
      <div className="ms-auto flex items-center gap-1">
        <button
          type="button"
          className={flecha}
          onClick={() => onCambiar(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <Icon icon="tabler:chevron-left" width={16} />
        </button>

        {paginasVisibles(pagina, totalPaginas).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onCambiar(p)}
              aria-current={p === pagina ? 'page' : undefined}
              className={`transition-ui grid size-8 place-items-center rounded-lg text-sm ${
                p === pagina
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'border border-ld hover:border-primary/40 hover:text-primary'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className={flecha}
          onClick={() => onCambiar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Página siguiente"
        >
          <Icon icon="tabler:chevron-right" width={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
