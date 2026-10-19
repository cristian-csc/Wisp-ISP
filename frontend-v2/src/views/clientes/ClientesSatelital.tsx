import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import {
  listClientes,
  listZonas,
  listPlanes,
  createCliente,
  aprobarCliente,
  rechazarCliente,
  activarSatelital,
  type ClienteListItem,
  type EstadoCliente,
  type Zona,
  type Plan,
} from 'src/lib/clientes';
import { enviarAvisoCobro } from 'src/lib/whatsapp';

const ESTADO_LABEL: Record<EstadoCliente, string> = {
  pendiente_aprobacion: 'Pendiente',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado — falta activar',
  no_instalado: 'No instalado',
  activo: 'Activo',
  anulado: 'Anulado',
  suspendido: 'Suspendido',
  pausado: 'En pausa',
};

const ESTADO_BADGE: Record<EstadoCliente, string> = {
  pendiente_aprobacion: 'bg-lightwarning text-warning',
  rechazado: 'bg-muted text-muted-foreground',
  aprobado: 'bg-lightinfo text-info',
  no_instalado: 'bg-muted text-muted-foreground',
  activo: 'bg-lightsuccess text-success',
  anulado: 'bg-muted text-muted-foreground',
  suspendido: 'bg-lighterror text-error',
  pausado: 'bg-lightinfo text-info',
};

const ClientesSatelital = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);

  const [crearOpen, setCrearOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [planId, setPlanId] = useState('');
  const [cuentaEmail, setCuentaEmail] = useState('');
  const [equipoModelo, setEquipoModelo] = useState('');
  const [equipoSerial, setEquipoSerial] = useState('');
  const [equipoValor, setEquipoValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [rechazando, setRechazando] = useState<ClienteListItem | null>(null);
  const [motivo, setMotivo] = useState('');

  async function reload() {
    setLoading(true);
    try {
      const data = await listClientes({ tipo_conexion: 'satelital', per_page: 100 });
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    listZonas().then(setZonas);
    listPlanes({ tipo_conexion: 'satelital' }).then(setPlanes);
  }, []);

  function resetForm() {
    setNombre(''); setDni(''); setTelefono(''); setDireccion('');
    setZonaId(''); setPlanId(''); setCuentaEmail(''); setEquipoModelo('');
    setEquipoSerial(''); setEquipoValor(''); setError(null);
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!zonaId || !planId) {
      setError('Selecciona zona y plan.');
      return;
    }
    setGuardando(true);
    try {
      const cliente = await createCliente({
        nombre, dni,
        telefono: telefono || undefined,
        direccion: direccion || undefined,
        zona_id: Number(zonaId),
        plan_id: Number(planId),
        tipo_conexion: 'satelital',
      });
      await aprobarCliente(cliente.id);
      await activarSatelital(cliente.id, {
        cuenta_starlink_email: cuentaEmail || undefined,
        equipo_modelo: equipoModelo || undefined,
        equipo_serial: equipoSerial || undefined,
        equipo_valor: equipoValor ? Number(equipoValor) : undefined,
      });
      setCrearOpen(false);
      resetForm();
      toast.success('Cliente satelital activado');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el cliente');
    } finally {
      setGuardando(false);
    }
  }

  async function handleRechazarConfirm() {
    if (!rechazando) return;
    await rechazarCliente(rechazando.id, motivo);
    setRechazando(null);
    setMotivo('');
    reload();
  }

  async function handleRecordatorio(c: ClienteListItem) {
    try {
      await enviarAvisoCobro(c.id);
      toast.success(`Recordatorio enviado a ${c.nombre}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo enviar el recordatorio (¿WhatsApp desconectado?)');
    }
  }

  function margen(p: Plan | null): string {
    if (!p || p.costo_proveedor == null) return '';
    return ` (ganancia S/ ${(p.precio - p.costo_proveedor).toFixed(2)})`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">Clientes Satelital</h1>
          <p className="text-sm text-muted-foreground">
            Equipos Starlink revendidos — solo recordatorios de pago, no se puede cortar el servicio.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setCrearOpen(true)}>
          <Icon icon="solar:satellite-linear" height={16} className="mr-1" />
          Nuevo cliente satelital
        </Button>
      </div>

      <CardBox>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay clientes satelitales todavía.
                </TableCell>
              </TableRow>
            )}
            {items.map((c) => (
              <TableRow key={c.id} className="hover:bg-primary/5">
                <TableCell>
                  <button type="button" className="text-sm font-medium text-primary hover:underline text-left" onClick={() => navigate(`/clientes-satelital/${c.id}`)}>
                    {c.nombre}
                  </button>
                  <p className="text-xs text-muted-foreground">DNI {c.dni ?? '—'}</p>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{c.telefono ?? '—'}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[12rem]">{c.cuenta_starlink_email ?? '—'}</p>
                </TableCell>
                <TableCell className="text-sm">
                  {c.plan?.nombre ?? '—'}
                  <span className="text-xs text-success">{margen(c.plan)}</span>
                </TableCell>
                <TableCell><Badge className={`${ESTADO_BADGE[c.estado]} rounded-md`}>{ESTADO_LABEL[c.estado]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.fecha_vencimiento ?? '—'}</TableCell>
                <TableCell className="text-end">
                  <TooltipProvider>
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/clientes-satelital/${c.id}`)}>
                            <Icon icon="tabler:eye" height={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Ver detalle</p></TooltipContent>
                      </Tooltip>
                      {c.estado === 'pendiente_aprobacion' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setRechazando(c)}>
                              <Icon icon="tabler:x" height={18} className="text-error" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Rechazar</p></TooltipContent>
                        </Tooltip>
                      )}
                      {c.estado === 'activo' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleRecordatorio(c)}>
                              <Icon icon="tabler:brand-whatsapp" height={18} className="text-success" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Enviar recordatorio de pago</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBox>

      {/* Nuevo cliente satelital */}
      <Dialog open={crearOpen} onOpenChange={(o) => { if (!o) resetForm(); setCrearOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuevo cliente satelital</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Queda activo de inmediato — no hay instalación de fibra que esperar.
          </p>
          <form id="satelital-create-form" onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="mb-2 block"><Label htmlFor="snombre">Nombre completo</Label></div>
              <Input id="snombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="sdni">DNI</Label></div>
              <Input id="sdni" value={dni} onChange={(e) => setDni(e.target.value)} maxLength={8} pattern="\d{8}" required />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="stel">Teléfono / WhatsApp</Label></div>
              <Input id="stel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label>Zona</Label></div>
              <Select value={zonaId} onValueChange={setZonaId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona una zona" /></SelectTrigger>
                <SelectContent>
                  {zonas.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 block"><Label htmlFor="sdir">Dirección</Label></div>
              <Input id="sdir" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label>Plan Starlink</Label></div>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un plan" /></SelectTrigger>
                <SelectContent>
                  {planes.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre} — S/ {p.precio}{margen(p)}</SelectItem>)}
                  {planes.length === 0 && <div className="p-2 text-xs text-muted-foreground">No hay planes satelitales creados — créalos en Planes.</div>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="scorreo">Correo de la cuenta Starlink</Label></div>
              <Input id="scorreo" type="email" value={cuentaEmail} onChange={(e) => setCuentaEmail(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="smodelo">Modelo del equipo</Label></div>
              <Input id="smodelo" placeholder="Ej. Gen 3" value={equipoModelo} onChange={(e) => setEquipoModelo(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="sserial">N° de serie del equipo</Label></div>
              <Input id="sserial" value={equipoSerial} onChange={(e) => setEquipoSerial(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="svalor">Costo del equipo (S/)</Label></div>
              <Input id="svalor" type="number" step="0.01" value={equipoValor} onChange={(e) => setEquipoValor(e.target.value)} />
            </div>
            {error && <p className="text-sm text-error md:col-span-2">{error}</p>}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCrearOpen(false)}>Cancelar</Button>
            <Button type="submit" form="satelital-create-form" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Registrar y activar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rechazar */}
      <Dialog open={!!rechazando} onOpenChange={(o) => !o && setRechazando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar cliente satelital</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo del rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazando(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={!motivo.trim()} onClick={handleRechazarConfirm}>Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesSatelital;
