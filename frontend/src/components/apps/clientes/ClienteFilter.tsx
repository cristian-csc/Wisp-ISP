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
    { valor: 'todos', etiqueta: 'Todos', tono: 'muted', cuenta: resumen?.total ?? 0 },
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
    <div role="tablist" aria-label="Estado de los clientes" className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ld px-1 [scrollbar-width:none]">
      {tarjetas.map((t) => {
        const elegida = filter === t.valor;
        return (
          <button
            key={t.valor}
            type="button"
            role="tab"
            aria-selected={elegida}
            onClick={() => setFilter(t.valor)}
            className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm transition-colors duration-150 ${
              elegida ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PUNTO[t.tono]}`} />
            <span className="whitespace-nowrap">{t.etiqueta}</span>
            <span
              className={`rounded-md px-1.5 text-xs tabular-nums ${elegida ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            >
              {t.cuenta}
            </span>
            {elegida && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
};

export default ClienteFilter;
