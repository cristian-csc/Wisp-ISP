import { useEffect, useState } from 'react';
import CardBox from 'src/components/shared/CardBox';
import ClienteFilter from 'src/components/apps/clientes/ClienteFilter';
import ClienteListing from 'src/components/apps/clientes/ClienteListing';
import { getMe, type Usuario } from 'src/lib/api';
import type { EstadoCliente } from 'src/lib/clientes';

interface Props {
  initialFilter?: EstadoCliente | 'todos';
  /** Fija el tipo de conexión de la pantalla. Cuando viene, el selector de
   *  tipo desaparece: la sección ya es de un solo tipo. */
  tipo?: 'fibra_optica' | 'inalambrico';
}

const Clientes = ({ initialFilter = 'todos', tipo }: Props) => {
  const [filter, setFilter] = useState<EstadoCliente | 'todos'>(initialFilter);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => {});
  }, []);

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
        <ClienteFilter filter={filter} setFilter={setFilter} tipo={tipo} />
        <ClienteListing filter={filter} currentUser={currentUser} tipo={tipo} />
      </CardBox>
    </div>
  );
};

export default Clientes;
