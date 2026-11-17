import { useEffect, useState } from 'react';
import CardBox from 'src/components/shared/CardBox';
import ClienteFilter from 'src/components/apps/clientes/ClienteFilter';
import ClienteListing from 'src/components/apps/clientes/ClienteListing';
import { getMe, type Usuario } from 'src/lib/api';
import { resumenEstados, type EstadoCliente, type ResumenEstados } from 'src/lib/clientes';

interface Props {
  initialFilter?: EstadoCliente | 'todos';
  /** Fija el tipo de conexión de la pantalla. Cuando viene, el selector de
   *  tipo desaparece: la sección ya es de un solo tipo. */
  tipo?: 'fibra_optica' | 'inalambrico';
}

const Clientes = ({ initialFilter = 'todos', tipo }: Props) => {
  const [filter, setFilter] = useState<EstadoCliente | 'todos'>(initialFilter);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  /** Las cuentas por estado se piden aquí, una sola vez, y las usan tanto las
   *  tarjetas como el desplegable de la barra. Antes vivían dentro del filtro
   *  y el desplegable no habría podido mostrar los números sin volver a
   *  pedirlas. No dependen de `filter`: los totales no cambian porque se mire
   *  un estado u otro. */
  const [resumen, setResumen] = useState<ResumenEstados | null>(null);

  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    resumenEstados({ tipo_conexion: tipo ?? 'fibra_optica,inalambrico' })
      .then(setResumen)
      .catch(() => setResumen(null));
  }, [tipo]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const titulo =
    tipo === 'fibra_optica'
      ? { nombre: 'Clientes Fibra', detalle: 'Clientes con servicio por fibra óptica.' }
      : tipo === 'inalambrico'
        ? { nombre: 'Clientes Inalámbricos', detalle: 'Clientes atendidos por enlace inalámbrico.' }
        : { nombre: 'Clientes', detalle: 'Clientes de fibra óptica e inalámbricos.' };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">{titulo.nombre}</h1>
        <p className="text-sm text-muted-foreground">{titulo.detalle}</p>
      </div>

      <CardBox>
        <ClienteFilter filter={filter} setFilter={setFilter} resumen={resumen} />
        <ClienteListing
          filter={filter}
          setFilter={setFilter}
          resumen={resumen}
          currentUser={currentUser}
          tipo={tipo}
        />
      </CardBox>
    </div>
  );
};

export default Clientes;
