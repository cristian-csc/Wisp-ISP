import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
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

  function volverAlMapaEnVivo() {
    setJornadaSeleccionadaId(null);
    setRecorrido(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Seguimiento de vendedoras</h2>
          <p className="text-sm text-muted-foreground">
            Seguimiento en vivo de las jornadas de campo y su recorrido.
          </p>
        </div>
        <Badge className="bg-lightsuccess text-success rounded-md border-0">
          {activas.length} en ruta ahora
        </Badge>
      </div>

      <CardBox className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon icon={jornadaSeleccionadaId ? 'tabler:route' : 'tabler:map-pin'} height={16} />
            {jornadaSeleccionadaId ? `Recorrido — ${recorrido?.jornada.vendedor?.nombre ?? ''}` : 'Mapa en vivo'}
          </h3>
          {jornadaSeleccionadaId && (
            <Button size="sm" variant="outline" onClick={volverAlMapaEnVivo}>
              <Icon icon="tabler:arrow-left" height={14} className="mr-1" />
              Volver al mapa en vivo
            </Button>
          )}
        </div>
        <MapaJornadas activas={activas} recorrido={recorrido} />
      </CardBox>

      <CardBox className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon icon="tabler:bus" height={16} />
            Pasajes del mes
          </h3>
          <Input
            type="month"
            className="w-44"
            value={mesResumen}
            onChange={(e) => setMesResumen(e.target.value || mesActual())}
          />
        </div>

        {loadingResumen ? (
          <p className="text-sm text-muted-foreground py-2">Cargando…</p>
        ) : resumenPasajes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin jornadas registradas este mes.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumenPasajes.map((r) => (
              <div key={r.vendedor_id} className="flex items-center justify-between rounded-lg border border-ld px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">{r.total_jornadas} jornada{r.total_jornadas !== 1 ? 's' : ''}</p>
                </div>
                <Badge className="bg-lightwarning text-warning rounded-md border-0">
                  S/ {r.total_pasajes.toFixed(2)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardBox>

      <CardBox className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon icon="tabler:history" height={16} />
            Historial de jornadas
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" className="w-44" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />
            {filtroFecha !== fechaHoy() && (
              <Button size="sm" variant="outline" onClick={() => setFiltroFecha(fechaHoy())}>Hoy</Button>
            )}
            {filtroFecha && (
              <Button size="sm" variant="outline" onClick={() => setFiltroFecha('')}>Ver todo el historial</Button>
            )}
          </div>
        </div>

        <Table>
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
            ) : historial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin jornadas registradas</TableCell>
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
                    <Button size="sm" variant="outline" onClick={() => verRecorrido(j)}>
                      <Icon icon="tabler:route" height={14} className="mr-1" />
                      Ver recorrido
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardBox>
    </div>
  );
};

export default Jornadas;
