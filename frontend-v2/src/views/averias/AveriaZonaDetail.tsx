import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
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
  const puedeAsignar = user?.rol === 'admin' || user?.rol === 'subadmin' || user?.rol === 'super_admin';
  const puedeOperar = puedeAsignar || user?.rol === 'tecnico';
  const puedeReportarPlanta = user?.rol !== 'vendedor_tienda';
  const puedeEliminar = user?.rol === 'admin' || user?.rol === 'super_admin';

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
        <div className="flex gap-2 ml-auto">
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
      <Dialog open={openCliente} onOpenChange={setOpenCliente}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avería de cliente</DialogTitle></DialogHeader>
          <form onSubmit={handleCrearCliente} className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Cliente</p>
              <ClienteSearchInput value={clienteSel} onChange={setClienteSel} placeholder="Buscar por nombre o DNI…" />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Motivo reportado</p>
              <ChipsMotivo opciones={MOTIVOS_CLIENTE} onPick={(m) => setMotivoCliente((prev) => (prev ? `${prev}, ${m}` : m))} />
              <Textarea value={motivoCliente} onChange={(e) => setMotivoCliente(e.target.value)} required />
            </div>
            {errorCliente && <p className="text-sm text-error">{errorCliente}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCliente(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reportar avería de planta externa */}
      <Dialog open={openPlanta} onOpenChange={setOpenPlanta}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avería de planta externa</DialogTitle></DialogHeader>
          <form onSubmit={handleCrearPlanta} className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Caja NAP</p>
              <Select value={cajaSel} onValueChange={setCajaSel}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona una caja NAP" /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.codigo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Motivo reportado</p>
              <ChipsMotivo opciones={MOTIVOS_PLANTA} onPick={(m) => setMotivoPlanta((prev) => (prev ? `${prev}, ${m}` : m))} />
              <Textarea value={motivoPlanta} onChange={(e) => setMotivoPlanta(e.target.value)} required />
            </div>
            {errorPlanta && <p className="text-sm text-error">{errorPlanta}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenPlanta(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Asignar técnico */}
      <Dialog open={!!asignando} onOpenChange={(o) => !o && setAsignando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Asignar técnico</DialogTitle></DialogHeader>
          <Select value={tecnicoSel} onValueChange={setTecnicoSel}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un técnico" /></SelectTrigger>
            <SelectContent>
              {tecnicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsignando(null)}>Cancelar</Button>
            <Button disabled={!tecnicoSel} onClick={handleAsignar}>Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolver */}
      <Dialog open={!!resolviendo} onOpenChange={(o) => !o && setResolviendo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolver avería</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Motivo reportado: <span className="text-foreground">{resolviendo?.motivo_reportado}</span>
          </p>
          <div>
            <p className="text-sm font-medium mb-2">¿Qué se hizo realmente?</p>
            <Textarea
              placeholder="Puede ser distinto de lo reportado — ej. se cambió router, no solo el conector"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Potencia óptica medida (dBm, opcional)</p>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-md border border-ld px-3 py-2 text-sm bg-background"
              value={potencia}
              onChange={(e) => setPotencia(e.target.value)}
            />
          </div>
          {resolviendo?.cliente_id && (
            <div className="flex items-center justify-between rounded-lg border border-ld px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Se cambió la ONU</p>
                <p className="text-xs text-muted-foreground">La vieja queda dañada, la nueva sale del stock del técnico asignado.</p>
              </div>
              <Switch checked={cambiarOnu} onCheckedChange={setCambiarOnu} />
            </div>
          )}
          {resolviendo?.cliente_id && cambiarOnu && (
            <>
              <div>
                <p className="text-sm font-medium mb-2">ONU retirada (dañada)</p>
                <Select value={onuViejaId} onValueChange={setOnuViejaId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona la ONU instalada" /></SelectTrigger>
                  <SelectContent>
                    {onusViejas.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.numero_serie}</SelectItem>)}
                    {onusViejas.length === 0 && <div className="p-2 text-xs text-muted-foreground">No hay ONU instalada registrada para este cliente</div>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">ONU nueva (del stock del técnico)</p>
                <Select value={onuNuevaId} onValueChange={setOnuNuevaId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona la ONU de reemplazo" /></SelectTrigger>
                  <SelectContent>
                    {onusNuevas.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.numero_serie}</SelectItem>)}
                    {onusNuevas.length === 0 && <div className="p-2 text-xs text-muted-foreground">El técnico no tiene ONUs disponibles</div>}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolviendo(null)}>Cancelar</Button>
            <Button disabled={!diagnostico.trim()} onClick={handleResolver}>Marcar resuelta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidencias */}
      <Dialog open={!!viendoEvidencias} onOpenChange={(o) => !o && cerrarEvidencias()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Evidencias</DialogTitle></DialogHeader>
          {evidencias.length === 0 && <p className="text-sm text-muted-foreground py-4">Sin fotos registradas para esta avería.</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {evidencias.map((ev) => (
              <div key={ev.id} className="relative group">
                <img src={ev.blobUrl} alt={ev.descripcion ?? 'Evidencia'} className="w-full h-32 object-cover rounded-lg border border-ld" />
                <p className="text-xs text-muted-foreground mt-1 truncate">{ev.descripcion ?? '—'}</p>
                {puedeEliminar && (
                  <Button
                    variant="lighterror"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => handleEliminarEvidencia(ev.id)}
                  >
                    <Icon icon="tabler:trash" height={13} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Corregir motivo */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Corregir motivo reportado</DialogTitle></DialogHeader>
          <Textarea value={motivoEditado} onChange={(e) => setMotivoEditado(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button disabled={!motivoEditado.trim()} onClick={handleEditar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar avería */}
      <Dialog open={!!eliminando} onOpenChange={(o) => !o && setEliminando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar avería</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción no se puede deshacer. Se eliminará el reporte y sus evidencias.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminando(null)}>Cancelar</Button>
            <Button variant="lighterror" onClick={handleEliminar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AveriaZonaDetail;
