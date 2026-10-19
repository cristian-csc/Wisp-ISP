import { useEffect, useState } from 'react';
import { listClientes, type EstadoCliente } from 'src/lib/clientes';

interface Props {
  filter: EstadoCliente | 'todos';
  setFilter: (f: EstadoCliente | 'todos') => void;
}

const ClienteFilter = ({ filter, setFilter }: Props) => {
  const [counts, setCounts] = useState({ total: 0, pendiente_aprobacion: 0, activo: 0, suspendido: 0 });

  useEffect(() => {
    const RED = 'fibra_optica,inalambrico';
    Promise.all([
      listClientes({ page: 1, tipo_conexion: RED }),
      listClientes({ page: 1, estado: 'pendiente_aprobacion', tipo_conexion: RED }),
      listClientes({ page: 1, estado: 'activo', tipo_conexion: RED }),
      listClientes({ page: 1, estado: 'suspendido', tipo_conexion: RED }),
    ]).then(([total, pendientes, activos, suspendidos]) => {
      setCounts({
        total: total.total,
        pendiente_aprobacion: pendientes.total,
        activo: activos.total,
        suspendido: suspendidos.total,
      });
    });
  }, [filter]);

  return (
    <div className="grid grid-cols-12 gap-6 mb-6">
      <div className="lg:col-span-3 md:col-span-6 col-span-12">
        <div
          className="p-[30px] bg-lightprimary dark:bg-lightprimary text-center rounded-md cursor-pointer"
          onClick={() => setFilter('todos')}
        >
          <h3 className="text-primary text-2xl">{counts.total}</h3>
          <h6 className="text-base text-primary">Total clientes</h6>
        </div>
      </div>
      <div className="lg:col-span-3 md:col-span-6 col-span-12">
        <div
          className="p-[30px] bg-lightwarning dark:bg-lightwarning text-center rounded-md cursor-pointer"
          onClick={() => setFilter('pendiente_aprobacion')}
        >
          <h3 className="text-warning text-2xl">{counts.pendiente_aprobacion}</h3>
          <h6 className="text-base text-warning">Pendientes de aprobación</h6>
        </div>
      </div>
      <div className="lg:col-span-3 md:col-span-6 col-span-12">
        <div
          className="p-[30px] bg-lightsuccess dark:bg-lightsuccess text-center rounded-md cursor-pointer"
          onClick={() => setFilter('activo')}
        >
          <h3 className="text-success text-2xl">{counts.activo}</h3>
          <h6 className="text-base text-success">Activos</h6>
        </div>
      </div>
      <div className="lg:col-span-3 md:col-span-6 col-span-12">
        <div
          className="p-[30px] bg-lighterror dark:bg-lighterror text-center rounded-md cursor-pointer"
          onClick={() => setFilter('suspendido')}
        >
          <h3 className="text-error text-2xl">{counts.suspendido}</h3>
          <h6 className="text-base text-error">Suspendidos</h6>
        </div>
      </div>
    </div>
  );
};

export default ClienteFilter;
