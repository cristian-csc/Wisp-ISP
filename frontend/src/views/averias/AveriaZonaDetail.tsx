import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
import { Input } from 'src/components/ui/input';
import { Switch } from 'src/components/ui/switch';
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
  FormGrid,
  FormSection,
} from 'src/components/shared/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import ClienteSearchInput from 'src/components/apps/pagos/ClienteSearchInput';
import { getZona, type Zona } from 'src/lib/zonas';
import { listCajasNap, type CajaNap } from 'src/lib/cajasnap';
import { listUsuarios } from 'src/lib/usuarios';
import { listOnus, type Onu } from 'src/lib/onus';
import { listEvidenciasAveria, getEvidenciaBlobUrl, eliminarEvidencia, type Evidencia } from 'src/lib/evidencias';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import type { Usuario } from 'src/lib/api';
import type { ClienteListItem } from 'src/lib/clientes';
import {
  listAverias,
  createAveria,
  asignarAveria,
  iniciarAveria,
  resolverAveria,
  editarAveria,
  eliminarAveria,
  type Averia,
} from 'src/lib/averias';

const ESTADO_LABEL: Record<Averia['estado'], string> = {
  pendiente: 'Pendiente',
  asignada: 'Asignada',
  en_proceso: 'En atención',
  resuelta: 'Resuelta',
};

const ESTADO_BADGE: Record<Averia['estado'], string> = {
  pendiente: 'bg-lightwarning text-warning',
  asignada: 'bg-lightinfo text-info',
  en_proceso: 'bg-lightsecondary text-secondary',
  resuelta: 'bg-lightsuccess text-success',
};

const MOTIVOS_CLIENTE = ['Cambio de router', 'Conectores', 'Cable drop', 'Patchcord', 'Cambio de roseta'];
const MOTIVOS_PLANTA = ['Sin potencia óptica', 'Caja dañada', 'Corte de troncal'];

function ChipsMotivo({ opciones, onPick }: { opciones: string[]; onPick: (texto: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {opciones.map((m) => (
        <button
          key={m}
          type="button"
          className="text-xs rounded-full border border-ld px-3 py-1 hover:bg-primary/5 hover:border-primary"
          onClick={() => onPick(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

type EvidenciaConUrl = Evidencia & { blobUrl: string };

const AveriaZonaDetail = () => {
  const navigate = useNavigate();
  const { zonaId } = useParams();
  const zid = Number(zonaId);
  const { user } = useCurrentUser();
  const puedeAsignar = user?.rol === 'admin';
  const puedeOperar = puedeAsignar || user?.rol === 'tecnico';
  const puedeReportarPlanta = user?.rol !== 'atencion_cliente';
  const puedeEliminar = user?.rol === 'admin';

  const [zona, setZona] = useState<Zona | null>(null);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [averias, setAverias] = useState<Averia[]>([]);

  const [openCliente, setOpenCliente] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteListItem | null>(null);
  const [motivoCliente, setMotivoCliente] = useState('');
  const [errorCliente, setErrorCliente] = useState<string | null>(null);

  const [openPlanta, setOpenPlanta] = useState(false);
  const [cajaSel, setCajaSel] = useState('');
  const [motivoPlanta, setMotivoPlanta] = useState('');
  const [errorPlanta, setErrorPlanta] = useState<string | null>(null);

  const [asignando, setAsignando] = useState<Averia | null>(null);
  const [tecnicoSel, setTecnicoSel] = useState('');

  const [resolviendo, setResolviendo] = useState<Averia | null>(null);
  const [diagnostico, setDiagnostico] = useState('');
  const [potencia, setPotencia] = useState('');
  const [cambiarOnu, setCambiarOnu] = useState(false);
  const [onuViejaId, setOnuViejaId] = useState('');
  const [onuNuevaId, setOnuNuevaId] = useState('');
  const [onusViejas, setOnusViejas] = useState<Onu[]>([]);
  const [onusNuevas, setOnusNuevas] = useState<Onu[]>([]);

  const [viendoEvidencias, setViendoEvidencias] = useState<Averia | null>(null);
  const [evidencias, setEvidencias] = useState<EvidenciaConUrl[]>([]);

  const [editando, setEditando] = useState<Averia | null>(null);
  const [motivoEditado, setMotivoEditado] = useState('');

  const [eliminando, setEliminando] = useState<Averia | null>(null);

  async function reload() {
    setAverias(await listAverias({ zona_id: zid }));
  }

  useEffect(() => {
    getZona(zid).then(setZona);
    listCajasNap(zid).then(setCajas);
    listUsuarios().then((all) => setTecnicos(all.filter((u) => u.rol === 'tecnico')));
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zid]);

  const deClientes = averias.filter((a) => a.cliente_id);
  const dePlanta = averias.filter((a) => a.caja_nap_id);

  async function handleCrearCliente(e: FormEvent) {
    e.preventDefault();
    setErrorCliente(null);
    if (!clienteSel) {
      setErrorCliente('Busca y selecciona un cliente.');
      return;
    }
    try {
      await createAveria({ cliente_id: clienteSel.id, motivo_reportado: motivoCliente });
      setOpenCliente(false);
      setClienteSel(null);
      setMotivoCliente('');
      reload();
    } catch (err: any) {
      setErrorCliente(err?.response?.data?.detail ?? 'No se pudo registrar la avería');
    }
  }

  async function handleCrearPlanta(e: FormEvent) {
    e.preventDefault();
    setErrorPlanta(null);
    if (!cajaSel) {
      setErrorPlanta('Selecciona una caja NAP.');
      return;
    }
    try {
      await createAveria({ caja_nap_id: Number(cajaSel), motivo_reportado: motivoPlanta });
      setOpenPlanta(false);
      setCajaSel('');
      setMotivoPlanta('');
      reload();
    } catch (err: any) {
      setErrorPlanta(err?.response?.data?.detail ?? 'No se pudo registrar la avería');
    }
  }

  async function handleAsignar() {
    if (!asignando || !tecnicoSel) return;
    await asignarAveria(asignando.id, Number(tecnicoSel));
    setAsignando(null);
    setTecnicoSel('');
    reload();
  }

  async function handleIniciar(a: Averia) {
    await iniciarAveria(a.id);
    reload();
  }

  async function abrirResolver(a: Averia) {
    setResolviendo(a);
    setDiagnostico('');
    setPotencia('');
    setCambiarOnu(false);
    setOnuViejaId('');
    setOnuNuevaId('');
    if (a.cliente_id) {
      const [viejas, nuevas] = await Promise.all([
        listOnus({ estado: 'instalado', cliente_id: a.cliente_id }),
        a.tecnico_asignado_id ? listOnus({ estado: 'asignado_tecnico', tecnico_id: a.tecnico_asignado_id }) : Promise.resolve([]),
      ]);
      setOnusViejas(viejas);
      setOnusNuevas(nuevas);
    }
  }

  async function handleResolver() {
    if (!resolviendo) return;
    await resolverAveria(resolviendo.id, {
      diagnostico_solucion: diagnostico,
      potencia_optica_dbm: potencia ? Number(potencia) : undefined,
      onu_reemplazada_id: cambiarOnu && onuViejaId ? Number(onuViejaId) : undefined,
      onu_nueva_id: cambiarOnu && onuNuevaId ? Number(onuNuevaId) : undefined,
    });
    setResolviendo(null);
    reload();
  }

  async function abrirEvidencias(a: Averia) {
    setViendoEvidencias(a);
    const lista = await listEvidenciasAveria(a.id);
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

  async function handleEliminarEvidencia(evidenciaId: number) {
    await eliminarEvidencia(evidenciaId);
    setEvidencias((prev) => {
      const borrada = prev.find((e) => e.id === evidenciaId);
      if (borrada) URL.revokeObjectURL(borrada.blobUrl);
      return prev.filter((e) => e.id !== evidenciaId);
    });
  }

  function abrirEditar(a: Averia) {
    setEditando(a);
    setMotivoEditado(a.motivo_reportado);
  }

  async function handleEditar() {
    if (!editando) return;
    await editarAveria(editando.id, motivoEditado);
    setEditando(null);
    reload();
  }

  async function handleEliminar() {
    if (!eliminando) return;
    await eliminarAveria(eliminando.id);
    setEliminando(null);
    reload();
  }

  function AccionesRow({ a }: { a: Averia }) {
    return (
      <TooltipProvider>
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => abrirEvidencias(a)}>
                <Icon icon="tabler:photo" height={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Ver evidencias</p></TooltipContent>
          </Tooltip>
          {a.estado === 'pendiente' && puedeAsignar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setAsignando(a)}>
                  <Icon icon="tabler:user-plus" height={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Asignar técnico</p></TooltipContent>
            </Tooltip>
          )}
          {a.estado === 'asignada' && puedeOperar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => handleIniciar(a)}>
                  <Icon icon="tabler:player-play" height={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Iniciar atención</p></TooltipContent>
            </Tooltip>
          )}
          {(a.estado === 'asignada' || a.estado === 'en_proceso') && puedeOperar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => abrirResolver(a)}>
                  <Icon icon="tabler:check" height={18} className="text-success" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Resolver</p></TooltipContent>
            </Tooltip>
          )}
          {a.estado !== 'resuelta' && puedeAsignar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => abrirEditar(a)}>
                  <Icon icon="tabler:pencil" height={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Corregir motivo</p></TooltipContent>
            </Tooltip>
          )}
          {puedeEliminar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setEliminando(a)}>
                  <Icon icon="tabler:trash" height={18} className="text-error" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Eliminar</p></TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/averias')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl truncate">{zona?.nombre ?? 'Cargando…'}</h1>
          <p className="text-sm text-muted-foreground">Averías de esta zona</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {puedeReportarPlanta && (
            <Button variant="outline" onClick={() => setOpenPlanta(true)}>
              <Icon icon="tabler:antenna" height={16} className="mr-1" />
              Avería de planta externa
            </Button>
          )}
          <Button onClick={() => setOpenCliente(true)}>
            <Icon icon="tabler:user-exclamation" height={16} className="mr-1" />
            Avería de cliente
          </Button>
        </div>
      </div>

      <CardBox>
        <h3 className="text-sm font-semibold mb-3">Averías de clientes</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Reportada</TableHead>
              <TableHead className="text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deClientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Sin averías de clientes en esta zona.
                </TableCell>
              </TableRow>
            )}
            {deClientes.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => navigate(`/clientes/${a.cliente_id}`)}
                  >
                    {a.cliente?.nombre ?? `#${a.cliente_id}`}
                  </button>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm">{a.motivo_reportado}</TableCell>
                <TableCell><Badge className={`${ESTADO_BADGE[a.estado]} rounded-md`}>{ESTADO_LABEL[a.estado]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.fecha_reporte).toLocaleDateString('es-PE')}</TableCell>
                <TableCell className="text-end"><AccionesRow a={a} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBox>

      <CardBox>
        <h3 className="text-sm font-semibold mb-3">Averías de planta externa</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caja NAP</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Reportada</TableHead>
              <TableHead className="text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dePlanta.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Sin averías de planta externa en esta zona.
                </TableCell>
              </TableRow>
            )}
            {dePlanta.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-sm font-medium">{a.caja_nap?.codigo ?? `#${a.caja_nap_id}`}</TableCell>
                <TableCell className="max-w-xs truncate text-sm">{a.motivo_reportado}</TableCell>
                <TableCell><Badge className={`${ESTADO_BADGE[a.estado]} rounded-md`}>{ESTADO_LABEL[a.estado]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(a.fecha_reporte).toLocaleDateString('es-PE')}</TableCell>
                <TableCell className="text-end"><AccionesRow a={a} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBox>

      {/* Reportar avería de cliente */}
      <FormDialog
        open={openCliente}
        onOpenChange={setOpenCliente}
        title="Avería de cliente"
        subtitle="Reporta una falla en el servicio de un cliente"
        icon="tabler:alert-triangle"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpenCliente(false)}
            submitLabel="Guardar"
            submitForm="averia-cliente-form"
          />
        }
      >
        <form id="averia-cliente-form" onSubmit={handleCrearCliente} className="flex flex-col gap-5">
          <FormField label="Cliente" icon="tabler:user" required>
            <ClienteSearchInput
              value={clienteSel}
              onChange={setClienteSel}
              placeholder="Buscar por nombre o DNI…"
            />
          </FormField>

          <FormField label="Motivo reportado" icon="tabler:message-2" required>
            <ChipsMotivo
              opciones={MOTIVOS_CLIENTE}
              onPick={(m) => setMotivoCliente((prev) => (prev ? `${prev}, ${m}` : m))}
            />
            <Textarea
              value={motivoCliente}
              onChange={(e) => setMotivoCliente(e.target.value)}
              required
            />
          </FormField>

          {errorCliente && <FormCallout tone="error">{errorCliente}</FormCallout>}
        </form>
      </FormDialog>

      {/* Reportar avería de planta externa */}
      <FormDialog
        open={openPlanta}
        onOpenChange={setOpenPlanta}
        title="Avería de planta externa"
        subtitle="Falla en una caja NAP o en el tendido"
        icon="tabler:box"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpenPlanta(false)}
            submitLabel="Guardar"
            submitForm="averia-planta-form"
          />
        }
      >
        <form id="averia-planta-form" onSubmit={handleCrearPlanta} className="flex flex-col gap-5">
          <FormField label="Caja NAP" icon="tabler:box" required>
            <FieldIcon icon="tabler:box">
              <Select value={cajaSel} onValueChange={setCajaSel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una caja NAP" />
                </SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldIcon>
          </FormField>

          <FormField label="Motivo reportado" icon="tabler:message-2" required>
            <ChipsMotivo
              opciones={MOTIVOS_PLANTA}
              onPick={(m) => setMotivoPlanta((prev) => (prev ? `${prev}, ${m}` : m))}
            />
            <Textarea
              value={motivoPlanta}
              onChange={(e) => setMotivoPlanta(e.target.value)}
              required
            />
          </FormField>

          {errorPlanta && <FormCallout tone="error">{errorPlanta}</FormCallout>}
        </form>
      </FormDialog>

      {/* Asignar técnico */}
      <FormDialog
        open={!!asignando}
        onOpenChange={(o) => !o && setAsignando(null)}
        title="Asignar técnico"
        subtitle="Quién atenderá esta avería"
        icon="tabler:tool"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setAsignando(null)}
            submitLabel="Asignar"
            submitIcon="tabler:user-check"
            onSubmit={handleAsignar}
            disabled={!tecnicoSel}
          />
        }
      >
        <FormField label="Técnico" icon="tabler:tool">
          <FieldIcon icon="tabler:tool">
            <Select value={tecnicoSel} onValueChange={setTecnicoSel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldIcon>
        </FormField>
      </FormDialog>

      {/* Resolver */}
      <FormDialog
        open={!!resolviendo}
        onOpenChange={(o) => !o && setResolviendo(null)}
        title="Resolver avería"
        subtitle="Qué se encontró y qué se hizo"
        icon="tabler:circle-check"
        tone="success"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setResolviendo(null)}
            submitLabel="Marcar resuelta"
            submitIcon="tabler:circle-check"
            onSubmit={handleResolver}
            disabled={!diagnostico.trim()}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <FormCallout>
            Motivo reportado:{' '}
            <span className="font-medium">{resolviendo?.motivo_reportado}</span>
          </FormCallout>

          <FormGrid>
            <FormField label="¿Qué se hizo realmente?" icon="tabler:clipboard-text" required wide>
              <Textarea
                placeholder="Puede ser distinto de lo reportado"
                value={diagnostico}
                onChange={(e) => setDiagnostico(e.target.value)}
              />
            </FormField>

            <FormField
              label="Potencia óptica medida (dBm, opcional)"
              icon="tabler:wave-sine"
              htmlFor="potenciaAveria"
              wide
            >
              <Input
                id="potenciaAveria"
                type="number"
                step="0.1"
                value={potencia}
                onChange={(e) => setPotencia(e.target.value)}
              />
            </FormField>

            {resolviendo?.cliente_id && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-ld bg-surface-2 px-4 py-3 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">Se cambió la ONU</p>
                  <p className="text-xs text-muted-foreground">
                    La vieja queda dañada, la nueva sale del stock del técnico asignado.
                  </p>
                </div>
                <Switch checked={cambiarOnu} onCheckedChange={setCambiarOnu} />
              </div>
            )}

            {resolviendo?.cliente_id && cambiarOnu && (
              <FormSection title="Cambio de ONU" icon="tabler:device-nfc">
                <FormField label="ONU retirada (dañada)">
                  <FieldIcon icon="tabler:device-nfc-off">
                    <Select value={onuViejaId} onValueChange={setOnuViejaId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona la ONU instalada" />
                      </SelectTrigger>
                      <SelectContent>
                        {onusViejas.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.numero_serie}
                          </SelectItem>
                        ))}
                        {onusViejas.length === 0 && (
                          <div className="p-2 text-xs text-muted-foreground">
                            No hay ONU instalada registrada para este cliente
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </FieldIcon>
                </FormField>
                <FormField label="ONU nueva (del stock del técnico)">
                  <FieldIcon icon="tabler:device-nfc">
                    <Select value={onuNuevaId} onValueChange={setOnuNuevaId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona la ONU de reemplazo" />
                      </SelectTrigger>
                      <SelectContent>
                        {onusNuevas.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.numero_serie}
                          </SelectItem>
                        ))}
                        {onusNuevas.length === 0 && (
                          <div className="p-2 text-xs text-muted-foreground">
                            El técnico no tiene ONUs disponibles
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </FieldIcon>
                </FormField>
              </FormSection>
            )}
          </FormGrid>
        </div>
      </FormDialog>

      {/* Evidencias */}
      <FormDialog
        open={!!viendoEvidencias}
        onOpenChange={(o) => !o && cerrarEvidencias()}
        title="Evidencias"
        subtitle="Fotos registradas por el técnico"
        icon="tabler:photo"
        tone="primary"
        size="xl"
      >
        {evidencias.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Sin fotos registradas para esta avería.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {evidencias.map((ev) => (
            <div key={ev.id} className="group relative">
              <img
                src={ev.blobUrl}
                alt={ev.descripcion ?? 'Evidencia'}
                className="h-32 w-full rounded-xl border border-ld object-cover"
              />
              <p className="mt-1 truncate text-xs text-muted-foreground">{ev.descripcion ?? '—'}</p>
              {puedeEliminar && (
                <Button
                  variant="lighterror"
                  size="icon"
                  className="absolute right-1 top-1 h-6 w-6"
                  onClick={() => handleEliminarEvidencia(ev.id)}
                >
                  <Icon icon="tabler:trash" height={13} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </FormDialog>

      {/* Corregir motivo */}
      <FormDialog
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        title="Corregir motivo reportado"
        subtitle="Ajusta lo que se anotó al reportar"
        icon="tabler:edit"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setEditando(null)}
            submitLabel="Guardar"
            onSubmit={handleEditar}
            disabled={!motivoEditado.trim()}
          />
        }
      >
        <FormField label="Motivo reportado" icon="tabler:message-2" htmlFor="motivoEditado" required>
          <Textarea
            id="motivoEditado"
            value={motivoEditado}
            onChange={(e) => setMotivoEditado(e.target.value)}
          />
        </FormField>
      </FormDialog>

      {/* Eliminar avería */}
      <FormDialog
        open={!!eliminando}
        onOpenChange={(o) => !o && setEliminando(null)}
        title="Eliminar avería"
        subtitle="Esta acción no se puede deshacer"
        icon="tabler:trash"
        tone="error"
        size="md"
        footer={
          <FormActions
            onCancel={() => setEliminando(null)}
            submitLabel="Eliminar"
            submitIcon="tabler:trash"
            submitVariant="destructive"
            onSubmit={handleEliminar}
          />
        }
      >
        <FormCallout tone="error">
          Se eliminará el reporte y sus evidencias. Esta acción no se puede deshacer.
        </FormCallout>
      </FormDialog>
    </div>
  );
};

export default AveriaZonaDetail;
