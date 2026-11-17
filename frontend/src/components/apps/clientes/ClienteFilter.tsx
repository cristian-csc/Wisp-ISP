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

/** Las cuatro de siempre, las que se miran a diario. Los otros cuatro estados
 *  no desaparecen: están en el desplegable de la barra, con su cuenta. */
const DESTACADOS: EstadoCliente[] = [
  'activo',
  'pendiente_aprobacion',
  'suspendido',
  'no_instalado',
];

const TONO_TARJETA: Record<string, { caja: string; texto: string }> = {
  success: { caja: 'bg-lightsuccess dark:bg-lightsuccess', texto: 'text-success' },
  warning: { caja: 'bg-lightwarning dark:bg-lightwarning', texto: 'text-warning' },
  error: { caja: 'bg-lighterror dark:bg-lighterror', texto: 'text-error' },
  primary: { caja: 'bg-lightprimary dark:bg-lightprimary', texto: 'text-primary' },
  muted: { caja: 'bg-muted', texto: 'text-muted-foreground' },
};

const ClienteFilter = ({ filter, setFilter, resumen }: Props) => {
  const n = (e: EstadoCliente) => resumen?.por_estado[e] ?? 0;

  return (
    <div className="mb-6">
      <div className="grid grid-cols-12 gap-6">
        <div className="lg:col-span-2 md:col-span-4 col-span-12">
          <button
            type="button"
            onClick={() => setFilter('todos')}
            className={`w-full rounded-md p-[30px] text-center transition-shadow ${
              TONO_TARJETA.primary.caja
            } ${filter === 'todos' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
          >
            <h3 className={`text-2xl ${TONO_TARJETA.primary.texto}`}>
              {resumen?.total ?? 0}
            </h3>
            <h6 className={`text-base ${TONO_TARJETA.primary.texto}`}>Todos</h6>
          </button>
        </div>

        {DESTACADOS.map((valor) => {
          const def = ESTADOS_CLIENTE.find((e) => e.valor === valor)!;
          const tono = TONO_TARJETA[def.tono];
          return (
            <div key={valor} className="lg:col-span-2 md:col-span-4 col-span-12">
              <button
                type="button"
                onClick={() => setFilter(valor)}
                className={`w-full rounded-md p-[30px] text-center transition-shadow ${
                  tono.caja
                } ${filter === valor ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
              >
                <h3 className={`text-2xl ${tono.texto}`}>{n(valor)}</h3>
                <h6 className={`text-base ${tono.texto}`}>{def.etiqueta}</h6>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClienteFilter;
