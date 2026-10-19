import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import {
  getCliente,
  updateCliente,
  getCalendarioPagos,
  type ClienteOut,
  type MesPago,
  type EstadoCliente,
} from 'src/lib/clientes';
import { enviarAvisoCobro } from 'src/lib/whatsapp';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const MES_ESTADO_CLASS: Record<string, string> = {
  pagado: 'bg-lightsuccess text-success border-success/20',
  vencido: 'bg-lighterror text-error border-error/20',
  pendiente: 'bg-lightwarning text-warning border-warning/20',
  no_aplica: 'bg-muted text-muted-foreground border-transparent opacity-50',
  futuro: 'bg-muted text-muted-foreground border-transparent',
};

const ESTADO_LABEL: Record<EstadoCliente, string> = {
  pendiente_aprobacion: 'Pendiente',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
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

const ClienteSatelitalDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [cliente, setCliente] = useState<ClienteOut | null>(null);
  const [calendario, setCalendario] = useState<MesPago[]>([]);
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [cuentaEmail, setCuentaEmail] = useState('');
  const [equipoModelo, setEquipoModelo] = useState('');
  const [equipoSerial, setEquipoSerial] = useState('');
  const [equipoValor, setEquipoValor] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    try {
      const [c, cal] = await Promise.all([
        getCliente(Number(id)),
        getCalendarioPagos(Number(id)).catch(() => []),
      ]);
      setCliente(c);
      setCalendario(cal);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function abrirEditar() {
    if (!cliente) return;
    setTelefono(cliente.telefono ?? '');
    setDireccion(cliente.direccion ?? '');
    setCuentaEmail(cliente.cuenta_starlink_email ?? '');
    setEquipoModelo(cliente.equipo_modelo ?? '');
    setEquipoSerial(cliente.equipo_serial ?? '');
    setEquipoValor(cliente.equipo_valor != null ? String(cliente.equipo_valor) : '');
    setEditando(true);
  }

  async function handleGuardar() {
    if (!cliente) return;
    setGuardando(true);
    try {
      await updateCliente(cliente.id, {
        telefono: telefono || null,
        direccion: direccion || null,
        cuenta_starlink_email: cuentaEmail || null,
        equipo_modelo: equipoModelo || undefined,
        equipo_serial: equipoSerial || undefined,
        equipo_valor: equipoValor ? Number(equipoValor) : undefined,
      });
      setEditando(false);
      reload();
      toast.success('Datos actualizados');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function handleRecordatorio() {
    if (!cliente) return;
    try {
      await enviarAvisoCobro(cliente.id);
      toast.success('Recordatorio enviado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo enviar (¿WhatsApp desconectado?)');
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground p-6">Cargando…</p>;
  if (!cliente) return <p className="text-sm text-error p-6">Cliente no encontrado.</p>;

  const margen = cliente.plan && cliente.plan.costo_proveedor != null
    ? cliente.plan.precio - cliente.plan.costo_proveedor
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clientes-satelital')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl truncate">{cliente.nombre}</h1>
            <Badge className={`${ESTADO_BADGE[cliente.estado]} rounded-md`}>{ESTADO_LABEL[cliente.estado]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">DNI {cliente.dni ?? '—'} · {cliente.zona?.nombre ?? '—'}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          {cliente.estado === 'activo' && (
            <Button variant="lightsuccess" onClick={handleRecordatorio}>
              <Icon icon="tabler:brand-whatsapp" height={16} className="mr-1" />
              Enviar recordatorio
            </Button>
          )}
          <Button variant="lightprimary" onClick={abrirEditar}>
            <Icon icon="tabler:pencil" height={16} className="mr-1" />
            Editar
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2">
        <Icon icon="tabler:info-circle" height={14} />
        Cliente satelital — el servicio lo presta Starlink directamente. Este módulo es informativo y para recordatorios de pago; no se puede cortar ni instalar desde aquí.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CardBox className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tabler:address-book" height={16} /> Contacto
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <p><span className="text-muted-foreground">Teléfono:</span> {cliente.telefono ?? '—'}</p>
            <p><span className="text-muted-foreground">Dirección:</span> {cliente.direccion ?? '—'}</p>
          </div>
        </CardBox>

        <CardBox className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tabler:file-invoice" height={16} /> Plan
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">{cliente.plan?.nombre ?? '—'}</p>
            <p><span className="text-muted-foreground">Cobro al cliente:</span> S/ {cliente.plan?.precio.toFixed(2) ?? '—'}</p>
            {margen != null && (
              <p><span className="text-muted-foreground">Ganancia:</span> <span className="text-success font-medium">S/ {margen.toFixed(2)}</span></p>
            )}
            <p><span className="text-muted-foreground">Vencimiento:</span> {cliente.fecha_vencimiento ?? '—'}</p>
          </div>
        </CardBox>

        <CardBox className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icon icon="solar:satellite-linear" height={16} /> Equipo Starlink
          </h3>
          <div className="flex flex-col gap-2 text-sm">
            <p><span className="text-muted-foreground">Correo de la cuenta:</span> {cliente.cuenta_starlink_email ?? '—'}</p>
            <p><span className="text-muted-foreground">Modelo:</span> {cliente.equipo_modelo ?? '—'}</p>
            <p><span className="text-muted-foreground">N° de serie:</span> {cliente.equipo_serial ?? '—'}</p>
            <p><span className="text-muted-foreground">Costo del equipo:</span> {cliente.equipo_valor != null ? `S/ ${cliente.equipo_valor.toFixed(2)}` : '—'}</p>
          </div>
        </CardBox>
      </div>

      <CardBox className="p-6">
        <h3 className="text-sm font-semibold mb-4">Calendario de pagos</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {calendario.map((m) => {
            const mesNum = Number(m.mes.slice(5, 7));
            return (
              <div key={m.mes} className={`rounded-lg border px-3 py-2.5 text-center ${MES_ESTADO_CLASS[m.estado] ?? ''}`}>
                <p className="text-xs font-semibold">{MESES[mesNum - 1]}</p>
                <p className="text-[10px] mt-0.5">{m.mes.slice(0, 4)}</p>
              </div>
            );
          })}
          {calendario.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Sin historial de pagos.</p>}
        </div>
      </CardBox>

      {/* Editar */}
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar cliente satelital</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="mb-2 block"><Label htmlFor="etel">Teléfono</Label></div>
              <Input id="etel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="edir">Dirección</Label></div>
              <Input id="edir" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="ecorreo">Correo de la cuenta Starlink</Label></div>
              <Input id="ecorreo" type="email" value={cuentaEmail} onChange={(e) => setCuentaEmail(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="emodelo">Modelo del equipo</Label></div>
              <Input id="emodelo" value={equipoModelo} onChange={(e) => setEquipoModelo(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="eserial">N° de serie</Label></div>
              <Input id="eserial" value={equipoSerial} onChange={(e) => setEquipoSerial(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block"><Label htmlFor="evalor">Costo del equipo (S/)</Label></div>
              <Input id="evalor" type="number" step="0.01" value={equipoValor} onChange={(e) => setEquipoValor(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClienteSatelitalDetail;
