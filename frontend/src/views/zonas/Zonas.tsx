import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import RingProgress, { RING_TONE, type RingTone } from 'src/components/apps/cajasnap/RingProgress';
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
  { texto: string; icono: string; punto: string; chipBg: string; chipText: string }
> = {
  conectado: {
    texto: 'Router en línea',
    icono: 'tabler:router',
    punto: 'bg-success',
    chipBg: 'bg-lightsuccess',
    chipText: 'text-success',
  },
  tunel_sin_router: {
    texto: 'Túnel arriba, router sin responder',
    icono: 'tabler:router-off',
    punto: 'bg-warning',
    chipBg: 'bg-lightwarning',
    chipText: 'text-warning',
  },
  sin_respuesta: {
    texto: 'Sin respuesta',
    icono: 'tabler:plug-connected-x',
    punto: 'bg-error',
    chipBg: 'bg-lighterror',
    chipText: 'text-error',
  },
  sin_tunel: {
    texto: 'Sin túnel configurado',
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

/** El anillo mide qué parte de los clientes de la zona está activa. Acá mucho
 *  es bueno, al contrario que en las cajas NAP, donde el anillo lleno avisa de
 *  que ya no quedan bornes libres. */
function toneForActivos(pct: number): RingTone {
  return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error';
}

const Zonas = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [estados, setEstados] = useState<Record<number, EstadoRedZona>>({});
  const [comprobando, setComprobando] = useState(false);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [search, setSearch] = useState('');
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
  }, []);

  useEffect(() => {
    if (veRed) comprobarRed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veRed]);

  /** Comprobar una sola zona, con el detalle completo: sirve para saber si lo
   *  que falla es el enlace o el router. */
  async function comprobarUna(zona: Zona) {
    try {
      const d = await wireguardStatus(zona.id);
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

  const zonasFiltradas = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const enLinea = zonas.filter((z) => estados[z.id]?.estado === 'conectado').length;
  const sinTunel = zonas.filter((z) => estados[z.id]?.estado === 'sin_tunel').length;
  const caidas = zonas.filter(
    (z) => estados[z.id] && !['conectado', 'sin_tunel'].includes(estados[z.id].estado),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl">Zonas</h1>
          {veRed ? (
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
              <span>
                {zonas.length} {zonas.length === 1 ? 'zona' : 'zonas'}
              </span>
              {comprobando ? (
                <span className="flex items-center gap-1.5">
                  <Icon icon="tabler:loader-2" height={14} className="animate-spin" />
                  comprobando los routers…
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    {enLinea} en línea
                  </span>
                  {caidas > 0 && (
                    <span className="flex items-center gap-1.5 text-error">
                      <span className="h-2 w-2 rounded-full bg-error" />
                      {caidas} sin responder
                    </span>
                  )}
                  {sinTunel > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      {sinTunel} sin túnel
                    </span>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona una zona para ver su cobertura
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative sm:max-w-52 w-full">
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
          {veRed && (
            <Button variant="outline" onClick={comprobarRed} disabled={comprobando}>
              <Icon
                icon={comprobando ? 'tabler:loader-2' : 'tabler:refresh'}
                height={17}
                className={comprobando ? 'animate-spin' : undefined}
              />
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

      {zonasFiltradas.length === 0 && (
        <CardBox>
          <p className="text-center text-muted-foreground py-6">
            {zonas.length === 0
              ? 'No hay zonas registradas.'
              : 'Ninguna zona coincide con la búsqueda.'}
          </p>
        </CardBox>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {zonasFiltradas.map((z) => {
          const red = estados[z.id];
          const estilo = red ? ESTADO_RED[red.estado] : null;
          const pct = z.total_clientes > 0
            ? Math.round((z.clientes_activos / z.total_clientes) * 100)
            : 0;
          const tone = toneForActivos(pct);
          const handshake = red ? desdeHandshake(red.last_handshake_ts) : null;

          return (
            <CardBox
              key={z.id}
              className="p-3.5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => navigate(`/zonas/${z.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Icon icon="tabler:map-pin" height={15} className="shrink-0 text-muted-foreground" />
                  <h3 className="truncate text-[15px] font-semibold leading-tight">{z.nombre}</h3>
                </div>

                <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                  {/* El menú vive dentro de una tarjeta que navega al hacer
                      clic: sin frenar el evento, abrir el menú se llevaría a
                      la ficha de la zona. */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="Acciones" className="size-8">
                          <Icon icon="tabler:dots-vertical" height={17} />
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
                            <DropdownMenuItem
                              onClick={() => setBorrando(z)}
                              className="text-error focus:text-error"
                            >
                              <Icon icon="tabler:trash" height={16} />
                              Eliminar zona
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  {veRed && (
                    <>
                      {estilo ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`rounded-full p-1 flex items-center justify-center shrink-0 ${estilo.chipBg}`}
                          >
                            <Icon icon={estilo.icono} height={14} className={estilo.chipText} />
                          </span>
                          <span className={`text-sm font-medium truncate ${estilo.chipText}`}>
                            {estilo.texto}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon
                            icon="tabler:loader-2"
                            height={14}
                            className={comprobando ? 'animate-spin' : undefined}
                          />
                          {comprobando ? 'Comprobando…' : 'Estado sin comprobar'}
                        </div>
                      )}
                      {handshake && (
                        <p className="truncate text-[11px] leading-tight text-muted-foreground">
                          Último handshake {handshake}
                        </p>
                      )}
                      {z.router_mikrotik && (
                        <p className="truncate text-[11px] leading-tight text-muted-foreground">
                          {z.router_mikrotik}
                          {z.ip_wireguard ? ` · ${z.ip_wireguard}` : ''}
                        </p>
                      )}
                    </>
                  )}
                  {!veRed && (
                    <p className="text-sm text-muted-foreground">
                      {z.total_clientes} {z.total_clientes === 1 ? 'cliente' : 'clientes'}
                    </p>
                  )}
                </div>

                <div
                  className="flex shrink-0 flex-col items-center gap-1"
                  title={
                    z.total_clientes > 0
                      ? `${z.clientes_activos} de ${z.total_clientes} clientes de esta zona están activos`
                      : 'Todavía no hay clientes en esta zona'
                  }
                >
                  {z.total_clientes > 0 ? (
                    <RingProgress pct={pct} tone={tone} size="xs" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-ld">
                      <Icon icon="tabler:user-off" height={16} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex justify-between border-t border-ld pt-2 text-[11px]">
                <span className={`font-medium ${RING_TONE[tone].chipText}`}>
                  {z.clientes_activos} activos
                </span>
                <span className="text-muted-foreground">{z.total_clientes} en total</span>
                {veRed && (
                  <span className="text-muted-foreground truncate max-w-[45%]">
                    {z.pool_pppoe ? `pool ${z.pool_pppoe}` : 'sin pool'}
                  </span>
                )}
              </div>
            </CardBox>
          );
        })}
      </div>

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
