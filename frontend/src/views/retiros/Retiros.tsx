import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Input } from 'src/components/ui/input';
import { listZonas, type Zona } from 'src/lib/zonas';
import { listOrdenesRetiro, type OrdenRetiro } from 'src/lib/retiros';

const Retiros = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenRetiro[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listZonas().then(setZonas);
    listOrdenesRetiro().then(setOrdenes);
  }, []);

  const zonasFiltradas = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl">Órdenes de retiro</h1>
          <p className="text-sm text-muted-foreground">Selecciona una zona para ver sus retiros</p>
        </div>
        <div className="relative sm:max-w-60 w-full">
          <Icon
            icon="tabler:search"
            height={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar zona…"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {zonasFiltradas.length === 0 && (
          <CardBox>
            <p className="text-center text-muted-foreground py-4">Ninguna zona coincide con la búsqueda.</p>
          </CardBox>
        )}
        {zonasFiltradas.map((z) => {
          const ordenesZona = ordenes.filter((o) => o.cliente?.zona?.id === z.id);
          const pendientes = ordenesZona.filter((o) => o.estado === 'pendiente').length;
          const completadas = ordenesZona.filter((o) => o.estado === 'completado').length;

          return (
            <CardBox
              key={z.id}
              className="p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => navigate(`/ordenes-retiro/zona/${z.id}`)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    <Icon icon="tabler:map-pin" height={13} />
                    Zona
                  </div>
                  <h3 className="text-lg font-semibold truncate mb-3">{z.nombre}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full p-1 flex items-center justify-center ${pendientes > 0 ? 'bg-warning/15' : 'bg-success/15'}`}>
                      <Icon icon="solar:box-minimalistic-linear" height={14} className={pendientes > 0 ? 'text-warning' : 'text-success'} />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {pendientes} {pendientes === 1 ? 'retiro pendiente' : 'retiros pendientes'}
                    </p>
                  </div>
                </div>
                <div className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-lg font-bold ${pendientes > 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                  {pendientes}
                </div>
              </div>

              <div className="flex justify-between mt-4 pt-4 border-t border-ld text-xs">
                <span className="text-muted-foreground font-medium">{completadas} completados</span>
                <span className="text-info font-medium">{ordenesZona.length} en total</span>
              </div>
            </CardBox>
          );
        })}
      </div>
    </div>
  );
};

export default Retiros;
