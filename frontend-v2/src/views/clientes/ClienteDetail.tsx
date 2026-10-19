import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
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
import { Textarea } from 'src/components/ui/textarea';
import { api, getMe, type Usuario } from 'src/lib/api';
import {
  getCliente,
  aprobarCliente,
  rechazarCliente,
  cortarCliente,
  reactivarCliente,
  pausarCliente,
  updateCliente,
  getCalendarioPagos,
  type ClienteOut,
  type MesPago,
} from 'src/lib/clientes';
import { listPagos, createPago, getComprobanteBlobUrl, type Pago } from 'src/lib/pagos';
import { listOnus, type Onu } from 'src/lib/onus';
import { listEvidenciasCliente, getEvidenciaBlobUrl, type Evidencia } from 'src/lib/evidencias';
import { listZonas, type Zona } from 'src/lib/zonas';
import { listPlanes, type Plan as PlanOpcion } from 'src/lib/planes';
import ReciboDialog from 'src/components/apps/pagos/ReciboDialog';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const MES_ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  vencido: 'Vencido',
  pendiente: 'Pendiente',
  no_aplica: 'No aplica',
  futuro: 'Próximo',
  corte_temporal: 'Corte temporal',
};

const MES_ESTADO_CLASS: Record<string, string> = {
  pagado: 'bg-lightsuccess text-success border-success/20',
  vencido: 'bg-lighterror text-error border-error/20',
  pendiente: 'bg-lightwarning text-warning border-warning/20',
  no_aplica: 'bg-muted text-muted-foreground border-transparent opacity-50',
  futuro: 'bg-muted text-muted-foreground border-transparent',
  corte_temporal: 'bg-lighterror text-error border-error/20',
};

const PAGO_ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  corte_temporal: 'Corte temporal',
};

const PAGO_ESTADO_BADGE: Record<string, string> = {
  pagado: 'bg-lightsuccess text-success',
  pendiente: 'bg-lightwarning text-warning',
  vencido: 'bg-lighterror text-error',
  corte_temporal: 'bg-lighterror text-error',
};

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'otro', label: 'Otro' },
];

const ESTADO_LABEL: Record<string, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado — pendiente de instalación',
  no_instalado: 'No instalado',
  activo: 'Activo',
  anulado: 'Anulado',
  suspendido: 'Suspendido',
  pausado: 'En pausa',
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente_aprobacion: 'bg-lightwarning text-warning',
  rechazado: 'bg-muted text-muted-foreground',
  aprobado: 'bg-lightinfo text-info',
  no_instalado: 'bg-muted text-muted-foreground',
  activo: 'bg-lightsuccess text-success',
  anulado: 'bg-muted text-muted-foreground',
  suspendido: 'bg-lighterror text-error',
  pausado: 'bg-lightinfo text-info',
};

type HistorialItem = { id: number; tipo: string; descripcion: string; creado_en: string };
type FotoConUrl = Evidencia & { blobUrl: string };

const ROL_LABEL: Record<Usuario['rol'], string> = {
  super_admin: 'Desarrollador',
  admin: 'Administrador',
  subadmin: 'Sub-administrador',
  tecnico: 'Técnico',
  vendedor_campo: 'Vendedor de campo',
  vendedor_tienda: 'Atención al cliente',
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-muted-foreground uppercase">{label}</p>
    <p className="text-sm">{value ?? '—'}</p>
  </div>
);

const ClienteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<ClienteOut | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [rechazarOpen, setRechazarOpen] = useState(false);
  const [pausarOpen, setPausarOpen] = useState(false);
  const [mesesPausa, setMesesPausa] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<FotoConUrl[]>([]);
  const [fotoAbierta, setFotoAbierta] = useState<FotoConUrl | null>(null);
  const [calendario, setCalendario] = useState<MesPago[]>([]);
  const [anioCalendario, setAnioCalendario] = useState(new Date().getFullYear());
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMes, setPagoMes] = useState('');
  const [pagoFecha, setPagoFecha] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [pagoNumeroOperacion, setPagoNumeroOperacion] = useState('');
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [onuAsignada, setOnuAsignada] = useState<Onu | null>(null);
  const [comprobanteAbierto, setComprobanteAbierto] = useState<{ pago: Pago; url: string } | null>(null);
  const [cargandoComprobanteId, setCargandoComprobanteId] = useState<number | null>(null);
  const [reciboAbierto, setReciboAbierto] = useState<number | null>(null);
  const [editarOpen, setEditarOpen] = useState(false);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [planes, setPlanes] = useState<PlanOpcion[]>([]);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editZonaId, setEditZonaId] = useState('');
  const [editPlanId, setEditPlanId] = useState('');
  const [editCantidadTv, setEditCantidadTv] = useState('0');
  const [editTipoConexion, setEditTipoConexion] = useState<'fibra_optica' | 'inalambrico'>('fibra_optica');
  const [editNotas, setEditNotas] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  async function reload() {
    if (!id) return;
    const c = await getCliente(Number(id));
    setCliente(c);
    const { data } = await api.get(`/clientes/${id}/historial`);
    setHistorial(data);

    const evidencias = await listEvidenciasCliente(Number(id));
    const conUrl = await Promise.all(
      evidencias.map(async (ev) => ({ ...ev, blobUrl: await getEvidenciaBlobUrl(ev.id) })),
    );
    setFotos((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.blobUrl));
      return conUrl;
    });

    if (c.fecha_instalacion) {
      const pagosPage = await listPagos({ cliente_id: Number(id) });
      setPagos(pagosPage.items);

      const onus = await listOnus({ cliente_id: Number(id) });
      setOnuAsignada(onus[0] ?? null);
    }
  }

  async function handleVerComprobante(p: Pago) {
    setCargandoComprobanteId(p.id);
    try {
      const url = await getComprobanteBlobUrl(p.id);
      setComprobanteAbierto({ pago: p, url });
    } finally {
      setCargandoComprobanteId(null);
    }
  }

  async function reloadCalendario(anio: number) {
    if (!id) return;
    const data = await getCalendarioPagos(Number(id), anio);
    setCalendario(data);
  }

  useEffect(() => {
    reload();
    getMe().then(setCurrentUser).catch(() => {});
    listZonas().then(setZonas).catch(() => {});
    listPlanes().then((all) => setPlanes(all.filter((p) => p.tipo_conexion !== 'satelital'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (cliente?.fecha_instalacion) {
      reloadCalendario(anioCalendario);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cliente?.fecha_instalacion, anioCalendario]);

  useEffect(() => {
    // Liberar los blob URLs cuando se sale de la pantalla, para no filtrar memoria.
    return () => {
      fotos.forEach((f) => URL.revokeObjectURL(f.blobUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cliente) return <CardBox>Cargando…</CardBox>;

  const puedeAprobar = currentUser?.rol === 'admin' || currentUser?.rol === 'subadmin' || currentUser?.rol === 'super_admin';

  async function handleAprobar() {
    await aprobarCliente(cliente!.id);
    reload();
  }

  async function handleRechazar() {
    await rechazarCliente(cliente!.id, motivo);
    setRechazarOpen(false);
    setMotivo('');
    reload();
  }

  async function handleCortar() {
    await cortarCliente(cliente!.id);
    reload();
  }

  async function handleReactivar() {
    await reactivarCliente(cliente!.id);
    reload();
  }

  async function handlePausar() {
    await pausarCliente(cliente!.id, Number(mesesPausa) || 1);
    setPausarOpen(false);
    reload();
  }

  function abrirEditar() {
    if (!cliente) return;
    setEditNombre(cliente.nombre);
    setEditTelefono(cliente.telefono ?? '');
    setEditWhatsapp(cliente.telefono_whatsapp ?? '');
    setEditDireccion(cliente.direccion ?? '');
    setEditZonaId(String(cliente.zona_id));
    setEditPlanId(String(cliente.plan_id));
    setEditCantidadTv(String(cliente.cantidad_tv ?? 0));
    setEditTipoConexion((cliente.tipo_conexion as 'fibra_optica' | 'inalambrico' | null) ?? 'fibra_optica');
    setEditNotas(cliente.notas ?? '');
    setEditError(null);
    setEditarOpen(true);
  }

  async function handleGuardarEdicion() {
    if (!cliente) return;
    if (!editNombre.trim()) {
      setEditError('El nombre es obligatorio.');
      return;
    }
    setGuardandoEdicion(true);
    setEditError(null);
    try {
      await updateCliente(cliente.id, {
        nombre: editNombre.trim(),
        telefono: editTelefono.trim() || null,
        telefono_whatsapp: editWhatsapp.trim() || null,
        direccion: editDireccion.trim() || null,
        zona_id: Number(editZonaId),
        plan_id: Number(editPlanId),
        cantidad_tv: Number(editCantidadTv) || 0,
        tipo_conexion: editTipoConexion,
        notas: editNotas.trim() || null,
      });
      setEditarOpen(false);
      reload();
    } catch (err: any) {
      setEditError(err?.response?.data?.detail ?? 'No se pudo guardar los cambios');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  function abrirRegistrarPago() {
    const hoy = new Date();
    setPagoMonto(cliente?.monto_mensual != null ? String(cliente.monto_mensual) : '');
    // El mes que realmente debe según su propio ciclo (vencimiento), no el
    // mes calendario — así un pago de gracia queda etiquetado al mes correcto.
    setPagoMes(cliente?.fecha_vencimiento ? cliente.fecha_vencimiento.slice(0, 7) : hoy.toISOString().slice(0, 7));
    setPagoFecha(hoy.toISOString().slice(0, 10));
    setPagoMetodo('efectivo');
    setPagoNumeroOperacion('');
    setPagoError(null);
    setPagoDialogOpen(true);
  }

  async function handleRegistrarPago() {
    if (!cliente) return;
    if (!pagoMonto || !pagoMes || !pagoFecha) {
      setPagoError('Completa monto, mes y fecha de pago.');
      return;
    }
    setGuardandoPago(true);
    setPagoError(null);
    try {
      await createPago({
        cliente_id: cliente.id,
        monto: Number(pagoMonto),
        mes_pagado: pagoMes,
        fecha_pago: pagoFecha,
        metodo_pago: pagoMetodo,
        numero_operacion: pagoNumeroOperacion || undefined,
      });
      setPagoDialogOpen(false);
      await reload();
      await reloadCalendario(anioCalendario);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setPagoError(typeof detail === 'string' ? detail : 'No se pudo registrar el pago');
    } finally {
      setGuardandoPago(false);
    }
  }

  const iniciales = cliente.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const hoy = new Date().toISOString().slice(0, 10);
  const estadoDot =
    cliente.estado === 'activo' ? 'bg-success'
    : cliente.estado === 'suspendido' ? 'bg-error'
    : cliente.estado === 'pausado' ? 'bg-info'
    : 'bg-muted-foreground';
  const alDia = !cliente.fecha_vencimiento || cliente.fecha_vencimiento >= hoy;
  const tieneDetalleCuota = (cliente.monto_mensual_detalle?.length ?? 0) > 0;
  const tieneInfraestructura = !!cliente.borne || !!onuAsignada;
  const tieneDatosCuenta = !!cliente.vendedor || !!cliente.aprobado_por || !!cliente.tecnico_instalador || !!cliente.usuario_pppoe;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate('/clientes')}
          className="gap-1.5 -ml-3 text-muted-foreground"
        >
          <Icon icon="tabler:arrow-left" height={18} />
          Volver a clientes
        </Button>
      </div>

      {/* ── Hero: identidad, estado y acciones ── */}
      <CardBox className="p-6 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/5 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-ld">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xl font-bold shadow-md">
                {iniciales || '—'}
              </div>
              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white dark:border-dark ${estadoDot}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h1 className="text-xl font-bold truncate">{cliente.nombre}</h1>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">#{cliente.id}</span>
                <span className="rounded-full border border-info/25 bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info whitespace-nowrap">
                  DNI {cliente.dni ?? '—'}
                </span>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Icon icon="tabler:map-pin" height={15} className="text-primary shrink-0" />{cliente.direccion ?? 'Sin dirección'}</span>
                <span className="text-border">•</span>
                <span className="flex items-center gap-1"><Icon icon="tabler:phone" height={15} className="text-primary shrink-0" />{cliente.telefono ?? 'Sin teléfono'}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${ESTADO_BADGE[cliente.estado]} rounded-full px-3`}>{ESTADO_LABEL[cliente.estado]}</Badge>
            {cliente.tipo_conexion === 'fibra_optica' && (
              <span className="flex items-center gap-1.5 rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary">
                <Icon icon="tabler:plug-connected" height={14} /> Fibra óptica
              </span>
            )}
            {cliente.plan && (
              <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Icon icon="tabler:gauge" height={14} /> {cliente.plan.nombre}
              </span>
            )}
            {cliente.zona && (
              <span className="flex items-center gap-1.5 rounded-full border border-ld bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Icon icon="tabler:map-pin" height={14} /> {cliente.zona.nombre}
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="relative pt-5 flex flex-wrap items-center gap-2">
          <Button variant="lightprimary" className="rounded-md" onClick={abrirEditar}>
            <Icon icon="tabler:pencil" height={16} className="mr-1" />
            Editar
          </Button>
          {cliente.estado === 'pendiente_aprobacion' && puedeAprobar && (
            <>
              <Button variant="lightsuccess" onClick={handleAprobar} className="rounded-md">
                Aprobar instalación
              </Button>
              <Button variant="lighterror" className="rounded-md" onClick={() => setRechazarOpen(true)}>
                Rechazar
              </Button>
            </>
          )}
          {cliente.estado === 'aprobado' && (
            <p className="text-sm text-muted-foreground self-center">
              Esperando que el técnico complete la instalación desde la app móvil.
            </p>
          )}
          {cliente.estado === 'activo' && (
            <>
              <Button variant="lighterror" className="rounded-md" onClick={handleCortar}>
                Cortar servicio
              </Button>
              <Button
                variant="lightinfo"
                className="rounded-md"
                onClick={() => { setMesesPausa('1'); setPausarOpen(true); }}
              >
                Pausar temporalmente
              </Button>
            </>
          )}
          {(cliente.estado === 'suspendido' || cliente.estado === 'pausado') && (
            <Button variant="lightsuccess" className="rounded-md" onClick={handleReactivar}>
              Reactivar
            </Button>
          )}
          {cliente.estado === 'pausado' && cliente.pausa_hasta && (
            <span className="text-xs text-muted-foreground">Pausado hasta {cliente.pausa_hasta}</span>
          )}
        </div>
      </CardBox>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* ── Columna principal ── */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          {tieneInfraestructura && (
            <CardBox className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Icon icon="tabler:topology-star-3" height={18} className="text-primary" />
                Infraestructura
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-ld bg-muted/30 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Icon icon="tabler:box" height={15} className="text-primary" /> Caja NAP
                  </div>
                  <p className="font-mono text-sm font-bold">{cliente.borne?.caja_nap?.codigo ?? '—'}</p>
                  {cliente.borne && <p className="text-xs text-muted-foreground mt-0.5">Borne {cliente.borne.numero}</p>}
                </div>
                <div className="rounded-lg border border-ld bg-muted/30 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Icon icon="tabler:tag" height={15} className="text-primary" /> Precinto
                  </div>
                  <p className="font-mono text-sm font-bold">{cliente.borne?.codigo_precinto ?? 'Sin registrar'}</p>
                  {cliente.metros_cable != null && <p className="text-xs text-muted-foreground mt-0.5">{cliente.metros_cable} m de cable</p>}
                </div>
                <div className="rounded-lg border border-ld bg-muted/30 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Icon icon="tabler:router" height={15} className="text-primary" /> ONU asignada
                  </div>
                  <p className="font-mono text-sm font-bold truncate">{onuAsignada?.numero_serie ?? 'Sin asignar'}</p>
                  {onuAsignada?.marca && <p className="text-xs text-muted-foreground mt-0.5">{onuAsignada.marca}</p>}
                </div>
              </div>
            </CardBox>
          )}

          {(tieneDatosCuenta || cliente.notas || cliente.cantidad_tv > 0 || cliente.motivo_rechazo || cliente.motivo_no_instalado) && (
            <CardBox className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Icon icon="tabler:id-badge-2" height={18} className="text-primary" />
                Detalles de la cuenta
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7">
                <Field label="Usuario PPPoE" value={cliente.usuario_pppoe} />
                <Field label="TVs" value={cliente.cantidad_tv} />
                {cliente.vendedor && (
                  <Field label="Registrado por" value={`${cliente.vendedor.nombre} (${ROL_LABEL[cliente.vendedor.rol]})`} />
                )}
                {cliente.aprobado_por && (
                  <Field label="Aprobado por" value={`${cliente.aprobado_por.nombre} (${ROL_LABEL[cliente.aprobado_por.rol]})`} />
                )}
                {cliente.tecnico_instalador && (
                  <Field label="Instalado por" value={`${cliente.tecnico_instalador.nombre} (${ROL_LABEL[cliente.tecnico_instalador.rol]})`} />
                )}
                {cliente.notas && <Field label="Notas" value={cliente.notas} />}
                {cliente.motivo_rechazo && <Field label="Motivo de rechazo" value={cliente.motivo_rechazo} />}
                {cliente.motivo_no_instalado && (
                  <Field label="Motivo no instalado" value={cliente.motivo_no_instalado} />
                )}
              </div>
            </CardBox>
          )}

          {cliente.fecha_instalacion && (
            <CardBox>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Icon icon="tabler:calendar-stats" height={18} className="text-primary" />
                  Calendario de pagos
                </h3>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setAnioCalendario((a) => a - 1)}>
                    <Icon icon="tabler:chevron-left" height={18} />
                  </Button>
                  <span className="text-sm font-medium w-12 text-center">{anioCalendario}</span>
                  <Button variant="ghost" size="icon" onClick={() => setAnioCalendario((a) => a + 1)}>
                    <Icon icon="tabler:chevron-right" height={18} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {calendario.map((m, i) => (
                  <div
                    key={m.mes}
                    className={`rounded-lg border p-3 text-center ${MES_ESTADO_CLASS[m.estado] ?? 'bg-muted text-muted-foreground border-transparent'}`}
                  >
                    <p className="text-sm font-semibold">{MESES[i]}</p>
                    <p className="text-xs mt-1">{MES_ESTADO_LABEL[m.estado] ?? m.estado}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-6 mb-3">
                <h4 className="text-sm font-semibold">Historial de pagos</h4>
                <Button size="sm" onClick={abrirRegistrarPago}>
                  <Icon icon="tabler:plus" height={16} className="mr-1" />
                  Registrar pago
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha de pago</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead className="text-end">Recibo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          Sin pagos registrados.
                        </TableCell>
                      </TableRow>
                    )}
                    {pagos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.mes_pagado}</TableCell>
                        <TableCell>S/ {p.monto.toFixed(2)}</TableCell>
                        <TableCell>{p.fecha_pago}</TableCell>
                        <TableCell className="capitalize">{p.metodo_pago}</TableCell>
                        <TableCell>
                          <Badge className={`${PAGO_ESTADO_BADGE[p.estado] ?? 'bg-muted text-muted-foreground'} rounded-md`}>
                            {PAGO_ESTADO_LABEL[p.estado] ?? p.estado}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.ruta_comprobante ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={cargandoComprobanteId === p.id}
                              onClick={() => handleVerComprobante(p)}
                            >
                              <Icon icon="tabler:receipt" height={16} className="mr-1" />
                              Ver
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button variant="ghost" size="icon" title="Imprimir recibo" onClick={() => setReciboAbierto(p.id)}>
                            <Icon icon="tabler:printer" height={18} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardBox>
          )}

          {fotos.length > 0 && (
            <CardBox>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Icon icon="tabler:photo" height={18} className="text-primary" />
                Fotos
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {fotos.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="text-left group"
                    onClick={() => setFotoAbierta(f)}
                  >
                    <img
                      src={f.blobUrl}
                      alt={f.descripcion ?? 'Foto del cliente'}
                      className="w-full h-32 object-cover rounded-lg border border-ld group-hover:opacity-80 transition-opacity"
                    />
                    <p className="text-xs text-muted-foreground mt-1 truncate">{f.descripcion ?? '—'}</p>
                  </button>
                ))}
              </div>
            </CardBox>
          )}

          <CardBox>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Icon icon="tabler:history" height={18} className="text-primary" />
              Historial de eventos
            </h3>
            {historial.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              <div>
                {historial.map((h, idx) => (
                  <div key={h.id} className="flex gap-x-3">
                    <div className="w-24 sm:w-32 text-end shrink-0">
                      <span className="block text-xs font-medium text-foreground dark:text-muted-foreground">
                        {new Date(h.creado_en).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(h.creado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`relative ${
                        idx === historial.length - 1 ? 'after:hidden' : ''
                      } after:absolute after:top-7 after:bottom-0 after:start-3.5 after:w-px after:-translate-x-[0.5px] after:bg-border`}
                    >
                      <div className="relative z-1 w-7 h-7 flex justify-center items-center">
                        <div className="h-3 w-3 rounded-full bg-transparent border-2 border-primary"></div>
                      </div>
                    </div>
                    <div className="grow min-w-0 pt-0.5 pb-6">
                      <p className="text-sm font-medium text-foreground dark:text-muted-foreground">
                        {h.descripcion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBox>
        </div>

        {/* ── Columna lateral: plan y finanzas ── */}
        <div className="flex flex-col gap-6">
          {cliente.plan && (
            <CardBox className="p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-primary/5 pointer-events-none" />
              <div className="relative flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Plan contratado</span>
                <Badge className={`${ESTADO_BADGE[cliente.estado]} rounded-full px-2.5 text-[11px]`}>{ESTADO_LABEL[cliente.estado]}</Badge>
              </div>
              <h4 className="relative text-lg font-bold">{cliente.plan.nombre}</h4>
              <p className="relative text-xs text-muted-foreground mt-0.5">
                {cliente.plan.bajada_mbps} Mbps bajada / {cliente.plan.subida_mbps} Mbps subida
                {cliente.plan.incluye_tv && cliente.plan.tv_incluidas > 0 ? ` · ${cliente.plan.tv_incluidas} TV incluida${cliente.plan.tv_incluidas > 1 ? 's' : ''}` : ''}
              </p>
              <div className="relative mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-primary">S/ {cliente.monto_mensual?.toFixed(2) ?? '0.00'}</span>
                <span className="text-sm text-muted-foreground">/ mes</span>
              </div>
              {tieneDetalleCuota && (
                <div className="relative mt-4 pt-4 border-t border-ld space-y-2">
                  {cliente.monto_mensual_detalle!.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon icon="tabler:circle-check" height={15} className="text-success shrink-0" />
                        {d.concepto}
                      </span>
                      <span className="font-medium">S/ {d.monto.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBox>
          )}

          <CardBox className="p-6">
            <div className="flex items-center justify-between pb-3 border-b border-ld mb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon icon="tabler:wallet" height={18} className="text-primary" />
                Estado financiero
              </h3>
              {cliente.fecha_instalacion && (
                <Badge className={`${alDia ? 'bg-lightsuccess text-success' : 'bg-lighterror text-error'} rounded-md text-[11px]`}>
                  {alDia ? 'Al día' : 'Atrasado'}
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próximo vencimiento</p>
              <p className="text-lg font-bold">{cliente.fecha_vencimiento ?? '—'}</p>
            </div>
            {cliente.compromiso_pago_hasta && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-info/20 bg-info/10 px-3 py-2 text-xs text-info">
                <Icon icon="tabler:handshake" height={15} className="shrink-0" />
                Compromiso de pago hasta {cliente.compromiso_pago_hasta}
              </div>
            )}
          </CardBox>
        </div>
      </div>

      <Dialog open={rechazarOpen} onOpenChange={setRechazarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar instalación</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo del rechazo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazarOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={!motivo.trim()} onClick={handleRechazar}>
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar cliente */}
      <Dialog open={editarOpen} onOpenChange={setEditarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="editNombre">Nombre</Label>
              <Input id="editNombre" className="mt-2" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editTelefono">Teléfono</Label>
              <Input id="editTelefono" className="mt-2" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editWhatsapp">WhatsApp</Label>
              <Input id="editWhatsapp" className="mt-2" value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)} placeholder="Igual al teléfono si lo dejas vacío" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="editDireccion">Dirección</Label>
              <Input id="editDireccion" className="mt-2" value={editDireccion} onChange={(e) => setEditDireccion(e.target.value)} />
            </div>
            <div>
              <Label>Zona</Label>
              <Select value={editZonaId} onValueChange={setEditZonaId}>
                <SelectTrigger className="w-full mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {zonas.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={editPlanId} onValueChange={setEditPlanId}>
                <SelectTrigger className="w-full mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {planes.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre} — S/ {p.precio.toFixed(2)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="editCantidadTv">Cantidad de TVs</Label>
              <Input id="editCantidadTv" type="number" min={0} className="mt-2" value={editCantidadTv} onChange={(e) => setEditCantidadTv(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de conexión</Label>
              <Select value={editTipoConexion} onValueChange={(v) => setEditTipoConexion(v as 'fibra_optica' | 'inalambrico')}>
                <SelectTrigger className="w-full mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                  <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="editNotas">Notas</Label>
              <Textarea id="editNotas" className="mt-2" value={editNotas} onChange={(e) => setEditNotas(e.target.value)} rows={3} />
            </div>
          </div>
          {editError && <p className="text-sm text-error mt-2">{editError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditarOpen(false)}>Cancelar</Button>
            <Button disabled={guardandoEdicion} onClick={handleGuardarEdicion}>
              {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pausa temporal */}
      <Dialog open={pausarOpen} onOpenChange={setPausarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar servicio temporalmente</DialogTitle>
          </DialogHeader>
          <div>
            <div className="mb-2 block">
              <Label htmlFor="mesesPausaDetalle">¿Por cuántos meses?</Label>
            </div>
            <Input
              id="mesesPausaDetalle"
              type="number"
              min={1}
              value={mesesPausa}
              onChange={(e) => setMesesPausa(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPausarOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePausar}>Confirmar pausa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={pagoDialogOpen} onOpenChange={setPagoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="mb-2 block">
                <Label htmlFor="pagoMonto">Monto (S/)</Label>
              </div>
              <Input
                id="pagoMonto"
                type="number"
                step="0.01"
                min={0}
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 block">
                <Label htmlFor="pagoMes">Mes pagado</Label>
              </div>
              <Input
                id="pagoMes"
                type="month"
                value={pagoMes}
                onChange={(e) => setPagoMes(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 block">
                <Label htmlFor="pagoFecha">Fecha de pago</Label>
              </div>
              <Input
                id="pagoFecha"
                type="date"
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 block">
                <Label>Método de pago</Label>
              </div>
              <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 block">
                <Label htmlFor="pagoNumeroOperacion">Número de operación</Label>
              </div>
              <Input
                id="pagoNumeroOperacion"
                value={pagoNumeroOperacion}
                onChange={(e) => setPagoNumeroOperacion(e.target.value.toUpperCase())}
              />
              {pagoMetodo !== 'efectivo' && !pagoNumeroOperacion && (
                <p className="text-xs text-warning mt-1">
                  Recomendado para Yape/Plin/transferencia/depósito — evita registrar el mismo comprobante dos veces.
                </p>
              )}
            </div>
          </div>
          {pagoError && <p className="text-sm text-error mt-2">{pagoError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={guardandoPago} onClick={handleRegistrarPago}>
              {guardandoPago ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor de foto en grande */}
      <Dialog open={!!fotoAbierta} onOpenChange={(o) => !o && setFotoAbierta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{fotoAbierta?.descripcion ?? 'Foto'}</DialogTitle>
          </DialogHeader>
          {fotoAbierta && (
            <img src={fotoAbierta.blobUrl} alt={fotoAbierta.descripcion ?? 'Foto del cliente'} className="w-full rounded-lg" />
          )}
          <p className="text-xs text-muted-foreground">
            {fotoAbierta && new Date(fotoAbierta.creado_en).toLocaleString('es-PE')}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!comprobanteAbierto}
        onOpenChange={(o) => {
          if (!o) {
            if (comprobanteAbierto) URL.revokeObjectURL(comprobanteAbierto.url);
            setComprobanteAbierto(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Voucher — {comprobanteAbierto?.pago.mes_pagado}</DialogTitle>
          </DialogHeader>
          {comprobanteAbierto && (
            <img
              src={comprobanteAbierto.url}
              alt="Comprobante de pago"
              className="w-full max-h-[70vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      <ReciboDialog pagoId={reciboAbierto} onOpenChange={(o) => !o && setReciboAbierto(null)} />
    </div>
  );
};

export default ClienteDetail;
