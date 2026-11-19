import type { Borne } from 'src/lib/cajasnap';

/**
 * Los bornes de una caja NAP, numerados.
 *
 * El recuadro es neutro y el estado lo dicen dos cosas juntas: un punto de
 * color y la palabra. El color solo no basta —ni para quien no lo distingue,
 * ni en una pantalla al sol— y la palabra sola se lee despacio. Juntas se
 * entienden de un vistazo y resisten una fotocopia en blanco y negro.
 *
 * Cuatro columnas siempre: una caja de 8 se lee como 2 filas de 4 y una de 16
 * como 4 filas de 4, que es como están puestas en el poste.
 *
 * Aquí no va el nombre del cliente. Está en el registro de abonados, donde
 * cabe entero junto a su plan y su precinto; repetirlo en un recuadro de
 * cuatro centímetros obligaría a cortarlo.
 */

const PUNTO: Record<Borne['estado'], string> = {
  ocupado: 'bg-success',
  libre: 'bg-muted-foreground',
  danado: 'bg-error',
};

const PALABRA: Record<Borne['estado'], string> = {
  ocupado: 'Ocupado',
  libre: 'Libre',
  danado: 'Dañado',
};

interface Props {
  bornes: Borne[];
  /** Solo los números, sin la palabra del estado. Para los sitios estrechos
   *  donde la rejilla acompaña y no es el asunto principal. */
  compacto?: boolean;
  /** Sin esto los bornes son informativos: ni se pulsan ni reciben foco. */
  onClickBorne?: (borne: Borne) => void;
}

const BorneGrid = ({ bornes, compacto = false, onClickBorne }: Props) => (
  <div className={`grid grid-cols-4 ${compacto ? 'gap-1.5' : 'gap-2.5'}`}>
    {bornes.map((b) => {
      // Con dos cifras los números quedan en columna: 01 bajo 05, no 1 bajo 5.
      const numero = String(b.numero).padStart(2, '0');
      const etiqueta = `Borne ${b.numero}, ${PALABRA[b.estado].toLowerCase()}`;

      const contenido = compacto ? (
        <span className="flex items-center justify-center gap-1.5">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${PUNTO[b.estado]}`} />
          <span className="text-xs font-bold tabular-nums">{numero}</span>
        </span>
      ) : (
        <>
          <span className="block text-base font-bold leading-none tabular-nums">{numero}</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PUNTO[b.estado]}`} />
            <span className="truncate text-xs text-muted-foreground">{PALABRA[b.estado]}</span>
          </span>
        </>
      );

      const clases = `min-w-0 rounded-lg border border-ld bg-card text-left ${
        compacto ? 'px-1.5 py-1.5' : 'px-3 py-2.5'
      }`;

      return onClickBorne ? (
        <button
          key={b.id}
          type="button"
          onClick={() => onClickBorne(b)}
          aria-label={etiqueta}
          className={`transition-ui cursor-pointer hover:border-brand/60 hover:bg-muted ${clases}`}
        >
          {contenido}
        </button>
      ) : (
        <span key={b.id} role="img" aria-label={etiqueta} className={`block ${clases}`}>
          {contenido}
        </span>
      );
    })}
  </div>
);

export default BorneGrid;
