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
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
} from 'src/components/shared/form';
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
  const puedeCrear = user?.rol === 'admin' || user?.rol === 'atencion_cliente';
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
      <FormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        title="Solicitar retiro de equipo"
        subtitle="Orden para recoger el equipo de un cliente"
        icon="tabler:package-export"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpenCreate(false)}
            submitLabel="Guardar"
            submitForm="retiro-create-form"
            submitting={guardandoCrear}
          />
        }
      >
        <form id="retiro-create-form" onSubmit={handleCrear} className="flex flex-col gap-5">
          <FormField label="Cliente de esta zona" icon="tabler:user" required>
            <ClienteSearchInput
              value={clienteSel}
              onChange={setClienteSel}
              zonaId={zid}
              placeholder="Buscar por nombre o DNI…"
            />
          </FormField>

          <FormField label="Motivo" icon="tabler:message-2" required>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </FormField>

          <FormField
            label="Técnico"
            icon="tabler:tool"
            hint="Opcional — se puede asignar después."
          >
            <FieldIcon icon="tabler:tool">
              <Select value={tecnicoCrearSel} onValueChange={setTecnicoCrearSel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {tecnicos.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                  {tecnicos.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">
                      Esta zona no tiene técnicos asignados
                    </div>
                  )}
                </SelectContent>
              </Select>
            </FieldIcon>
          </FormField>

          {errorCrear && <FormCallout tone="error">{errorCrear}</FormCallout>}
        </form>
      </FormDialog>

      {/* Asignar técnico */}
      <FormDialog
        open={!!asignando}
        onOpenChange={(o) => !o && setAsignando(null)}
        title="Asignar técnico"
        subtitle={
          asignando
            ? `${asignando.cliente?.nombre ?? ''} — ${asignando.cliente?.direccion ?? 'sin dirección registrada'}`
            : undefined
        }
        icon="tabler:tool"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setAsignando(null)}
            submitLabel="Asignar"
            submitIcon="tabler:user-check"
            onSubmit={handleAsignar}
            disabled={!tecnicoAsignarSel}
          />
        }
      >
        <FormField label="Técnico" icon="tabler:tool">
          <FieldIcon icon="tabler:tool">
            <Select value={tecnicoAsignarSel} onValueChange={setTecnicoAsignarSel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un técnico de la zona" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </SelectItem>
                ))}
                {tecnicos.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">
                    Esta zona no tiene técnicos asignados
                  </div>
                )}
              </SelectContent>
            </Select>
          </FieldIcon>
        </FormField>
      </FormDialog>

      {/* Completar retiro */}
      <FormDialog
        open={!!completando}
        onOpenChange={(o) => !o && setCompletando(null)}
        title={`Completar retiro — ${completando?.cliente?.nombre ?? ''}`}
        subtitle="Marca qué se recogió en la vivienda"
        icon="tabler:package-import"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setCompletando(null)}
            submitLabel="Completar — anula el servicio"
            submitIcon="tabler:circle-check"
            onSubmit={handleCompletar}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <FormCallout>
            Motivo: <span className="font-medium">{completando?.motivo}</span>
          </FormCallout>

          {completando?.onu_actual ? (
            <label
              htmlFor="retirarOnu"
              className="transition-ui flex cursor-pointer items-center gap-3 rounded-xl border border-ld bg-surface-2 px-4 py-3 text-sm hover:border-primary/40"
            >
              <Checkbox
                id="retirarOnu"
                checked={retirarOnu}
                onCheckedChange={(v) => setRetirarOnu(!!v)}
              />
              <span>
                Se retiró el router/ONU{' '}
                <span className="font-medium">{completando.onu_actual.numero_serie}</span> (vuelve al
                almacén)
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              No hay un router/ONU registrado como instalado para este cliente.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              htmlFor="roseta"
              className="transition-ui flex cursor-pointer items-center gap-3 rounded-xl border border-ld bg-surface-2 px-4 py-3 text-sm hover:border-primary/40"
            >
              <Checkbox id="roseta" checked={roseta} onCheckedChange={(v) => setRoseta(!!v)} />
              Se retiró la roseta
            </label>
            <label
              htmlFor="patchcord"
              className="transition-ui flex cursor-pointer items-center gap-3 rounded-xl border border-ld bg-surface-2 px-4 py-3 text-sm hover:border-primary/40"
            >
              <Checkbox
                id="patchcord"
                checked={patchcord}
                onCheckedChange={(v) => setPatchcord(!!v)}
              />
              Se retiró el patchcord
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            El cable drop no se recoge — queda en la vivienda.
          </p>

          <FormField label="Observaciones (opcional)" icon="tabler:notes" htmlFor="obsRetiro">
            <Textarea
              id="obsRetiro"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </FormField>
        </div>
      </FormDialog>

      {/* Evidencias */}
      <FormDialog
        open={!!viendoEvidencias}
        onOpenChange={(o) => !o && cerrarEvidencias()}
        title="Evidencias del retiro"
        subtitle="Fotos registradas por el técnico"
        icon="tabler:photo"
        tone="primary"
        size="xl"
      >
        {evidencias.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Sin fotos registradas para esta orden.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {evidencias.map((ev) => (
            <div key={ev.id}>
              <img
                src={ev.blobUrl}
                alt={ev.descripcion ?? 'Evidencia'}
                className="h-32 w-full rounded-xl border border-ld object-cover"
              />
              <p className="mt-1 truncate text-xs text-muted-foreground">{ev.descripcion ?? '—'}</p>
            </div>
          ))}
        </div>
      </FormDialog>
    </div>
  );
};

export default RetiroZonaDetail;
