import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import MapaJornadas from 'src/components/apps/jornadas/MapaJornadas';
import {
  listJornadasActivas, listJornadas, getRecorridoJornada, actualizarPasaje, getResumenPasajes, reintegrarReclamo,
  type Jornada, type JornadaRecorrido, type ResumenPasajeVendedor,
} from 'src/lib/jornadas';
import { listUsuarios } from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';

const POLL_MS = 20_000;

/** Iniciales para el avatar de la lista de pasajes. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function duracion(j: Jornada): string {
  const fin = j.finalizado_en ? new Date(j.finalizado_en).getTime() : Date.now();
  const ms = fin - new Date(j.iniciado_en).getTime();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  return horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
}

function mesActual(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

function fechaHoy(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function PasajeCell({ jornada, onGuardado }: { jornada: Jornada; onGuardado: (j: Jornada) => void }) {
  const [valor, setValor] = useState(jornada.monto_pasaje != null ? String(jornada.monto_pasaje) : '');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(jornada.monto_pasaje != null ? String(jornada.monto_pasaje) : '');
  }, [jornada.id, jornada.monto_pasaje]);

  async function guardar() {
    const monto = valor.trim() === '' ? null : Number(valor);
    if (monto !== null && (Number.isNaN(monto) || monto < 0)) {
      toast.error('Ingresa un monto válido');
      setValor(jornada.monto_pasaje != null ? String(jornada.monto_pasaje) : '');
      return;
    }
    if (monto === jornada.monto_pasaje) return;
    setGuardando(true);
    try {
      const actualizada = await actualizarPasaje(jornada.id, monto);
      onGuardado(actualizada);
    } catch {
      toast.error('No se pudo guardar el pasaje');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">S/</span>
      <Input
        type="number"
        min={0}
        step="0.5"
        placeholder="—"
        className="w-20 h-8 text-sm"
        value={valor}
        disabled={guardando}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
      />
    </div>
  );
}

function ReclamoCell({ jornada, onReintegrado }: { jornada: Jornada; onReintegrado: (j: Jornada) => void }) {
  const [procesando, setProcesando] = useState(false);

  if (jornada.monto_reclamado == null) return <span className="text-xs text-muted-foreground">—</span>;

  if (jornada.reclamo_reintegrado) {
    return (
      <Badge className="bg-lightsuccess text-success rounded-md border-0">
        Reintegrado — S/ {jornada.monto_reclamado.toFixed(2)}
      </Badge>
    );
  }

  async function reintegrar() {
    setProcesando(true);
    try {
      const actualizada = await reintegrarReclamo(jornada.id);
      onReintegrado(actualizada);
      toast.success('Pasaje reintegrado');
    } catch {
      toast.error('No se pudo marcar como reintegrado');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge className="bg-lightwarning text-warning rounded-md border-0 w-fit">
        Pendiente — S/ {jornada.monto_reclamado.toFixed(2)}
      </Badge>
      {jornada.nota_reclamo && <span className="text-xs text-muted-foreground">{jornada.nota_reclamo}</span>}
      <Button size="sm" variant="outline" className="w-fit h-7 text-xs" onClick={reintegrar} disabled={procesando}>
        {procesando ? 'Guardando…' : 'Marcar como reintegrado'}
      </Button>
    </div>
  );
}

const Jornadas = () => {
  const [activas, setActivas] = useState<Jornada[]>([]);
  const [vendedores, setVendedores] = useState<Usuario[]>([]);
  const [historial, setHistorial] = useState<Jornada[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);

  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos');
  const [filtroFecha, setFiltroFecha] = useState<string>(fechaHoy());

  const [recorrido, setRecorrido] = useState<JornadaRecorrido | null>(null);
  const [jornadaSeleccionadaId, setJornadaSeleccionadaId] = useState<number | null>(null);

  const [mesResumen, setMesResumen] = useState(mesActual());
  const [resumenPasajes, setResumenPasajes] = useState<ResumenPasajeVendedor[]>([]);
  const [loadingResumen, setLoadingResumen] = useState(true);

  const cargarActivas = useCallback(() => {
    listJornadasActivas().then(setActivas).catch(() => {});
  }, []);

  const cargarHistorial = useCallback(() => {
    setLoadingHistorial(true);
    listJornadas({
      vendedor_id: filtroVendedor !== 'todos' ? Number(filtroVendedor) : undefined,
      fecha: filtroFecha || undefined,
      per_page: 30,
    })
      .then((d) => setHistorial(d.items))
      .catch(() => {})
      .finally(() => setLoadingHistorial(false));
  }, [filtroVendedor, filtroFecha]);

  useEffect(() => {
    listUsuarios().then((us) => setVendedores(us.filter((u) => u.rol === 'vendedor_campo'))).catch(() => {});
  }, []);

  useEffect(() => {
    cargarActivas();
    const interval = setInterval(cargarActivas, POLL_MS);
    return () => clearInterval(interval);
  }, [cargarActivas]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const cargarResumen = useCallback(() => {
    setLoadingResumen(true);
    getResumenPasajes(mesResumen)
      .then(setResumenPasajes)
      .catch(() => {})
      .finally(() => setLoadingResumen(false));
  }, [mesResumen]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  function actualizarJornadaEnHistorial(actualizada: Jornada) {
    setHistorial((prev) => prev.map((j) => (j.id === actualizada.id ? actualizada : j)));
    cargarResumen();
  }

  function handlePasajeGuardado(actualizada: Jornada) {
    actualizarJornadaEnHistorial(actualizada);
    toast.success('Pasaje guardado');
  }

  async function verRecorrido(j: Jornada) {
    setJornadaSeleccionadaId(j.id);
    try {
      const r = await getRecorridoJornada(j.id);
      setRecorrido(r);
    } catch {
      setRecorrido(null);
    }
  }

  /** Resumen del encabezado. Sale todo de lo que ya se carga en pantalla: no
   *  se pide nada nuevo al servidor ni se inventa ningún número. */
  const vendedorasActivas = vendedores.filter((v) => v.activo).length;
  const pasajeDelDia = historial.reduce((t, j) => t + (j.monto_pasaje ?? 0), 0);
  const etiquetaPeriodo = filtroFecha
    ? new Date(`${filtroFecha}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
    : 'todo el historial';

  function volverAlMapaEnVivo() {
    setJornadaSeleccionadaId(null);
    setRecorrido(null);
  }

  return (
    <div>
      <PageHeader
        titulo="Seguimiento de vendedoras"
        descripcion="Seguimiento en vivo de las jornadas de campo y su recorrido."
        icono="tabler:users-group"
        acciones={
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              activas.length > 0 ? 'bg-lightsuccess text-success-text' : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${activas.length > 0 ? 'animate-pulse bg-success' : 'bg-muted-foreground'}`}
            />
            {activas.length} en ruta ahora
          </span>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icono="tabler:user-check"
            etiqueta="Vendedoras activas"
            valor={vendedorasActivas}
            nota="Con cuenta habilitada"
            tono="primary"
          />
          <StatCard
            icono="tabler:route"
            etiqueta="En ruta ahora"
            valor={activas.length}
            nota={activas.length > 0 ? 'Jornadas abiertas' : 'Nadie en campo'}
            tono="success"
          />
          <StatCard
            icono="tabler:calendar-event"
            etiqueta="Jornadas"
            valor={historial.length}
            nota={etiquetaPeriodo}
            tono="brand"
          />
          <StatCard
            icono="tabler:bus"
            etiqueta="Pasaje del periodo"
            valor={`S/ ${pasajeDelDia.toFixed(2)}`}
            nota={etiquetaPeriodo}
            tono="warning"
          />
        </div>

        <SectionCard
          titulo={
            jornadaSeleccionadaId
              ? `Recorrido — ${recorrido?.jornada.vendedor?.nombre ?? ''}`
              : 'Mapa en vivo'
          }
          icono={jornadaSeleccionadaId ? 'tabler:route' : 'tabler:map-pin'}
          descripcion={
            jornadaSeleccionadaId
              ? 'Por dónde pasó durante la jornada, de inicio a fin.'
              : 'Dónde está cada vendedora ahora mismo.'
          }
          extra={
            jornadaSeleccionadaId && (
              <Button size="sm" variant="outline" onClick={volverAlMapaEnVivo} className="gap-1.5">
                <Icon icon="tabler:arrow-left" height={14} />
                Volver al mapa en vivo
              </Button>
            )
          }
        >
          <MapaJornadas activas={activas} recorrido={recorrido} alto={560} />
        </SectionCard>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard
            titulo="Pasajes del mes"
            icono="tabler:bus"
            className="min-w-0 xl:col-span-1"
            extra={
              <Input
                type="month"
                className="w-40"
                value={mesResumen}
                onChange={(e) => setMesResumen(e.target.value || mesActual())}
              />
            }
          >
            {loadingResumen ? (
              <p className="py-2 text-sm text-muted-foreground">Cargando…</p>
            ) : resumenPasajes.length === 0 ? (
              <EmptyState
                icono="tabler:bus"
                titulo="Sin jornadas este mes"
                descripcion="Cuando las vendedoras salgan a campo, acá se suma lo que gastaron en pasajes."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {resumenPasajes.map((r) => (
                  <div
                    key={r.vendedor_id}
                    className="transition-ui flex items-center justify-between gap-3 rounded-xl border border-ld px-3.5 py-2.5 hover:border-primary/35"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lightprimary text-[11px] font-bold text-primary-text">
                        {iniciales(r.nombre)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.total_jornadas} jornada{r.total_jornadas !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-lightwarning px-2.5 py-1 text-sm font-semibold tabular-nums text-warning-text">
                      S/ {r.total_pasajes.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            titulo="Historial de jornadas"
            icono="tabler:history"
            className="min-w-0 xl:col-span-2"
            sinRelleno
            extra={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los vendedores</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" className="w-40" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />
                {filtroFecha !== fechaHoy() && (
                  <Button size="sm" variant="outline" onClick={() => setFiltroFecha(fechaHoy())}>Hoy</Button>
                )}
                {filtroFecha && (
                  <Button size="sm" variant="outline" onClick={() => setFiltroFecha('')} className="gap-1.5">
                    <Icon icon="tabler:list-details" height={14} />
                    Ver todo el historial
                  </Button>
                )}
              </div>
            }
          >
            {!loadingHistorial && historial.length === 0 ? (
              <EmptyState
                icono="tabler:route-off"
                titulo="Sin jornadas registradas"
                descripcion="Todavía no hay rutas o visitas para los filtros elegidos."
              />
            ) : (
            <div className="overflow-x-auto">
            <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pasaje</TableHead>
              <TableHead>Reclamo</TableHead>
              <TableHead className="text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingHistorial ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</TableCell>
              </TableRow>
            ) : (
              historial.map((j) => {
                const reclamoPendiente = j.monto_reclamado != null && !j.reclamo_reintegrado;
                return (
                <TableRow
                  key={j.id}
                  className={jornadaSeleccionadaId === j.id ? 'bg-lightprimary' : reclamoPendiente ? 'bg-lightwarning' : ''}
                >
                  <TableCell className="font-medium">{j.vendedor?.nombre ?? '—'}</TableCell>
                  <TableCell>{j.zona?.nombre ?? '—'}</TableCell>
                  <TableCell>{fechaCorta(j.iniciado_en)}</TableCell>
                  <TableCell>{duracion(j)}</TableCell>
                  <TableCell>
                    {j.estado === 'activa' ? (
                      <Badge className="bg-lightsuccess text-success rounded-md border-0">En ruta</Badge>
                    ) : (
                      <Badge className="bg-lightsecondary text-secondary rounded-md border-0">Finalizada</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <PasajeCell jornada={j} onGuardado={handlePasajeGuardado} />
                  </TableCell>
                  <TableCell>
                    <ReclamoCell jornada={j} onReintegrado={actualizarJornadaEnHistorial} />
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => verRecorrido(j)}
                      title="Ver recorrido"
                      aria-label={`Ver el recorrido de ${j.vendedor?.nombre ?? 'la jornada'}`}
                      className="px-2"
                    >
                      <Icon icon="tabler:route" height={16} />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
              </TableBody>
            </Table>
            </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default Jornadas;
