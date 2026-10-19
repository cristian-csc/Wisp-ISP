import { useEffect, useState } from 'react';
import CardBox from 'src/components/shared/CardBox';
import ClienteFilter from 'src/components/apps/clientes/ClienteFilter';
import ClienteListing from 'src/components/apps/clientes/ClienteListing';
import { getMe, type Usuario } from 'src/lib/api';
import type { EstadoCliente } from 'src/lib/clientes';

interface Props {
  initialFilter?: EstadoCliente | 'todos';
}

const Clientes = ({ initialFilter = 'todos' }: Props) => {
  const [filter, setFilter] = useState<EstadoCliente | 'todos'>(initialFilter);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  return (
    <CardBox>
      <ClienteFilter filter={filter} setFilter={setFilter} />
      <ClienteListing filter={filter} currentUser={currentUser} />
    </CardBox>
  );
};

export default Clientes;
