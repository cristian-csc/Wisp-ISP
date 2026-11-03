export interface SegmentoEstado {
  etiqueta: string;
  valor: number;
  /** Variable CSS del sistema, ej. 'var(--success)' */
  color: string;
}

interface Props {
  segmentos: SegmentoEstado[];
  total: number;
}

const RADIO = 54;
const GROSOR = 16;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Dona de estados en SVG puro: el proyecto no tiene librería de gráficos y no
 *  hace falta añadir una para esto. El total va en el centro y cada segmento
 *  se identifica en la leyenda con su color, su cifra y su porcentaje — nunca
 *  solo por el color. */
const EstadoClientesDonut = ({ segmentos, total }: Props) => {
  const suma = segmentos.reduce((s, x) => s + x.valor, 0) || 1;
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          role="img"
          aria-label={`Estado de clientes: ${segmentos
            .map((s) => `${s.etiqueta} ${s.valor}`)
            .join(', ')}`}
        >
          {/* Pista de fondo */}
          <circle
            cx="70"
            cy="70"
            r={RADIO}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={GROSOR}
          />
          {segmentos.map((s) => {
            const largo = (s.valor / suma) * CIRCUNFERENCIA;
            const offset = -acumulado;
            acumulado += largo;
            if (s.valor === 0) return null;
            return (
              <circle
                key={s.etiqueta}
                cx="70"
                cy="70"
                r={RADIO}
                fill="none"
                stroke={s.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform="rotate(-90 70 70)"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none tabular-nums">{total}</span>
          <span className="mt-1 text-xs text-muted-foreground">Total</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2.5">
        {segmentos.map((s) => (
          <li key={s.etiqueta} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-muted-foreground">{s.etiqueta}</span>
            <span className="shrink-0 font-semibold tabular-nums">{s.valor}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round((s.valor / suma) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EstadoClientesDonut;
