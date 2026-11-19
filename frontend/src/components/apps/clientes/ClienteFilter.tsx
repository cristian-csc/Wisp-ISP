import { Icon } from '@iconify/react';
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

/** Un icono por tarjeta: a un golpe de vista se distingue la fila sin leer. */
const ICONOS: Record<string, string> = {
  todos: 'tabler:users',
  activo: 'tabler:circle-check',
  pendiente_aprobacion: 'tabler:clock',
  suspendido: 'tabler:player-pause',
  no_instalado: 'tabler:tool',
};

/** El color del icono dice el estado sin depender de la etiqueta. */
const TONO_ICONO: Record<string, string> = {
  success: 'text-success-text dark:text-success',
  warning: 'text-warning-text dark:text-warning',
  error: 'text-error-text dark:text-error',
  primary: 'text-brand-strong dark:text-brand',
  muted: 'text-muted-foreground',
};

/**
 * Cinco tarjetas iguales: «Todos» y los cuatro estados de diario.
 *
 * Para que queden parejas de verdad hacen falta tres cosas que no se ven pero
 * se notan:
 *
 *   - La etiqueta arriba y el número debajo, con sitio reservado para dos
 *     líneas de etiqueta. Si no, «Pendientes de aprobación» empuja su tarjeta
 *     y desalinea los números de las vecinas.
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
            className={`transition-ui relative flex min-h-[86px] items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left ${
              elegida
                ? 'border-brand bg-lightbrand'
                : 'border-border bg-card hover:border-brand/50'
            }`}
          >
            <Icon
              icon={ICONOS[t.valor] ?? 'tabler:point'}
              width={25}
              className={`shrink-0 ${TONO_ICONO[t.tono] ?? TONO_ICONO.muted}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium leading-tight text-muted-foreground">
                {t.etiqueta}
              </span>
              <span className="mt-1 block text-2xl font-bold leading-none text-foreground">
                {t.cuenta}
              </span>
            </span>

            {/* La insignia confirma cuál está puesta sin depender solo del
                borde naranja, que a cierta distancia se pierde. */}
            {elegida && (
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground"
              >
                <Icon icon="tabler:check" width={13} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ClienteFilter;
