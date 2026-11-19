import { Icon } from '@iconify/react';
import type { Borne } from 'src/lib/cajasnap';

/**
 * Los bornes de una caja NAP como una cuadrícula numerada.
 *
 * Antes era una fila de puntos de color. El problema del punto es que dice
 * cuántos hay de cada estado pero no CUÁL es cuál: el técnico que va a campo
 * necesita saber que el borne libre es el 7, no que quedan tres libres. Aquí
 * cada recuadro lleva su número real.
 *
 * Cuatro columnas siempre, así una caja de 8 se lee como 2 filas de 4 y una
 * de 16 como 4 filas de 4 — que es como están puestas en el poste. Los
 * recuadros son cuadrados y de ancho flexible, de modo que la rejilla entra
 * completa en una pantalla estrecha en vez de partirse.
 */

const ESTILO: Record<Borne['estado'], string> = {
  // El número va en --on-solid, no en blanco fijo: en modo claro eso ES
  // blanco sobre verde oscuro, y en oscuro el verde es brillante y el número
  // pasa a tinta. Blanco fijo daría 2,3:1 sobre el verde del modo oscuro.
  ocupado: 'bg-success-solid text-on-solid',
  libre: 'border border-ld bg-muted text-foreground',
  danado: 'bg-error-solid text-on-solid',
};

const NOMBRE: Record<Borne['estado'], string> = {
  ocupado: 'ocupado',
  libre: 'libre',
  danado: 'dañado',
};

interface Props {
  bornes: Borne[];
  /** Recuadros más chicos, para las tarjetas estrechas. */
  compacto?: boolean;
  /** Sin esto los bornes son informativos: no se pueden pulsar ni reciben foco. */
  onClickBorne?: (borne: Borne) => void;
}

const BorneGrid = ({ bornes, compacto = false, onClickBorne }: Props) => {
  const tamano = compacto ? 'text-[11px]' : 'text-xs';

  return (
    <div className={`grid grid-cols-4 ${compacto ? 'gap-1' : 'gap-1.5'}`}>
      {bornes.map((b) => {
        const etiqueta = `Borne ${b.numero}, ${NOMBRE[b.estado]}`;
        const detalle =
          b.estado === 'ocupado' && b.cliente ? `${etiqueta} — ${b.cliente.nombre}` : etiqueta;

        const contenido = (
          <>
            {b.numero}
            {/* La × no sustituye al número: lo acompaña. Así el borne dañado
                se distingue también sin color, y se sigue sabiendo cuál es. */}
            {b.estado === 'danado' && (
              <Icon
                icon="tabler:x"
                width={compacto ? 9 : 11}
                aria-hidden="true"
                className="absolute right-0.5 top-0.5"
              />
            )}
          </>
        );

        const clases = `relative grid aspect-square w-full place-items-center rounded-md font-semibold tabular-nums ${tamano} ${ESTILO[b.estado]}`;

        return onClickBorne ? (
          <button
            key={b.id}
            type="button"
            onClick={() => onClickBorne(b)}
            aria-label={etiqueta}
            title={detalle}
            className={`transition-ui cursor-pointer hover:brightness-95 ${clases}`}
          >
            {contenido}
          </button>
        ) : (
          <span
            key={b.id}
            role="img"
            aria-label={etiqueta}
            title={detalle}
            className={clases}
          >
            {contenido}
          </span>
        );
      })}
    </div>
  );
};

export default BorneGrid;
