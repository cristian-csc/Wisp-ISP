import { useEffect, useState } from 'react';
import {
  ESTADOS_CLIENTE,
  resumenEstados,
  type EstadoCliente,
  type ResumenEstados,
} from 'src/lib/clientes';

interface Props {
  filter: EstadoCliente | 'todos';
  setFilter: (f: EstadoCliente | 'todos') => void;
  /** Cuando la sección es de un solo tipo, los contadores se limitan a él */
  tipo?: 'fibra_optica' | 'inalambrico';
}

/** Las cuatro de siempre, las que se miran a diario. El resto de estados está
 *  en la fila de abajo: están todos, pero sin robar el sitio a estos. */
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

const ClienteFilter = ({ filter, setFilter, tipo }: Props) => {
  const [resumen, setResumen] = useState<ResumenEstados | null>(null);

  useEffect(() => {
    // Una sola llamada para todos los estados. No depende de `filter`: los
    // totales no cambian porque se mire un estado u otro, y recargarlos en
    // cada clic era pedirle al servidor lo mismo una y otra vez.
    resumenEstados({ tipo_conexion: tipo ?? 'fibra_optica,inalambrico' })
      .then(setResumen)
      .catch(() => setResumen(null));
  }, [tipo]);

  const n = (e: EstadoCliente) => resumen?.por_estado[e] ?? 0;
  const secundarios = ESTADOS_CLIENTE.filter((e) => !DESTACADOS.includes(e.valor));

  return (
    <div className="mb-6 flex flex-col gap-3">
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

      {/* Los demás estados. Se ven de un vistazo con su cuenta, así que no hay
          que abrir un desplegable para descubrir si hay alguno. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Otros estados:</span>
        {secundarios.map((e) => (
          <button
            key={e.valor}
            type="button"
            onClick={() => setFilter(e.valor)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              filter === e.valor
                ? 'border-primary bg-lightprimary text-primary-text'
                : 'border-border hover:bg-muted'
            }`}
          >
            {e.etiqueta}
            <span className="ml-1.5 font-medium">{n(e.valor)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ClienteFilter;
