import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Cifra from 'src/components/shared/Cifra';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import BorneDots from 'src/components/apps/cajasnap/BorneDots';
import OcupacionBarra from 'src/components/apps/cajasnap/OcupacionBarra';
import CajaNapDetailDialog from 'src/components/apps/cajasnap/CajaNapDetailDialog';
import DisponibilidadChip, { coincideFiltro, PESTANAS_DISPONIBILIDAD, type FiltroCajas } from 'src/components/apps/cajasnap/DisponibilidadChip';
import { listCajasNap, resumenBornes, type CajaNap } from 'src/lib/cajasnap';
import { listZonas, type Zona } from 'src/lib/zonas';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeVerUrl } from 'src/lib/permisos';

const TODAS = 'todas';

/** Todas las cajas NAP de la red en un solo lugar. La pregunta que se viene a
 *  responder es «¿dónde hay un borne libre?», así que eso manda: los libres
 *  van en grande, el filtro por disponibilidad está a mano y la caja se abre
 *  aquí mismo, sin cambiar de pantalla. */
const CajasNap = ({ gestion = false }: { gestion?: boolean }) => {
  const { user } = useCurrentUser();
  const base = gestion ? '/inventario/cajas-nap' : '/cajas-nap';
  const veGestion = !gestion && puedeVerUrl('/inventario/cajas-nap', user?.rol);
  const [params, setParams] = useSearchParams();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [cajas, setCajas] = useState<CajaNap[] | null>(null);
  const [search, setSearch] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const filtro = (params.get('ver') as FiltroCajas) || 'todas';
  const zonaSel = params.get('zona') ?? TODAS;

  const cargar = useCallback(() => {
    listCajasNap().then(setCajas).catch(() => setCajas([]));
  }, []);

  useEffect(() => {
    listZonas().then(setZonas).catch(() => {});
    cargar();
  }, [cargar]);

  function filtrar(cambio: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambio)) {
      if (!v || v === TODAS) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  const nombreZona = useMemo(() => new Map(zonas.map((z) => [z.id, z.nombre])), [zonas]);
  const todas = cajas ?? [];
  const delAlcance = zonaSel === TODAS ? todas : todas.filter((c) => String(c.zona_id) === zonaSel);
  const total = resumenBornes(delAlcance);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return delAlcance.filter(
      (c) =>
        coincideFiltro(c, filtro) &&
        (!q || [c.codigo, c.mufa_codigo, nombreZona.get(c.zona_id)].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [delAlcance, filtro, search, nombreZona]);

  /** Agrupadas por zona, en el orden de las zonas; dentro, por código. */
  const grupos = useMemo(() => {
    const m = new Map<number, CajaNap[]>();
    for (const c of visibles) m.set(c.zona_id, [...(m.get(c.zona_id) ?? []), c]);
    return [...m.entries()]
      .map(([zonaId, lista]) => ({
        zonaId,
        nombre: nombreZona.get(zonaId) ?? `Zona ${zonaId}`,
        cajas: lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
        r: resumenBornes(todas.filter((c) => c.zona_id === zonaId)),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  }, [visibles, nombreZona, todas]);

  const cuenta = (f: FiltroCajas) => delAlcance.filter((c) => coincideFiltro(c, f)).length;
  const hayFiltros = !!search.trim() || filtro !== 'todas' || zonaSel !== TODAS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Cajas NAP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gestion
              ? 'Crea cajas, amplíalas y lleva el estado de cada borne y su precinto.'
              : 'Dónde hay bornes libres para instalar, y cómo está cada caja de la red.'}
          </p>
        </div>
        {veGestion && (
          <Button variant="outline" asChild>
            <Link to="/inventario/cajas-nap">
              <Icon icon="solar:box-linear" width={17} /> Gestionar en Inventario
            </Link>
          </Button>
        )}
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Cifra
            etiqueta="Bornes libres"
            icono="solar:plug-circle-linear"
            tono="marca"
            valor={cajas ? total.libres : '—'}
            nota={cajas ? `para nuevos clientes, de ${total.total}` : undefined}
          />
          <Cifra
            etiqueta="Ocupación"
            icono="solar:pie-chart-2-linear"
            tono={total.pct >= 85 ? 'alerta' : 'neutro'}
            valor={cajas ? `${total.pct}%` : '—'}
            progreso={cajas ? { valor: total.ocupados, total: total.total } : null}
            nota={cajas ? `${total.ocupados} bornes con cliente` : undefined}
          />
          <Cifra
            etiqueta="Cajas llenas o casi"
            icono="solar:box-linear"
            tono={cuenta('llenas') ? 'alerta' : 'neutro'}
            valor={cajas ? cuenta('llenas') + cuenta('casi') : '—'}
            nota={cajas ? `${cuenta('llenas')} sin ningún borne libre` : undefined}
          />
          <Cifra
            etiqueta="Bornes dañados"
            icono="solar:danger-triangle-linear"
            tono={total.danados ? 'peligro' : 'neutro'}
            valor={cajas ? total.danados : '—'}
            nota={cajas ? (total.danados ? `en ${cuenta('danados')} caja${cuenta('danados') === 1 ? '' : 's'}` : 'Ninguno por reparar') : undefined}
          />
        </div>
      </CardBox>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar caja, mufa o zona" className="sm:w-72" />
          <Select value={zonaSel} onValueChange={(v) => filtrar({ zona: v })}>
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Zona">
              <Icon icon="tabler:map-pin" width={16} className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas las zonas</SelectItem>
              {[...zonas]
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
                .map((z) => (
                  <SelectItem key={z.id} value={String(z.id)}>
                    {z.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                filtrar({ ver: '', zona: '' });
              }}
            >
              <Icon icon="tabler:x" width={15} /> Quitar filtros
            </Button>
          )}
        </div>
        <Pestanas
          label="Disponibilidad"
          valor={filtro}
          onChange={(v) => filtrar({ ver: v })}
          pestanas={PESTANAS_DISPONIBILIDAD.map((p) => ({ ...p, cuenta: cajas ? cuenta(p.valor) : undefined }))}
        />
      </div>

      {cajas === null ? (
        <CardBox className="!p-0">
          <LoadingState filas={6} />
        </CardBox>
      ) : grupos.length === 0 ? (
        <CardBox className="!p-0">
          <EmptyState
            icono="tabler:box-off"
            titulo={todas.length === 0 ? 'Aún no hay cajas NAP' : 'Ninguna caja coincide'}
            descripcion={
              todas.length === 0
                ? gestion
                  ? 'Elige una zona en «Ver la zona» y agrega su primera caja, colgando de una mufa.'
                  : 'Las cajas se registran en Inventario › Cajas NAP, dentro de cada zona.'
                : filtro === 'libres'
                  ? 'No queda ninguna caja con bornes libres con este filtro.'
                  : 'Prueba con otra zona o quita el filtro.'
            }
            accion={
              hayFiltros ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    filtrar({ ver: '', zona: '' });
                  }}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        </CardBox>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((g) => (
            <section key={g.zonaId} aria-labelledby={`zona-${g.zonaId}`} className="overflow-hidden rounded-2xl border border-ld bg-card">
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ld bg-surface-2 px-5 py-3">
                <h2 id={`zona-${g.zonaId}`} className="min-w-0 truncate text-base font-semibold">
                  {g.nombre}
                </h2>
                <p className="text-sm text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{g.r.libres}</span> libres de {g.r.total}
                </p>
                <OcupacionBarra r={g.r} className="hidden w-32 sm:flex" />
                <Link
                  to={`${base}/zona/${g.zonaId}`}
                  className="ms-auto inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Ver la zona <Icon icon="tabler:arrow-right" width={15} />
                </Link>
              </header>
              <ul>
                {g.cajas.map((c) => {
                  const r = resumenBornes([c]);
                  return (
                    <li key={c.id} className="border-b border-ld last:border-0">
                      <button
                        type="button"
                        onClick={() => setAbierta(c.id)}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:grid-cols-[minmax(9rem,1.1fr)_minmax(0,2fr)_auto_auto]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.codigo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.mufa_codigo ? `Mufa ${c.mufa_codigo}` : 'Sin mufa'}
                            {c.descripcion ? ` · ${c.descripcion}` : ''}
                          </span>
                        </span>
                        <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
                          <BorneDots bornes={c.bornes} size="sm" />
                        </span>
                        <span className="hidden sm:block">
                          <DisponibilidadChip caja={c} />
                        </span>
                        <span className="text-right tabular-nums">
                          <span className="block text-lg font-semibold leading-none">{r.libres}</span>
                          <span className="text-xs text-muted-foreground">libre{r.libres === 1 ? '' : 's'} de {r.total}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-sm text-muted-foreground">
            {visibles.length} de {todas.length} cajas · el aro vacío es un borne libre, el lleno tiene cliente y el rojo está dañado.
          </p>
        </div>
      )}

      <CajaNapDetailDialog cajaId={abierta} gestion={gestion} onOpenChange={(o) => !o && setAbierta(null)} onChanged={cargar} />
    </div>
  );
};

export default CajasNap;
