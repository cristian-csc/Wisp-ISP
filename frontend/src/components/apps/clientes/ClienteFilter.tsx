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

const TONO_TARJETA: Record<string, { caja: string; texto: string }> = {
  success: { caja: 'bg-lightsuccess', texto: 'text-success' },
  warning: { caja: 'bg-lightwarning', texto: 'text-warning' },
  error: { caja: 'bg-lighterror', texto: 'text-error' },
  primary: { caja: 'bg-lightprimary', texto: 'text-primary' },
  muted: { caja: 'bg-muted', texto: 'text-muted-foreground' },
};

/**
 * Los estados del cliente, cada uno con su cuenta, y el único sitio donde se
 * filtra por estado.
 *
 * Están los ocho más «Todos», todos del mismo tamaño y en la misma cuadrícula:
 * antes cuatro iban en tarjetas grandes y los otros cuatro en una fila de
 * pastillas debajo, que parecía un apéndice y no parte del filtro.
 *
 * El número va arriba y la etiqueta debajo, con sitio reservado para dos
 * líneas: así «Pendientes de aprobación» no empuja su tarjeta ni desalinea los
 * números de las vecinas.
 *
 * El borde está siempre puesto, transparente cuando la tarjeta no es la
 * elegida. Si solo apareciera al elegirla, la tarjeta crecería 2 px y la
 * cuadrícula entera daría un salto al pulsar.
 */
const ClienteFilter = ({ filter, setFilter, resumen }: Props) => {
  const n = (e: EstadoCliente) => resumen?.por_estado[e] ?? 0;

  const tarjetas: {
    valor: EstadoCliente | 'todos';
    etiqueta: string;
    tono: keyof typeof TONO_TARJETA;
    cuenta: number;
  }[] = [
    { valor: 'todos', etiqueta: 'Todos', tono: 'primary', cuenta: resumen?.total ?? 0 },
    ...ESTADOS_CLIENTE.map((e) => ({
      valor: e.valor,
      etiqueta: e.etiqueta,
      tono: e.tono,
      cuenta: n(e.valor),
    })),
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
            className={`transition-ui flex flex-col items-center rounded-xl border-2 px-2 py-3 text-center ${
              tono.caja
            } ${elegida ? 'border-primary shadow-sm' : 'border-transparent hover:shadow-md'}`}
          >
            <span className={`text-2xl font-bold leading-none ${tono.texto}`}>
              {t.cuenta}
            </span>
            <span
              className={`mt-1.5 flex min-h-[2.1rem] items-start justify-center text-[11px] font-semibold leading-tight ${tono.texto}`}
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
