interface Props {
  /** Cuántas líneas de esqueleto mostrar */
  filas?: number;
  className?: string;
}

/** Esqueleto de carga: ocupa un sitio parecido al del contenido real para que
 *  la pantalla no pegue un salto cuando llegan los datos. */
const LoadingState = ({ filas = 4, className = '' }: Props) => (
  <div className={`space-y-3 p-5 ${className}`} role="status" aria-label="Cargando">
    {Array.from({ length: filas }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className="size-9 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

export default LoadingState;
