import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Input } from 'src/components/ui/input';
import { listZonas, type Zona } from 'src/lib/zonas';
import { listAverias, type Averia } from 'src/lib/averias';

function zonaIdDeAveria(a: Averia): number | null {
  return a.cliente?.zona?.id ?? a.caja_nap?.zona?.id ?? null;
}

const Averias = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [averias, setAverias] = useState<Averia[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listZonas().then(setZonas);
    listAverias().then(setAverias);
  }, []);

  const zonasFiltradas = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl">Averías</h1>
          <p className="text-sm text-muted-foreground">Selecciona una zona para ver sus averías</p>
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
          const averiasZona = averias.filter((a) => zonaIdDeAveria(a) === z.id);
          const deCliente = averiasZona.filter((a) => a.cliente_id).length;
          const dePlanta = averiasZona.filter((a) => a.caja_nap_id).length;
          const pendientes = averiasZona.filter((a) => a.estado === 'pendiente' || a.estado === 'asignada').length;
          const enProceso = averiasZona.filter((a) => a.estado === 'en_proceso').length;
          const activas = pendientes + enProceso;

          return (
            <CardBox
              key={z.id}
              className="p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => navigate(`/averias/zona/${z.id}`)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    <Icon icon="tabler:map-pin" height={13} />
                    Zona
                  </div>
                  <h3 className="text-lg font-semibold truncate mb-3">{z.nombre}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full p-1 flex items-center justify-center ${activas > 0 ? 'bg-warning/15' : 'bg-success/15'}`}>
                      <Icon icon="tabler:tool" height={14} className={activas > 0 ? 'text-warning' : 'text-success'} />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {activas} {activas === 1 ? 'avería activa' : 'averías activas'}
                    </p>
                  </div>
                </div>
                <div className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-lg font-bold ${activas > 0 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                  {activas}
                </div>
              </div>

              <div className="flex justify-between mt-4 pt-4 border-t border-ld text-xs">
                <span className="text-info font-medium">{deCliente} de clientes</span>
                <span className="text-secondary font-medium">{dePlanta} de planta externa</span>
              </div>
            </CardBox>
          );
        })}
      </div>
    </div>
  );
};

export default Averias;
