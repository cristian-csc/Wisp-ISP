import {
  ESTADOS_CLIENTE,
  type EstadoCliente,
  type ResumenEstados,
} from 'src/lib/clientes';

interface Props {
  filter: EstadoCliente | 'todos';
  setFilter: (f: EstadoCliente | 'todos') => void;
  /** Las cuentas por estado, pedidas una sola vez por la pantalla */
  resumen: ResumenEstados | null;
}

/**
 * Los cuatro estados que se miran a diario. Los otros cuatro —aprobados sin
 * instalar, pausados, rechazados y anulados— no caben aquí sin convertir el
 * encabezado en una parrilla ilegible; se eligen en «Otros estados», en la
 * barra de abajo, y comparten este mismo filtro.
 */
export const ESTADOS_DESTACADOS: EstadoCliente[] = [
  'activo',
  'pendiente_aprobacion',
  'suspendido',
  'no_instalado',
];

/** Tarjetas neutras: el estado lo dice un punto de color junto a la etiqueta. */
const PUNTO: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  primary: 'bg-brand',
  muted: 'bg-muted-foreground',
};

/**
 * Cinco tarjetas iguales: «Todos» y los cuatro estados de diario.
 *
 * Para que queden parejas de verdad hacen falta tres cosas que no se ven pero
 * se notan:
 *
 *   - El número arriba y la etiqueta debajo, con sitio reservado para dos
 *     líneas. Si no, «Pendientes de aprobación» empuja su tarjeta y desalinea
 *     los números de las vecinas.
 *   - El borde está siempre puesto, transparente cuando la tarjeta no es la
 *     elegida. Si solo apareciera al elegirla, la tarjeta crecería 2 px y la
 *     fila entera daría un salto al pulsar.
 *   - Todas con el mismo alto mínimo, así una cuenta de 4 cifras no hace más
 *     alta a su tarjeta que a las demás.
 */
const ClienteFilter = ({ filter, setFilter, resumen }: Props) => {
  const tarjetas: {
    valor: EstadoCliente | 'todos';
    etiqueta: string;
    tono: string;
    cuenta: number;
  }[] = [
    { valor: 'todos', etiqueta: 'Todos', tono: 'primary', cuenta: resumen?.total ?? 0 },
    ...ESTADOS_DESTACADOS.map((valor) => {
      const def = ESTADOS_CLIENTE.find((e) => e.valor === valor)!;
      return {
        valor: def.valor,
        etiqueta: def.etiqueta,
        tono: def.tono,
        cuenta: resumen?.por_estado[def.valor] ?? 0,
      };
    }),
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tarjetas.map((t) => {
        const elegida = filter === t.valor;
        return (
          <button
            key={t.valor}
            type="button"
            onClick={() => setFilter(t.valor)}
            aria-pressed={elegida}
            className={`transition-ui flex min-h-[84px] flex-col justify-center rounded-xl border-2 px-3.5 py-3 text-left ${
              elegida ? 'border-primary bg-lightprimary' : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <span className="text-2xl font-bold leading-none text-foreground">{t.cuenta}</span>
            <span className="mt-2 flex items-start gap-1.5 text-xs font-medium leading-tight text-muted-foreground">
              <span aria-hidden="true" className={`mt-1 size-2 shrink-0 rounded-full ${PUNTO[t.tono]}`} />
              {t.etiqueta}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ClienteFilter;
