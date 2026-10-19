import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Input } from 'src/components/ui/input';
import RingProgress, { RING_TONE, toneForPct } from 'src/components/apps/cajasnap/RingProgress';
import { listCajasNap, type CajaNap } from 'src/lib/cajasnap';
import { listZonas, type Zona } from 'src/lib/zonas';

const CajasNap = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listZonas().then(setZonas);
    listCajasNap().then(setCajas);
  }, []);

  const zonasFiltradas = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl">Cajas NAP</h1>
          <p className="text-sm text-muted-foreground">Selecciona una zona para ver sus cajas</p>
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
          const cajasZona = cajas.filter((c) => c.zona_id === z.id);
          const totalBornes = cajasZona.reduce((n, c) => n + c.bornes.length, 0);
          const ocupados = cajasZona.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'ocupado').length, 0);
          const libres = cajasZona.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'libre').length, 0);
          const danados = cajasZona.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'danado').length, 0);
          const pct = totalBornes > 0 ? Math.round((ocupados / totalBornes) * 100) : 0;
          const tone = toneForPct(pct);

          return (
            <CardBox
              key={z.id}
              className="p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => navigate(`/cajas-nap/zona/${z.id}`)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    <Icon icon="tabler:map-pin" height={13} />
                    Zona
                  </div>
                  <h3 className="text-lg font-semibold truncate mb-3">{z.nombre}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full p-1 flex items-center justify-center ${RING_TONE[tone].chipBg}`}>
                      <Icon icon="tabler:box" height={14} className={RING_TONE[tone].chipText} />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {cajasZona.length} {cajasZona.length === 1 ? 'caja NAP' : 'cajas NAP'}
                    </p>
                  </div>
                </div>

                {totalBornes > 0 ? (
                  <RingProgress pct={pct} tone={tone} />
                ) : (
                  <div className="h-20 w-20 shrink-0 rounded-full border-2 border-dashed border-ld flex items-center justify-center">
                    <Icon icon="tabler:plug-off" height={22} className="text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-4 pt-4 border-t border-ld text-xs">
                <span className="text-success font-medium">{ocupados} ocupados</span>
                <span className="text-info font-medium">{libres} libres</span>
                <span className={danados > 0 ? 'text-error font-medium' : 'text-muted-foreground'}>
                  {danados} dañados
                </span>
              </div>
            </CardBox>
          );
        })}
      </div>
    </div>
  );
};

export default CajasNap;
