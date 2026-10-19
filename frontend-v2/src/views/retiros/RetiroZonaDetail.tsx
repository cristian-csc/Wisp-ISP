import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import { Checkbox } from 'src/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import ClienteSearchInput from 'src/components/apps/pagos/ClienteSearchInput';
import { getZona, listTecnicosZona, type Zona, type Tecnico } from 'src/lib/zonas';
import { listEvidenciasOrdenRetiro, getEvidenciaBlobUrl, type Evidencia } from 'src/lib/evidencias';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import type { ClienteListItem } from 'src/lib/clientes';
import {
  listOrdenesRetiro,
  createOrdenRetiro,
  asignarOrdenRetiro,
  completarOrdenRetiro,
  type OrdenRetiro,
  type EstadoOrdenRetiro,
} from 'src/lib/retiros';

const ESTADO_LABEL: Record<EstadoOrdenRetiro, string> = {
  pendiente: 'Pendiente',
  completado: 'Completado',
};

const ESTADO_BADGE: Record<EstadoOrdenRetiro, string> = {
  pendiente: 'bg-lightwarning text-warning',
  completado: 'bg-lightsuccess text-success',
};

type EvidenciaConUrl = Evidencia & { blobUrl: string };

const RetiroZonaDetail = () => {
  const navigate = useNavigate();
  const { zonaId } = useParams();
  const zid = Number(zonaId);
  const { user } = useCurrentUser();
  const puedeCrear = user?.rol === 'admin' || user?.rol === 'subadmin' || user?.rol === 'vendedor_tienda' || user?.rol === 'super_admin';
  const puedeAsignar = puedeCrear;
  const puedeCompletar = puedeCrear || user?.rol === 'tecnico';

  const [zona, setZona] = useState<Zona | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenRetiro[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('pendiente');
  const [cargando, setCargando] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteListItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tecnicoCrearSel, setTecnicoCrearSel] = useState('');
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [guardandoCrear, setGuardandoCrear] = useState(false);

  const [asignando, setAsignando] = useState<OrdenRetiro | null>(null);
  const [tecnicoAsignarSel, setTecnicoAsignarSel] = useState('');

  const [completando, setCompletando] = useState<OrdenRetiro | null>(null);
  const [roseta, setRoseta] = useState(false);
  const [patchcord, setPatchcord] = useState(false);
  const [retirarOnu, setRetirarOnu] = useState(true);
  const [observaciones, setObservaciones] = useState('');

  const [viendoEvidencias, setViendoEvidencias] = useState<OrdenRetiro | null>(null);
  const [evidencias, setEvidencias] = useState<EvidenciaConUrl[]>([]);

  async function reload() {
    setCargando(true);
    try {
      const params: { estado?: EstadoOrdenRetiro; zona_id?: number } = { zona_id: zid };
      if (filtroEstado !== 'todas') params.estado = filtroEstado as EstadoOrdenRetiro;
      setOrdenes(await listOrdenesRetiro(params));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    getZona(zid).then(setZona);
    listTecnicosZona(zid).then(setTecnicos).catch(() => setTecnicos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zid]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zid, filtroEstado]);

  function abrirCrear() {
    setClienteSel(null);
    setMotivo('');
    setTecnicoCrearSel('');
    setErrorCrear(null);
    setOpenCreate(true);
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setErrorCrear(null);
    if (!clienteSel) {
      setErrorCrear('Busca y selecciona el cliente.');
      return;
    }
    setGuardandoCrear(true);
    try {
      await createOrdenRetiro({
        cliente_id: clienteSel.id,
        motivo,
        tecnico_asignado_id: tecnicoCrearSel ? Number(tecnicoCrearSel) : undefined,
      });
      setOpenCreate(false);
      reload();
    } catch (err: any) {
      setErrorCrear(err?.response?.data?.detail ?? 'No se pudo crear la orden de retiro');
    } finally {
      setGuardandoCrear(false);
    }
  }

  function abrirAsignar(o: OrdenRetiro) {
    setAsignando(o);
    setTecnicoAsignarSel(o.tecnico_asignado_id ? String(o.tecnico_asignado_id) : '');
  }

  async function handleAsignar() {
    if (!asignando || !tecnicoAsignarSel) return;
    await asignarOrdenRetiro(asignando.id, Number(tecnicoAsignarSel));
    setAsignando(null);
    reload();
  }

  function abrirCompletar(o: OrdenRetiro) {
    setCompletando(o);
    setRoseta(false);
    setPatchcord(false);
    setRetirarOnu(!!o.onu_actual);
    setObservaciones('');
  }

  async function handleCompletar() {
    if (!completando) return;
    await completarOrdenRetiro(completando.id, {
      onu_retirada_id: retirarOnu && completando.onu_actual ? completando.onu_actual.id : undefined,
      retiro_roseta: roseta,
      retiro_patchcord: patchcord,
      observaciones: observaciones.trim() || undefined,
    });
    setCompletando(null);
    reload();
  }

  async function abrirEvidencias(o: OrdenRetiro) {
    setViendoEvidencias(o);
    const lista = await listEvidenciasOrdenRetiro(o.id);
    const conUrl = await Promise.all(
      lista.map(async (ev) => ({ ...ev, blobUrl: await getEvidenciaBlobUrl(ev.id) })),
    );
    setEvidencias(conUrl);
  }

  function cerrarEvidencias() {
    evidencias.forEach((e) => URL.revokeObjectURL(e.blobUrl));
    setEvidencias([]);
    setViendoEvidencias(null);
  }

  function AccionesRow({ o }: { o: OrdenRetiro }) {
    return (
      <TooltipProvider>
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => abrirEvidencias(o)}>
                <Icon icon="tabler:photo" height={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Ver evidencias</p></TooltipContent>
          </Tooltip>
          {o.estado === 'pendiente' && puedeAsignar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => abrirAsignar(o)}>
                  <Icon icon="tabler:user-plus" height={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{o.tecnico_asignado ? 'Reasignar técnico' : 'Asignar técnico'}</p></TooltipContent>
            </Tooltip>
          )}
          {o.estado === 'pendiente' && puedeCompletar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => abrirCompletar(o)}>
                  <Icon icon="tabler:check" height={18} className="text-success" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Completar retiro</p></TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/ordenes-retiro')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl truncate">{zona?.nombre ?? 'Cargando…'}</h1>
          <p className="text-sm text-muted-foreground">Órdenes de retiro de esta zona</p>
        </div>
        {puedeCrear && (
          <Button className="ml-auto" onClick={abrirCrear}>
            <Icon icon="solar:box-minimalistic-linear" height={16} className="mr-1" />
            Solicitar retiro
          </Button>
        )}
      </div>

      <CardBox>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="completado">Completadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Solicitada</TableHead>
              <TableHead className="text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cargando && ordenes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No hay órdenes de retiro con este filtro en esta zona.
                </TableCell>
              </TableRow>
            )}
            {ordenes.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline text-left"
                    onClick={() => navigate(`/clientes/${o.cliente_id}`)}
                  >
                    {o.cliente?.nombre ?? `#${o.cliente_id}`}
                  </button>
                  <p className="text-xs text-muted-foreground">DNI {o.cliente?.dni ?? '—'}</p>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{o.cliente?.telefono ?? '—'}</p>
                  <p className="text-xs text-muted-foreground max-w-[14rem] truncate">{o.cliente?.direccion ?? '—'}</p>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm">{o.motivo}</TableCell>
                <TableCell className="text-sm">
                  {o.tecnico_asignado?.nombre ?? <span className="text-muted-foreground">Sin asignar</span>}
                </TableCell>
                <TableCell><Badge className={`${ESTADO_BADGE[o.estado]} rounded-md`}>{ESTADO_LABEL[o.estado]}</Badge></TableCell>
                <TableCell>
                  <p className="text-sm text-muted-foreground">{new Date(o.fecha_solicitud).toLocaleDateString('es-PE')}</p>
                </TableCell>
                <TableCell className="text-end"><AccionesRow o={o} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBox>

      {/* Solicitar retiro */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar retiro de equipo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCrear} className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Cliente de esta zona</p>
              <ClienteSearchInput value={clienteSel} onChange={setClienteSel} zonaId={zid} placeholder="Buscar por nombre o DNI…" />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Motivo</p>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Cliente canceló el servicio, se muda de ciudad…"
                required
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Técnico (opcional, se puede asignar después)</p>
              <Select value={tecnicoCrearSel} onValueChange={setTecnicoCrearSel}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  {tecnicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nombre}</SelectItem>)}
                  {tecnicos.length === 0 && <div className="p-2 text-xs text-muted-foreground">Esta zona no tiene técnicos asignados</div>}
                </SelectContent>
              </Select>
            </div>
            {errorCrear && <p className="text-sm text-error">{errorCrear}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardandoCrear}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Asignar técnico */}
      <Dialog open={!!asignando} onOpenChange={(o) => !o && setAsignando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Asignar técnico</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="text-foreground">{asignando?.cliente?.nombre}</span> — {asignando?.cliente?.direccion ?? 'sin dirección registrada'}
          </p>
          <Select value={tecnicoAsignarSel} onValueChange={setTecnicoAsignarSel}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un técnico de la zona" /></SelectTrigger>
            <SelectContent>
              {tecnicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nombre}</SelectItem>)}
              {tecnicos.length === 0 && <div className="p-2 text-xs text-muted-foreground">Esta zona no tiene técnicos asignados</div>}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsignando(null)}>Cancelar</Button>
            <Button disabled={!tecnicoAsignarSel} onClick={handleAsignar}>Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completar retiro */}
      <Dialog open={!!completando} onOpenChange={(o) => !o && setCompletando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar retiro — {completando?.cliente?.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Motivo: <span className="text-foreground">{completando?.motivo}</span>
          </p>

          {completando?.onu_actual ? (
            <div className="flex items-center gap-2 rounded-lg border border-ld bg-muted/30 px-3 py-2.5">
              <Checkbox id="retirarOnu" checked={retirarOnu} onCheckedChange={(v) => setRetirarOnu(!!v)} />
              <label htmlFor="retirarOnu" className="text-sm cursor-pointer">
                Se retiró el router/ONU <span className="font-medium">{completando.onu_actual.numero_serie}</span> (vuelve al almacén)
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No hay un router/ONU registrado como instalado para este cliente.</p>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="roseta" checked={roseta} onCheckedChange={(v) => setRoseta(!!v)} />
            <label htmlFor="roseta" className="text-sm font-normal cursor-pointer">Se retiró la roseta</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="patchcord" checked={patchcord} onCheckedChange={(v) => setPatchcord(!!v)} />
            <label htmlFor="patchcord" className="text-sm font-normal cursor-pointer">Se retiró el patchcord</label>
          </div>
          <p className="text-xs text-muted-foreground">El cable drop no se recoge — queda en la vivienda.</p>

          <div>
            <p className="text-sm font-medium mb-2">Observaciones (opcional)</p>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. no se encontró la roseta, cliente no estaba, etc."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletando(null)}>Cancelar</Button>
            <Button onClick={handleCompletar}>Completar — anula el servicio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidencias */}
      <Dialog open={!!viendoEvidencias} onOpenChange={(o) => !o && cerrarEvidencias()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Evidencias del retiro</DialogTitle></DialogHeader>
          {evidencias.length === 0 && <p className="text-sm text-muted-foreground py-4">Sin fotos registradas para esta orden.</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {evidencias.map((ev) => (
              <div key={ev.id}>
                <img src={ev.blobUrl} alt={ev.descripcion ?? 'Evidencia'} className="w-full h-32 object-cover rounded-lg border border-ld" />
                <p className="text-xs text-muted-foreground mt-1 truncate">{ev.descripcion ?? '—'}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RetiroZonaDetail;
