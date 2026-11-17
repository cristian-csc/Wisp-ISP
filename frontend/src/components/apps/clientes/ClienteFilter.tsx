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

const TONO_TARJETA: Record<string, { caja: string; texto: string }> = {
  success: { caja: 'bg-lightsuccess', texto: 'text-success' },
  warning: { caja: 'bg-lightwarning', texto: 'text-warning' },
  error: { caja: 'bg-lighterror', texto: 'text-error' },
  primary: { caja: 'bg-lightprimary', texto: 'text-primary' },
  muted: { caja: 'bg-muted', texto: 'text-muted-foreground' },
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
    tono: keyof typeof TONO_TARJETA;
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
        const tono = TONO_TARJETA[t.tono];
        const elegida = filter === t.valor;
        return (
          <button
            key={t.valor}
            type="button"
            onClick={() => setFilter(t.valor)}
            aria-pressed={elegida}
            className={`transition-ui flex min-h-[94px] flex-col items-center rounded-xl border-2 px-3 py-4 text-center ${
              tono.caja
            } ${elegida ? 'border-primary shadow-sm' : 'border-transparent hover:shadow-md'}`}
          >
            <span className={`text-3xl font-bold leading-none ${tono.texto}`}>
              {t.cuenta}
            </span>
            <span
              className={`mt-2 flex min-h-[2.1rem] items-start justify-center text-xs font-semibold leading-tight ${tono.texto}`}
            >
              {t.etiqueta}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ClienteFilter;
