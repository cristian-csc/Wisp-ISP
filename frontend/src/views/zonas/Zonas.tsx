import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import RingProgress, { type RingTone } from 'src/components/apps/cajasnap/RingProgress';
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
    punto: 'bg-success',
    chipBg: 'bg-lightsuccess',
    chipText: 'text-success',
  },
  // Sigue siendo un "sin respuesta" para quien mira la lista, pero el matiz
  // importa a quien va a arreglarlo: el túnel está bien, el que no contesta es
  // el router. Por eso comparte etiqueta y color, y lo distingue el detalle.
  tunel_sin_router: {
    texto: 'Sin respuesta',
    detalle: 'el túnel está arriba',
    icono: 'tabler:router-off',
    punto: 'bg-error',
    chipBg: 'bg-lighterror',
    chipText: 'text-error',
  },
  sin_respuesta: {
    texto: 'Sin respuesta',
    icono: 'tabler:plug-connected-x',
    punto: 'bg-error',
    chipBg: 'bg-lighterror',
    chipText: 'text-error',
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

/** El anillo mide qué parte de los clientes de la zona está activa. Acá mucho
 *  es bueno, al contrario que en las cajas NAP, donde el anillo lleno avisa de
 *  que ya no quedan bornes libres. */
function toneForActivos(pct: number): RingTone {
  return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error';
}

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

/** Una celda de la franja de resumen: etiqueta arriba, número grande debajo.
 *
 *  El punto de color va junto al número y no detrás de la etiqueta, para que
 *  al recorrer la franja de un vistazo lo que se lea sean los números. */
function ResumenDato({
  etiqueta,
  valor,
  icono,
  indice,
  color,
  nota,
}: {
  etiqueta: string;
  valor: number | string;
  icono: string;
  /** Posicion en la franja. Decide los separadores: `divide-x` no sirve sobre
   *  una rejilla, le pone borde izquierdo tambien al primero de la segunda
   *  fila, y queda una linea colgando. */
  indice: number;
  color?: string;
  nota?: string;
}) {
  const separadores = [
    'border-ld',
    indice % 2 === 1 ? 'border-l' : '',      // en dos columnas (telefono)
    indice >= 2 ? 'border-t sm:border-t-0' : '',
    indice > 0 ? 'sm:border-l' : '',         // en cuatro columnas
  ].join(' ');
  return (
    <div className={`flex min-w-0 items-center gap-3 px-5 py-4 ${separadores}`}>
      <Icon icon={icono} height={26} className={`shrink-0 ${color ?? 'text-muted-foreground'}`} />
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{etiqueta}</p>
        <p className={`text-2xl font-bold leading-tight ${color ?? 'text-foreground'}`}>{valor}</p>
        {nota && <p className="truncate text-[11px] text-muted-foreground">{nota}</p>}
      </div>
    </div>
  );
}

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

  const zonasFiltradas = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.trim().toLowerCase()),
  );

  // Mientras no haya llegado ni un estado se muestra una raya y no un 0:
  // "0 en linea" es una afirmacion, y todavia no se sabe nada.
  const sinComprobar = Object.keys(estados).length === 0;
  // Si no hay nada y tampoco se esta preguntando, es que la consulta fallo:
  // decir "comprobando..." para siempre seria mentir.
  const notaSinDatos = comprobando ? 'comprobando…' : 'sin comprobar';
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
          <p className="mt-1 text-sm text-muted-foreground">
            {veRed
              ? `${zonas.length} ${zonas.length === 1 ? 'zona' : 'zonas'} de cobertura`
              : 'Selecciona una zona para ver su cobertura'}
          </p>
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

      {/* Los cuatro indicadores en una sola franja, separados por una línea
          fina en vez de por aire: ocupan un tercio del alto que ocupaban en
          cuatro tarjetas y se leen igual de rápido. En móvil se parten en dos
          columnas, que es donde cabe un número sin estrujarse. */}
      {veRed && zonas.length > 0 && (
        <CardBox className="p-0 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <ResumenDato
              etiqueta="Total de zonas"
              valor={zonas.length}
              icono="tabler:stack-2"
              indice={0}
            />
            <ResumenDato
              etiqueta="En línea"
              indice={1}
              valor={sinComprobar ? '—' : enLinea}
              icono="tabler:wifi"
              color="text-success"
              nota={sinComprobar ? notaSinDatos : undefined}
            />
            <ResumenDato
              etiqueta="Sin respuesta"
              indice={2}
              valor={sinComprobar ? '—' : caidas}
              icono="tabler:alert-circle"
              color="text-error"
              nota={sinComprobar ? notaSinDatos : undefined}
            />
            {/* Ámbar y no gris: aquí no es el estado de una zona, es el trabajo
                que queda por hacer. En la tarjeta de cada zona sí va en gris,
                porque ahí es un hecho y no una tarea pendiente. */}
            <ResumenDato
              etiqueta="Sin túnel"
              indice={3}
              valor={sinComprobar ? '—' : sinTunel}
              icono="tabler:unlink"
              color="text-warning"
              nota={sinComprobar ? notaSinDatos : undefined}
            />
          </div>
        </CardBox>
      )}

      {zonasFiltradas.length === 0 && (
        <CardBox>
          <p className="text-center text-muted-foreground py-6">
            {zonas.length === 0
              ? 'No hay zonas registradas.'
              : 'Ninguna zona coincide con la búsqueda.'}
          </p>
        </CardBox>
      )}

      <h2 className="-mb-2 text-xl font-bold">Zonas registradas</h2>

      {/* Tres columnas cuando hay sitio, dos en tableta, una en el teléfono. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {zonasFiltradas.map((z) => {
          const red = estados[z.id];
          const estilo = red ? ESTADO_RED[red.estado] : null;
          const handshake = red ? desdeHandshake(red.last_handshake_ts) : null;
          const pct =
            z.total_clientes > 0
              ? Math.round((z.clientes_activos / z.total_clientes) * 100)
              : 0;

          return (
            <CardBox
              key={z.id}
              className="p-3.5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => navigate(`/zonas/${z.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon icon="tabler:map-pin" height={18} className="shrink-0 text-primary" />
                  <h3 className="truncate text-base font-bold leading-tight">{z.nombre}</h3>
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

              {/* El estado, en una pastilla con su punto de color. */}
              {veRed && (
                <div className="mt-2">
                  {estilo ? (
                    <span
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${estilo.chipBg} ${estilo.chipText}`}
                      title={estilo.detalle ? `${estilo.texto} — ${estilo.detalle}` : estilo.texto}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${estilo.punto}`} />
                      <span className="truncate">{estilo.texto}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[13px] font-semibold text-muted-foreground">
                      <Icon
                        icon="tabler:loader-2"
                        height={13}
                        className={comprobando ? 'animate-spin' : undefined}
                      />
                      {comprobando ? 'Comprobando…' : 'Sin comprobar'}
                    </span>
                  )}
                </div>
              )}

              {/* Activos y total: etiqueta arriba, número debajo, en color
                  neutro. Un cero aquí no es una alarma, es una zona que
                  todavía no tiene clientes. */}
              <div className="mt-2 flex items-center gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-2">
                  <div className="flex min-w-0 items-center gap-2 pr-3">
                    <Icon icon="tabler:users" height={18} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">Activos</p>
                      <p className="text-lg font-bold leading-tight">{z.clientes_activos}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 border-l border-ld pl-3">
                    <Icon icon="tabler:stack-2" height={18} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold leading-tight">{z.total_clientes}</p>
                    </div>
                  </div>
                </div>

                {/* El aro ocupa el hueco que quedaba a la derecha y dice de un
                    vistazo que parte de la zona esta activa — el mismo que se
                    usa en Cajas NAP, con la diferencia de que aqui lleno es
                    bueno y alli lleno avisa de que no quedan bornes.
                    Sin clientes todavia no se dibuja un 0%, que seria afirmar
                    algo: se dibuja el circulo punteado. */}
                <div
                  className="shrink-0"
                  title={
                    z.total_clientes > 0
                      ? `${z.clientes_activos} de ${z.total_clientes} clientes de esta zona están activos`
                      : 'Todavía no hay clientes en esta zona'
                  }
                >
                  {z.total_clientes > 0 ? (
                    <RingProgress pct={pct} tone={toneForActivos(pct)} size="sm" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-ld">
                      <Icon icon="tabler:user-off" height={18} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              {/* Donde iba "Ver detalle" van los datos técnicos del router, que
                  si no se quedarían sin sitio. Solo para quien ve la red; la
                  tarjeta entera sigue llevando a la ficha al pulsarla. */}
              {veRed && (
                <p className="mt-2 truncate border-t border-ld pt-1.5 text-[11px] leading-tight text-muted-foreground">
                  {[
                    z.router_mikrotik,
                    z.ip_wireguard,
                    // "sin pool" se dice en voz alta: sin él, los planes de
                    // esa zona no pueden crear perfiles en el router.
                    z.pool_pppoe ? `pool ${z.pool_pppoe}` : 'sin pool',
                    handshake,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
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
