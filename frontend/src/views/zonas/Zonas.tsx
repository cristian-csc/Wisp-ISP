import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import Cifra from 'src/components/shared/Cifra';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import VistaToggle, { guardarVista, vistaGuardada, type Vista } from 'src/components/shared/VistaToggle';
import OcupacionBarra from 'src/components/apps/cajasnap/OcupacionBarra';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'src/components/ui/table';
import { listCajasNap, resumenBornes, type CajaNap } from 'src/lib/cajasnap';
import { cn } from 'src/lib/utils';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
} from 'src/components/shared/form';
import {
  createZona,
  deleteZona,
  estadoRedZonas,
  estadoRedReciente,
  listZonas,
  wireguardStatus,
  type EstadoRed,
  type EstadoRedZona,
  type Zona,
} from 'src/lib/zonas';
import { getMe, type Usuario } from 'src/lib/api';
import { puedeAccion } from 'src/lib/permisos';

/** Cómo se ve cada estado del enlace. En una tabla y no repartido por el
 *  código, para que el punto de color, el texto y el icono no se contradigan. */
const ESTADO_RED: Record<
  EstadoRed,
  { texto: string; detalle?: string; icono: string; punto: string; chipBg: string; chipText: string }
> = {
  conectado: {
    texto: 'En línea',
    icono: 'tabler:router',
    punto: 'bg-success-solid',
    chipBg: 'bg-lightsuccess',
    chipText: 'text-success-text',
  },
  // Sigue siendo un "sin respuesta" para quien mira la lista, pero el matiz
  // importa a quien va a arreglarlo: el túnel está bien, el que no contesta es
  // el router. Por eso comparte etiqueta y color, y lo distingue el detalle.
  tunel_sin_router: {
    texto: 'Sin respuesta',
    detalle: 'el túnel está arriba',
    icono: 'tabler:router-off',
    punto: 'bg-error-solid',
    chipBg: 'bg-lighterror',
    chipText: 'text-error-text',
  },
  sin_respuesta: {
    texto: 'Sin respuesta',
    icono: 'tabler:plug-connected-x',
    punto: 'bg-error-solid',
    chipBg: 'bg-lighterror',
    chipText: 'text-error-text',
  },
  // muted-foreground es #475569 en claro y #93a4be en oscuro: gris azulado en
  // los dos temas, que es justo lo que se pedía, sin inventar un color nuevo.
  sin_tunel: {
    texto: 'Sin túnel',
    icono: 'tabler:shield-off',
    punto: 'bg-muted-foreground',
    chipBg: 'bg-muted',
    chipText: 'text-muted-foreground',
  },
};

/** Hace cuánto fue el último handshake, en palabras. Un número de epoch no le
 *  dice nada a nadie; "hace 3 min" sí. */
function desdeHandshake(ts: number): string | null {
  if (!ts) return null;
  const seg = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (seg < 90) return 'hace un momento';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

type FiltroRed = 'todas' | 'conectado' | 'caidas' | 'sin_tunel';
type Orden = 'nombre' | 'clientes' | 'libres' | 'activos_pct';

const ORDENES: { valor: Orden; etiqueta: string }[] = [
  { valor: 'nombre', etiqueta: 'Nombre (A-Z)' },
  { valor: 'clientes', etiqueta: 'Más clientes' },
  { valor: 'libres', etiqueta: 'Más bornes libres' },
  { valor: 'activos_pct', etiqueta: 'Menos activos (%)' },
];

const Zonas = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  /** Arranca con lo ultimo leido, si es de hace menos de 2 minutos: al volver
   *  a Zonas desde otro modulo la pantalla ya sale pintada en vez de decir
   *  "Comprobando..." mientras no hay nada que comprobar. Sin esto, el efecto
   *  de abajo se salta la consulta y las tarjetas se quedan vacias. */
  const [estados, setEstados] = useState<Record<number, EstadoRedZona>>(() => {
    const guardado = estadoRedReciente();
    return guardado ? Object.fromEntries(guardado.map((f) => [f.zona_id, f])) : {};
  });
  const [comprobando, setComprobando] = useState(false);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [search, setSearch] = useState('');
  const [filtroRed, setFiltroRed] = useState<FiltroRed>('todas');
  const [orden, setOrden] = useState<Orden>('nombre');
  const [vista, setVista] = useState<Vista>(() => vistaGuardada('zonas', 'tarjetas'));
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ipWireguard, setIpWireguard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Zona | null>(null);

  const puedeGestionar = puedeAccion('zonas.gestionar', currentUser?.rol);
  /** Atención al cliente entra aquí a consultar cobertura: ve las zonas y sus
   *  clientes, no la configuración de la red. */
  const veRed = puedeAccion('zonas.verRed', currentUser?.rol);

  async function reload() {
    setZonas(await listZonas());
  }

  /** El estado de la red va aparte de la lista: las tarjetas se pintan al
   *  instante y el estado va llegando, en vez de dejar la pantalla en blanco
   *  los segundos que tardan los ping. */
  async function comprobarRed() {
    setComprobando(true);
    try {
      const filas = await estadoRedZonas();
      setEstados(Object.fromEntries(filas.map((f) => [f.zona_id, f])));
    } catch {
      toast.error('No se pudo consultar el estado de los routers.');
    } finally {
      setComprobando(false);
    }
  }

  useEffect(() => {
    reload();
    getMe().then(setCurrentUser).catch(() => {});
    // Las cajas dan los bornes libres de cada zona: lo que se puede vender.
    listCajasNap().then(setCajas).catch(() => {});
  }, []);

  useEffect(() => {
    if (!veRed) return;
    // Si lo pintado es de hace menos de dos minutos no se vuelve a preguntar:
    // el handshake no cambia en ese rato y los ping a quince routers tardan.
    // Para forzarlo está el botón "Comprobar routers".
    if (estadoRedReciente()) return;
    comprobarRed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veRed]);

  /** Comprobar una sola zona, con el detalle completo: sirve para saber si lo
   *  que falla es el enlace o el router. */
  async function comprobarUna(zona: Zona) {
    try {
      // forzar: el servidor guarda el estado del tunel 2 minutos para no
      // castigar la VPS, pero si alguien pulsa "Comprobar el enlace" es
      // justamente porque quiere el dato de ahora.
      const d = await wireguardStatus(zona.id, true);
      toast[d.online ? 'success' : 'warning'](
        `${zona.nombre}: ${d.online ? 'el router contesta' : 'el router no contesta'}` +
          ` · WireGuard ${d.wg_peer_online ? 'con handshake' : 'sin handshake'}` +
          ` (${d.last_handshake})`,
      );
      comprobarRed();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo comprobar la zona');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Si se deja vacía se omite, para que la columna quede nula y no
      // con una cadena vacía que parezca un valor configurado.
      await createZona({ nombre, ip_wireguard: ipWireguard.trim() || undefined });
      setOpen(false);
      setNombre('');
      setIpWireguard('');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear la zona');
    }
  }

  async function handleBorrar() {
    if (!borrando) return;
    try {
      await deleteZona(borrando.id);
      toast.success(`Zona "${borrando.nombre}" eliminada`);
      setBorrando(null);
      reload();
    } catch (err: any) {
      // El servidor explica por qué se negó (normalmente: tiene clientes
      // asignados y dice cuántos). Se muestra tal cual.
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la zona');
      setBorrando(null);
    }
  }

  const bornesPorZona = useMemo(() => {
    const m = new Map<number, ReturnType<typeof resumenBornes> & { cajas: number }>();
    for (const z of zonas) {
      const deZona = cajas.filter((c) => c.zona_id === z.id);
      m.set(z.id, { ...resumenBornes(deZona), cajas: deZona.length });
    }
    return m;
  }, [zonas, cajas]);

  // Mientras no haya llegado ni un estado se muestra una raya y no un 0:
  // "0 en linea" es una afirmacion, y todavia no se sabe nada.
  const sinComprobar = Object.keys(estados).length === 0;
  const notaSinDatos = comprobando ? 'comprobando…' : 'sin comprobar';
  const esCaida = (z: Zona) => !!estados[z.id] && !['conectado', 'sin_tunel'].includes(estados[z.id].estado);
  const enLinea = zonas.filter((z) => estados[z.id]?.estado === 'conectado').length;
  const sinTunel = zonas.filter((z) => estados[z.id]?.estado === 'sin_tunel').length;
  const caidas = zonas.filter(esCaida).length;
  const totalClientes = zonas.reduce((n, z) => n + z.total_clientes, 0);
  const totalActivos = zonas.reduce((n, z) => n + z.clientes_activos, 0);
  const bornesTotales = resumenBornes(cajas);

  const zonasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lista = zonas.filter((z) => {
      if (q && ![z.nombre, z.router_mikrotik, z.ip_wireguard].some((t) => t?.toLowerCase().includes(q))) return false;
      if (filtroRed === 'conectado') return estados[z.id]?.estado === 'conectado';
      if (filtroRed === 'sin_tunel') return estados[z.id]?.estado === 'sin_tunel';
      if (filtroRed === 'caidas') return esCaida(z);
      return true;
    });
    const pct = (z: Zona) => (z.total_clientes ? z.clientes_activos / z.total_clientes : 1);
    const comparar: Record<Orden, (a: Zona, b: Zona) => number> = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }),
      clientes: (a, b) => b.total_clientes - a.total_clientes,
      libres: (a, b) => (bornesPorZona.get(b.id)?.libres ?? 0) - (bornesPorZona.get(a.id)?.libres ?? 0),
      activos_pct: (a, b) => pct(a) - pct(b),
    };
    return [...lista].sort(comparar[orden]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonas, search, filtroRed, orden, estados, bornesPorZona]);

  function cambiarVista(v: Vista) {
    setVista(v);
    guardarVista('zonas', v);
  }

  const hayFiltros = !!search.trim() || filtroRed !== 'todas';

  /** El estado de red de una zona, igual en tarjeta y en lista. */
  const EstadoChip = ({ z }: { z: Zona }) => {
    const red = estados[z.id];
    const estilo = red ? ESTADO_RED[red.estado] : null;
    if (!estilo) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Icon icon="tabler:loader-2" width={12} className={comprobando ? 'animate-spin' : undefined} />
          {comprobando ? 'Comprobando…' : 'Sin comprobar'}
        </span>
      );
    }
    return (
      <span
        className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', estilo.chipBg, estilo.chipText)}
        title={estilo.detalle ? `${estilo.texto} — ${estilo.detalle}` : estilo.texto}
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', estilo.punto)} />
        <span className="truncate">{estilo.texto}</span>
      </span>
    );
  };

  const Acciones = ({ z }: { z: Zona }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Acciones de ${z.nombre}`} className="size-8">
          <Icon icon="tabler:dots" height={17} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => navigate(`/zonas/${z.id}`)}>
          <Icon icon="tabler:eye" height={16} />
          Ver la zona
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/cajas-nap/zona/${z.id}`)}>
          <Icon icon="tabler:box" height={16} />
          Cajas NAP de la zona
        </DropdownMenuItem>
        {veRed && (
          <DropdownMenuItem onClick={() => comprobarUna(z)}>
            <Icon icon="tabler:plug-connected" height={16} />
            Comprobar el enlace
          </DropdownMenuItem>
        )}
        {puedeGestionar && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setBorrando(z)} className="text-error-text focus:text-error-text">
              <Icon icon="tabler:trash" height={16} />
              Eliminar zona
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** Router, IP y pool en una línea. "sin pool" se marca: sin él, los planes
   *  de esa zona no pueden crear perfiles en el router. */
  const LineaTecnica = ({ z }: { z: Zona }) => {
    const handshake = estados[z.id] ? desdeHandshake(estados[z.id].last_handshake_ts) : null;
    const partes = [z.router_mikrotik, z.ip_wireguard, z.pool_pppoe ? `pool ${z.pool_pppoe}` : null, handshake].filter(Boolean);
    return (
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {!z.pool_pppoe && (
          <span className="shrink-0 rounded bg-lightwarning px-1.5 py-px text-[11px] font-medium text-warning-text">sin pool</span>
        )}
        <span className="truncate tabular-nums">{partes.join(' · ') || 'Router sin configurar'}</span>
      </p>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Zonas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {veRed ? 'Cobertura, estado de cada router y espacio para nuevos clientes.' : 'Elige una zona para ver su cobertura y sus clientes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {veRed && (
            <Button variant="outline" onClick={comprobarRed} disabled={comprobando}>
              <Icon icon={comprobando ? 'tabler:loader-2' : 'tabler:refresh'} height={17} className={comprobando ? 'animate-spin' : undefined} />
              {comprobando ? 'Comprobando…' : 'Comprobar routers'}
            </Button>
          )}
          {puedeGestionar && (
            <Button onClick={() => setOpen(true)}>
              <Icon icon="tabler:map-pin-plus" height={17} />
              Agregar zona
            </Button>
          )}
        </div>
      </div>

      {zonas.length > 0 && (
        <CardBox className="gap-0 overflow-hidden !p-0">
          <div
            className={cn(
              'grid grid-cols-2 gap-px bg-border [&>*]:bg-card',
              veRed ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
              !veRed && '[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1',
            )}
          >
            <Cifra
              etiqueta="Clientes activos"
              icono="solar:users-group-rounded-linear"
              valor={totalActivos}
              progreso={{ valor: totalActivos, total: totalClientes }}
              nota={`de ${totalClientes} en ${zonas.length} zonas`}
            />
            {veRed && (
              <Cifra
                etiqueta="Routers en línea"
                icono="solar:wi-fi-router-minimalistic-linear"
                tono={!sinComprobar && enLinea === zonas.length ? 'ok' : 'neutro'}
                valor={sinComprobar ? '—' : `${enLinea}/${zonas.length}`}
                nota={sinComprobar ? notaSinDatos : enLinea === zonas.length ? 'Todos contestan' : `${sinTunel} sin túnel configurado`}
              />
            )}
            {veRed && (
              <Cifra
                etiqueta="Sin respuesta"
                icono="solar:danger-triangle-linear"
                tono={!sinComprobar && caidas > 0 ? 'peligro' : 'neutro'}
                valor={sinComprobar ? '—' : caidas}
                nota={sinComprobar ? notaSinDatos : caidas ? 'Revisa el enlace o el router' : 'Ninguna zona caída'}
              />
            )}
            <Cifra
              etiqueta="Bornes libres"
              icono="solar:plug-circle-linear"
              tono="marca"
              valor={bornesTotales.libres}
              progreso={{ valor: bornesTotales.ocupados, total: bornesTotales.total }}
              nota={`${bornesTotales.pct}% ocupado en ${cajas.length} cajas NAP`}
              to="/cajas-nap"
            />
            {!veRed && (
              <Cifra etiqueta="Zonas" icono="solar:map-point-linear" valor={zonas.length} nota="con cobertura" />
            )}
          </div>
        </CardBox>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar zona, router o IP" className="lg:w-72" />
          <div className="flex flex-1 items-center gap-2 lg:justify-end">
            <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
              <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Ordenar">
                <Icon icon="tabler:arrows-sort" width={16} className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDENES.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <VistaToggle valor={vista} onChange={cambiarVista} />
          </div>
        </div>
        {veRed && (
          <Pestanas
            label="Estado de la red"
            valor={filtroRed}
            onChange={setFiltroRed}
            pestanas={[
              { valor: 'todas', etiqueta: 'Todas', cuenta: zonas.length },
              { valor: 'conectado', etiqueta: 'En línea', cuenta: enLinea, punto: 'bg-success-solid' },
              { valor: 'caidas', etiqueta: 'Sin respuesta', cuenta: caidas, punto: 'bg-error-solid' },
              { valor: 'sin_tunel', etiqueta: 'Sin túnel', cuenta: sinTunel, punto: 'bg-muted-foreground' },
            ]}
          />
        )}
      </div>

      {zonasFiltradas.length === 0 ? (
        <CardBox className="!p-0">
          <EmptyState
            icono="tabler:map-pin-off"
            titulo={zonas.length === 0 ? 'Aún no hay zonas' : 'Ninguna zona coincide'}
            descripcion={
              zonas.length === 0
                ? 'Crea la primera zona de cobertura para registrar su router y sus cajas NAP.'
                : filtroRed !== 'todas' && sinComprobar
                  ? 'Todavía no se comprobó el estado de los routers.'
                  : 'Prueba con otro nombre o quita el filtro.'
            }
            accion={
              zonas.length === 0 && puedeGestionar ? (
                <Button onClick={() => setOpen(true)}>
                  <Icon icon="tabler:map-pin-plus" height={17} /> Agregar zona
                </Button>
              ) : hayFiltros ? (
                <Button variant="outline" onClick={() => { setSearch(''); setFiltroRed('todas'); }}>
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        </CardBox>
      ) : vista === 'tarjetas' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {zonasFiltradas.map((z) => {
            const b = bornesPorZona.get(z.id);
            const pctActivos = z.total_clientes ? Math.round((z.clientes_activos / z.total_clientes) * 100) : 0;
            return (
              <article
                key={z.id}
                className="group relative flex flex-col rounded-2xl border border-ld bg-card transition-[border-color,transform] duration-150 active:scale-[0.995] [@media(hover:hover)]:hover:border-foreground/25"
              >
                <div className="flex items-start justify-between gap-3 px-5 pt-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight">
                      {/* El enlace cubre toda la tarjeta; el menú queda por encima. */}
                      <Link to={`/zonas/${z.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-brand">
                        {z.nombre}
                      </Link>
                    </h3>
                    {veRed && <div className="mt-1.5"><EstadoChip z={z} /></div>}
                  </div>
                  <div className="relative z-10 -mr-2 -mt-1">
                    <Acciones z={z} />
                  </div>
                </div>

                <dl className="mx-5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ld bg-border [&>div]:bg-card">
                  <div className="px-3.5 py-3">
                    <dt className="text-xs text-muted-foreground">Clientes activos</dt>
                    <dd className="mt-1 flex items-baseline gap-1 tabular-nums">
                      <span className="text-xl font-semibold leading-none">{z.clientes_activos}</span>
                      <span className="text-xs text-muted-foreground">de {z.total_clientes}</span>
                    </dd>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pctActivos}%` }} />
                    </div>
                  </div>
                  <div className="px-3.5 py-3">
                    <dt className="text-xs text-muted-foreground">Bornes libres</dt>
                    <dd className="mt-1 flex items-baseline gap-1 tabular-nums">
                      <span className="text-xl font-semibold leading-none">{b?.libres ?? 0}</span>
                      <span className="text-xs text-muted-foreground">
                        en {b?.cajas ?? 0} caja{b?.cajas === 1 ? '' : 's'}
                      </span>
                    </dd>
                    {b && <OcupacionBarra r={b} className="mt-2 h-1" />}
                  </div>
                </dl>

                <div className="mt-auto px-5 pb-4 pt-3">
                  {veRed ? <LineaTecnica z={z} /> : <p className="text-xs text-muted-foreground">{z.descripcion || 'Ver clientes y cobertura'}</p>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <CardBox className="gap-0 overflow-hidden !p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zona</TableHead>
                {veRed && <TableHead>Estado</TableHead>}
                <TableHead>Clientes activos</TableHead>
                <TableHead className="hidden md:table-cell">Bornes libres</TableHead>
                {veRed && <TableHead className="hidden xl:table-cell">Router</TableHead>}
                <TableHead className="text-end">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zonasFiltradas.map((z) => {
                const b = bornesPorZona.get(z.id);
                const pctActivos = z.total_clientes ? Math.round((z.clientes_activos / z.total_clientes) * 100) : 0;
                return (
                  <TableRow key={z.id} className="cursor-pointer" onClick={() => navigate(`/zonas/${z.id}`)}>
                    <TableCell>
                      <Link to={`/zonas/${z.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {z.nombre}
                      </Link>
                    </TableCell>
                    {veRed && (
                      <TableCell>
                        <EstadoChip z={z} />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="w-14 shrink-0 tabular-nums">
                          <span className="font-semibold">{z.clientes_activos}</span>
                          <span className="text-xs text-muted-foreground">/{z.total_clientes}</span>
                        </span>
                        <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pctActivos}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-3">
                        <span className="w-8 shrink-0 font-semibold tabular-nums">{b?.libres ?? 0}</span>
                        {b && <OcupacionBarra r={b} className="h-1 w-24" />}
                      </div>
                    </TableCell>
                    {veRed && (
                      <TableCell className="hidden max-w-72 xl:table-cell">
                        <LineaTecnica z={z} />
                      </TableCell>
                    )}
                    <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                      <Acciones z={z} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardBox>
      )}

      {zonasFiltradas.length > 0 && hayFiltros && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {zonasFiltradas.length} de {zonas.length} zonas
        </p>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Agregar zona"
        subtitle="Registra una nueva zona de cobertura"
        icon="tabler:map-pin-plus"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Guardar"
            submitForm="zona-create-form"
          />
        }
      >
        <form id="zona-create-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormGrid>
            <FormField label="Nombre" icon="tabler:map-pin" htmlFor="nombreZona" required>
              <FieldIcon icon="tabler:map-pin">
                <Input
                  id="nombreZona"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </FieldIcon>
            </FormField>
            <FormField
              label="IP WireGuard"
              icon="tabler:shield-lock"
              htmlFor="ipWg"
              hint="Opcional. Déjala vacía si el router todavía no está instalado: se completa después desde la zona."
            >
              <FieldIcon icon="tabler:network">
                <Input
                  id="ipWg"
                  placeholder="10.10.0.5"
                  value={ipWireguard}
                  onChange={(e) => setIpWireguard(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormGrid>
          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(o) => !o && setBorrando(null)}
        title="Eliminar zona"
        description={
          borrando
            ? `¿Eliminar la zona "${borrando.nombre}"? Se van con ella sus mufas y cajas NAP, y no se puede deshacer. Si tiene clientes asignados, el sistema no te va a dejar.`
            : undefined
        }
        onConfirm={handleBorrar}
      />
    </div>
  );
};

export default Zonas;
