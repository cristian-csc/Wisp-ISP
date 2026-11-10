import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
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
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
  FormSection,
} from 'src/components/shared/form';
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
import {
  listPagos,
  createPago,
  getComprobanteBlobUrl,
  descargarReportePagos,
  type Pago,
} from 'src/lib/pagos';
import BotonDescargarReporte from 'src/components/shared/BotonDescargarReporte';
import { listOnus, type Onu } from 'src/lib/onus';
import { listEvidenciasCliente, getEvidenciaBlobUrl, type Evidencia } from 'src/lib/evidencias';
import { listZonas, type Zona } from 'src/lib/zonas';
import { listPlanes, type Plan as PlanOpcion } from 'src/lib/planes';
import ReciboDialog from 'src/components/apps/pagos/ReciboDialog';
import CarritoMeses from 'src/components/apps/pagos/CarritoMeses';
import { ROL_LABEL } from 'src/lib/permisos';

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

function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Color del punto en la línea de tiempo, segun el tipo de evento real. */
function colorEvento(tipo: string): string {
  if (tipo === 'activacion' || tipo === 'reactivacion') return 'var(--success)';
  if (tipo === 'corte' || tipo === 'suspension') return 'var(--error)';
  if (tipo === 'pago') return 'var(--primary)';
  return 'var(--muted-foreground)';
}

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
  const [pestana, setPestana] = useState<'resumen' | 'pagos' | 'equipos' | 'documentos' | 'historial'>('resumen');
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
  const [pagoSubtotal, setPagoSubtotal] = useState('');
  // Rebaja que decide quien cobra; el total sale de restarla al subtotal
  const [pagoDescuento, setPagoDescuento] = useState('0');
  const [pagoMes, setPagoMes] = useState('');
  const [pagoFecha, setPagoFecha] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [pagoNumeroOperacion, setPagoNumeroOperacion] = useState('');
  // Meses que cubre el cobro: con más de uno, el monto es el total cobrado
  const [pagoMeses, setPagoMeses] = useState('1');
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

  const puedeAprobar = currentUser?.rol === 'admin';

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
    setPagoSubtotal(cliente?.monto_mensual != null ? cliente.monto_mensual.toFixed(2) : '');
    setPagoDescuento('0');
    // El mes que realmente debe según su propio ciclo (vencimiento), no el
    // mes calendario — así un pago de gracia queda etiquetado al mes correcto.
    setPagoMes(cliente?.fecha_vencimiento ? cliente.fecha_vencimiento.slice(0, 7) : hoy.toISOString().slice(0, 7));
    setPagoFecha(hoy.toISOString().slice(0, 10));
    setPagoMetodo('efectivo');
    setPagoNumeroOperacion('');
    setPagoMeses('1');
    setPagoError(null);
    setPagoDialogOpen(true);
  }

  /** Subtotal de los meses del carrito, rebaja y total a pagar — los tres
   *  números quedan a la vista, como en una boleta. */
  const pagoMesesNum = Number(pagoMeses) || 1;
  const pagoCuota = cliente?.monto_mensual ?? 0;
  const pagoSubtotalNum = Number(pagoSubtotal) || 0;
  const pagoDescuentoNum = Number(pagoDescuento) || 0;
  const pagoTotal = pagoSubtotalNum - pagoDescuentoNum;

  function cambiarPagoMeses(cantidad: number) {
    setPagoMeses(String(cantidad));
    if (pagoCuota) setPagoSubtotal((pagoCuota * cantidad).toFixed(2));
  }

  async function handleRegistrarPago() {
    if (!cliente) return;
    if (!pagoSubtotal || !pagoMes || !pagoFecha) {
      setPagoError('Completa subtotal, mes y fecha de pago.');
      return;
    }
    if (pagoTotal <= 0) {
      setPagoError('El descuento no puede ser igual ni mayor que el subtotal.');
      return;
    }
    setGuardandoPago(true);
    setPagoError(null);
    try {
      await createPago({
        cliente_id: cliente.id,
        monto: Number(pagoTotal.toFixed(2)),
        mes_pagado: pagoMes,
        fecha_pago: pagoFecha,
        metodo_pago: pagoMetodo,
        numero_operacion: pagoNumeroOperacion || undefined,
        meses: pagoMesesNum,
        descuento: pagoDescuentoNum,
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

  const estadoDot =
    cliente.estado === 'activo' ? 'bg-success'
    : cliente.estado === 'suspendido' ? 'bg-error'
    : cliente.estado === 'pausado' ? 'bg-info'
    : 'bg-muted-foreground';
  const tieneDetalleCuota = (cliente.monto_mensual_detalle?.length ?? 0) > 0;
  const tieneInfraestructura = !!cliente.borne || !!onuAsignada;

  /** Cuánto falta para el vencimiento, calculado desde la fecha real. */
  const diasParaVencer = (() => {
    if (!cliente.fecha_vencimiento) return undefined;
    const dias = Math.round(
      (new Date(cliente.fecha_vencimiento).getTime() - Date.now()) / 86400000,
    );
    if (dias > 1) return `En ${dias} días`;
    if (dias === 1) return 'Mañana';
    if (dias === 0) return 'Vence hoy';
    return `Vencido hace ${Math.abs(dias)} días`;
  })();

  /** Las pestañas solo se muestran cuando hay información real detrás. */
  const PESTANAS = [
    { id: 'resumen' as const, etiqueta: 'Resumen', icono: 'tabler:layout-dashboard', disponible: true },
    { id: 'pagos' as const, etiqueta: 'Pagos', icono: 'tabler:receipt-2', disponible: !!cliente.fecha_instalacion },
    { id: 'equipos' as const, etiqueta: 'Equipos', icono: 'tabler:router', disponible: tieneInfraestructura },
    { id: 'documentos' as const, etiqueta: 'Documentos', icono: 'tabler:photo', disponible: fotos.length > 0 },
    { id: 'historial' as const, etiqueta: 'Historial', icono: 'tabler:history', disponible: historial.length > 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Migas ── */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate('/clientes')}
          className="transition-ui inline-flex items-center gap-1 hover:text-primary"
        >
          <Icon icon="tabler:arrow-left" height={16} />
          Clientes
        </button>
        <Icon icon="tabler:chevron-right" height={14} />
        <span className="text-foreground">Detalle del cliente</span>
      </div>

      {/* ── Encabezado: identidad, estado y acciones ── */}
      <CardBox className="p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0">
              <div className="grid size-[72px] place-items-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {iniciales || '—'}
              </div>
              <span
                className={`absolute bottom-1 right-1 size-4 rounded-full border-2 border-card ${estadoDot}`}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold">{cliente.nombre}</h1>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  #{cliente.id}
                </span>
                {cliente.tipo_documento === 'ruc' && cliente.ruc ? (
                  <span className="rounded-full bg-lightinfo px-2.5 py-0.5 text-xs font-semibold text-info-text">
                    RUC {cliente.ruc}
                  </span>
                ) : (
                  <span className="rounded-full bg-lightinfo px-2.5 py-0.5 text-xs font-semibold text-info-text">
                    DNI {cliente.dni ?? '—'}
                  </span>
                )}
              </div>

              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Icon icon="tabler:map-pin" height={15} className="shrink-0 text-primary" />
                  {cliente.direccion ?? 'Sin dirección'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon icon="tabler:phone" height={15} className="shrink-0 text-primary" />
                  {cliente.telefono ?? 'Sin teléfono'}
                </span>
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {cliente.tipo_conexion && (
                  <span className="flex items-center gap-1.5 rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-1 text-xs font-medium text-secondary">
                    <Icon icon="tabler:plug-connected" height={13} />
                    {cliente.tipo_conexion === 'fibra_optica' ? 'Fibra óptica' : 'Inalámbrico'}
                  </span>
                )}
                {cliente.plan && (
                  <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-lightprimary px-2.5 py-1 text-xs font-medium text-primary-text">
                    <Icon icon="tabler:gauge" height={13} />
                    {cliente.plan.nombre}
                  </span>
                )}
                {cliente.zona && (
                  <span className="flex items-center gap-1.5 rounded-full border border-ld bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Icon icon="tabler:map-pin" height={13} />
                    {cliente.zona.nombre}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Estado, antigüedad y acciones */}
          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Badge className={`${ESTADO_BADGE[cliente.estado]} rounded-full px-3 py-1`}>
                {ESTADO_LABEL[cliente.estado]}
              </Badge>
              {cliente.creado_en && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon icon="tabler:calendar" height={15} />
                  <span>
                    Cliente desde{' '}
                    <span className="font-semibold text-foreground">
                      {new Date(cliente.creado_en).toLocaleDateString('es-PE')}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Mismas acciones y condiciones de antes: no se cambió ninguna regla */}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="lightprimary" className="rounded-md" onClick={abrirEditar}>
                <Icon icon="tabler:pencil" height={16} className="mr-1" />
                Editar
              </Button>
              {cliente.estado === 'pendiente_aprobacion' && puedeAprobar && (
                <>
                  <Button variant="lightsuccess" onClick={handleAprobar} className="rounded-md">
                    Aprobar instalación
                  </Button>
                  <Button
                    variant="lighterror"
                    className="rounded-md"
                    onClick={() => setRechazarOpen(true)}
                  >
                    Rechazar
                  </Button>
                </>
              )}
              {cliente.estado === 'activo' && (
                <>
                  <Button variant="lighterror" className="rounded-md" onClick={handleCortar}>
                    <Icon icon="tabler:plug-off" height={16} className="mr-1" />
                    Cortar servicio
                  </Button>
                  <Button
                    variant="lightinfo"
                    className="rounded-md"
                    onClick={() => {
                      setMesesPausa('1');
                      setPausarOpen(true);
                    }}
                  >
                    <Icon icon="tabler:player-pause" height={16} className="mr-1" />
                    Pausar temporalmente
                  </Button>
                </>
              )}
              {(cliente.estado === 'suspendido' || cliente.estado === 'pausado') && (
                <Button variant="lightsuccess" className="rounded-md" onClick={handleReactivar}>
                  <Icon icon="tabler:player-play" height={16} className="mr-1" />
                  Reactivar
                </Button>
              )}
            </div>

            {cliente.estado === 'aprobado' && (
              <p className="max-w-xs text-xs text-muted-foreground lg:text-right">
                Esperando que el técnico complete la instalación desde la app móvil.
              </p>
            )}
            {cliente.estado === 'pausado' && cliente.pausa_hasta && (
              <p className="text-xs text-muted-foreground">Pausado hasta {cliente.pausa_hasta}</p>
            )}
          </div>
        </div>
      </CardBox>

      {/* ── Cuatro indicadores ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icono="tabler:world"
          etiqueta="Plan actual"
          valor={cliente.plan?.nombre ?? 'No disponible'}
          tono="primary"
          nota={
            cliente.plan
              ? `${cliente.plan.bajada_mbps} Mbps ↓ / ${cliente.plan.subida_mbps} Mbps ↑`
              : undefined
          }
        />
        <StatCard
          icono="tabler:cash"
          etiqueta="Cuota mensual"
          valor={cliente.monto_mensual != null ? soles(cliente.monto_mensual) : 'No disponible'}
          tono="success"
          nota={tieneDetalleCuota ? 'Incluye TV adicional' : undefined}
        />
        <StatCard
          icono="tabler:calendar-event"
          etiqueta="Próximo vencimiento"
          valor={cliente.fecha_vencimiento ?? 'No disponible'}
          tono="warning"
          nota={diasParaVencer}
        />
        <StatCard
          icono="tabler:shield-check"
          etiqueta="Estado de servicio"
          valor={ESTADO_LABEL[cliente.estado]}
          tono={cliente.estado === 'activo' ? 'success' : cliente.estado === 'suspendido' ? 'error' : 'info'}
          nota={cliente.compromiso_pago_hasta ? `Compromiso hasta ${cliente.compromiso_pago_hasta}` : undefined}
        />
      </div>

      {/* ── Pestañas: solo las que tienen datos reales ── */}
      <div className="-mb-2 flex gap-1 overflow-x-auto border-b border-ld">
        {PESTANAS.filter((p) => p.disponible).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id ? 'page' : undefined}
            className={`transition-ui flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium ${
              pestana === p.id
                ? 'border-brand bg-lightbrand text-brand-strong dark:text-brand'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon icon={p.icono} height={16} />
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        {/* ── Columna principal ── */}
        <div className="flex flex-col gap-5 xl:col-span-2">
          {pestana === 'resumen' && (
            <>
              <SectionCard titulo="Resumen del cliente" icono="tabler:user">
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Titular" value={cliente.nombre} />
                  <Field
                    label={cliente.tipo_documento === 'ruc' ? 'RUC' : 'DNI'}
                    value={cliente.tipo_documento === 'ruc' ? cliente.ruc : cliente.dni}
                  />
                  <Field label="Teléfono" value={cliente.telefono} />
                </div>
                <div className="mt-5 grid gap-5 border-t border-ld pt-5 sm:grid-cols-3">
                  <Field label="Dirección" value={cliente.direccion} />
                  <Field label="Zona" value={cliente.zona?.nombre} />
                  <Field
                    label="Coordenadas"
                    value={
                      cliente.lat != null && cliente.lng != null
                        ? `${cliente.lat}, ${cliente.lng}`
                        : 'No disponible'
                    }
                  />
                </div>
              </SectionCard>

              {/* Todo lo que ya existía y no aparece en la referencia se conserva aquí */}
              <SectionCard titulo="Información de cuenta" icono="tabler:id-badge-2">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Usuario PPPoE" value={cliente.usuario_pppoe} />
                  <Field label="TVs" value={cliente.cantidad_tv} />
                  {cliente.responsable_nombre && (
                    <Field label="Responsable" value={cliente.responsable_nombre} />
                  )}
                  {cliente.vendedor && (
                    <Field
                      label="Registrado por"
                      value={`${cliente.vendedor.nombre} (${ROL_LABEL[cliente.vendedor.rol]})`}
                    />
                  )}
                  {cliente.aprobado_por && (
                    <Field
                      label="Aprobado por"
                      value={`${cliente.aprobado_por.nombre} (${ROL_LABEL[cliente.aprobado_por.rol]})`}
                    />
                  )}
                  {cliente.tecnico_instalador && (
                    <Field
                      label="Instalado por"
                      value={`${cliente.tecnico_instalador.nombre} (${ROL_LABEL[cliente.tecnico_instalador.rol]})`}
                    />
                  )}
                  {cliente.fecha_instalacion && (
                    <Field label="Fecha de instalación" value={cliente.fecha_instalacion} />
                  )}
                  {cliente.metros_cable != null && (
                    <Field label="Metros de cable" value={`${cliente.metros_cable} m`} />
                  )}
                  {cliente.ip_estatica && <Field label="IP estática" value={cliente.ip_estatica} />}
                </div>
                {(cliente.notas || cliente.motivo_rechazo || cliente.motivo_no_instalado) && (
                  <div className="mt-5 grid gap-5 border-t border-ld pt-5">
                    {cliente.notas && <Field label="Notas" value={cliente.notas} />}
                    {cliente.motivo_rechazo && (
                      <Field label="Motivo de rechazo" value={cliente.motivo_rechazo} />
                    )}
                    {cliente.motivo_no_instalado && (
                      <Field label="Motivo no instalado" value={cliente.motivo_no_instalado} />
                    )}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {pestana === 'pagos' && (
            <>
              <SectionCard
                titulo={`Calendario de pagos ${anioCalendario}`}
                icono="tabler:calendar-stats"
                extra={
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Año anterior"
                      onClick={() => setAnioCalendario((a) => a - 1)}
                    >
                      <Icon icon="tabler:chevron-left" height={18} />
                    </Button>
                    <span className="w-12 text-center text-sm font-semibold">{anioCalendario}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Año siguiente"
                      onClick={() => setAnioCalendario((a) => a + 1)}
                    >
                      <Icon icon="tabler:chevron-right" height={18} />
                    </Button>
                  </div>
                }
              >
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {calendario.map((m, i) => (
                    <div
                      key={m.mes}
                      className={`rounded-xl border px-2 py-3 text-center ${MES_ESTADO_CLASS[m.estado] ?? ''}`}
                    >
                      <p className="text-sm font-bold">{MESES[i]}</p>
                      <p className="mt-0.5 text-[11px] font-medium">
                        {MES_ESTADO_LABEL[m.estado] ?? m.estado}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                titulo="Historial de pagos"
                icono="tabler:receipt-2"
                sinRelleno
                extra={
                  <>
                    {/* Todos los pagos de este cliente, para darle su estado
                        de cuenta sin tener que buscarlo en la lista general. */}
                    <BotonDescargarReporte
                      titulo={`Pagos de ${cliente.nombre}`}
                      onDescargar={(formato) =>
                        descargarReportePagos(formato, { cliente_id: Number(id) })
                      }
                    />
                    <Button
                      variant="lightprimary"
                      className="rounded-md"
                      onClick={abrirRegistrarPago}
                    >
                      <Icon icon="tabler:plus" height={16} className="mr-1" />
                      Registrar pago
                    </Button>
                  </>
                }
              >
                <div className="overflow-x-auto px-5 pb-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Mes</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Voucher</TableHead>
                        <TableHead className="text-right">Recibo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagos.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <EmptyState
                              icono="tabler:receipt-off"
                              titulo="Sin pagos registrados"
                              descripcion="Cuando registres un pago aparecerá en esta tabla."
                            />
                          </TableCell>
                        </TableRow>
                      )}
                      {pagos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.id}
                          </TableCell>
                          <TableCell>{p.mes_pagado}</TableCell>
                          <TableCell>{p.fecha_pago ?? '—'}</TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {soles(p.monto)}
                          </TableCell>
                          <TableCell className="capitalize">{p.metodo_pago ?? '—'}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${PAGO_ESTADO_BADGE[p.estado] ?? 'bg-muted text-muted-foreground'}`}
                            >
                              {PAGO_ESTADO_LABEL[p.estado] ?? p.estado}
                            </span>
                          </TableCell>
                          <TableCell>
                            {p.ruta_comprobante ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                disabled={cargandoComprobanteId === p.id}
                                onClick={() => handleVerComprobante(p)}
                              >
                                <Icon icon="tabler:eye" height={16} className="mr-1" />
                                {cargandoComprobanteId === p.id ? 'Abriendo…' : 'Ver'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Ver recibo"
                              onClick={() => setReciboAbierto(p.id)}
                            >
                              <Icon icon="tabler:printer" height={18} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            </>
          )}

          {pestana === 'equipos' && (
            <SectionCard titulo="Infraestructura y equipo" icono="tabler:router">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-xl border border-ld p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <Icon icon="tabler:box" height={15} className="text-primary" />
                    Caja NAP
                  </p>
                  <p className="mt-2 font-mono text-sm font-bold">
                    {cliente.borne?.caja_nap?.codigo ?? 'Sin asignar'}
                  </p>
                  {cliente.borne && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Borne {cliente.borne.numero}
                      {cliente.borne.codigo_precinto
                        ? ` · precinto ${cliente.borne.codigo_precinto}`
                        : ''}
                    </p>
                  )}
                  {cliente.borne?.potencia_optica_dbm != null && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Potencia óptica {cliente.borne.potencia_optica_dbm} dBm
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-ld p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    <Icon icon="tabler:router" height={15} className="text-primary" />
                    ONU asignada
                  </p>
                  <p className="mt-2 font-mono text-sm font-bold">
                    {onuAsignada?.numero_serie ?? 'Sin asignar'}
                  </p>
                  {onuAsignada?.marca && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{onuAsignada.marca}</p>
                  )}
                </div>
              </div>

              {(cliente.equipo_marca || cliente.equipo_serial) && (
                <div className="mt-5 grid gap-5 border-t border-ld pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Marca del equipo" value={cliente.equipo_marca} />
                  <Field label="Modelo" value={cliente.equipo_modelo} />
                  <Field label="Serie" value={cliente.equipo_serial} />
                  {cliente.equipo_fecha_entrega && (
                    <Field label="Entregado el" value={cliente.equipo_fecha_entrega} />
                  )}
                  {cliente.equipo_valor != null && (
                    <Field label="Valor" value={soles(cliente.equipo_valor)} />
                  )}
                  {cliente.estado_equipo && (
                    <Field label="Estado del equipo" value={cliente.estado_equipo} />
                  )}
                </div>
              )}
            </SectionCard>
          )}

          {pestana === 'documentos' && (
            <SectionCard titulo="Fotos y evidencias" icono="tabler:photo">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {fotos.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFotoAbierta(f)}
                    className="transition-ui group overflow-hidden rounded-xl border border-ld"
                  >
                    <img
                      src={f.blobUrl}
                      alt={f.tipo ?? 'Evidencia'}
                      className="h-28 w-full object-cover transition-transform duration-[220ms] group-hover:scale-105"
                    />
                    <span className="block truncate px-2 py-1.5 text-[11px] capitalize text-muted-foreground">
                      {f.tipo ?? 'Evidencia'}
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {pestana === 'historial' && (
            <SectionCard titulo="Historial de eventos" icono="tabler:history">
              {historial.length === 0 ? (
                <EmptyState
                  icono="tabler:history-off"
                  titulo="Sin eventos registrados"
                  descripcion="Las activaciones, cortes y reactivaciones aparecerán aquí."
                />
              ) : (
                <ol className="relative ms-2 border-s border-ld">
                  {historial.map((h) => (
                    <li key={h.id} className="relative ms-5 pb-5 last:pb-0">
                      <span
                        className="absolute -start-[25px] top-1 size-3 rounded-full border-2 border-card"
                        style={{ backgroundColor: colorEvento(h.tipo) }}
                        aria-hidden="true"
                      />
                      <p className="text-sm">{h.descripcion}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(h.creado_en).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          )}
        </div>

        {/* ── Columna derecha ── */}
        <div className="flex flex-col gap-5">
          {cliente.plan && (
            <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-md" style={{ background: 'linear-gradient(145deg, #152238, #0b1422)' }}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full"
                style={{ background: 'var(--brand)', filter: 'blur(70px)', opacity: 0.35 }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/80">
                  <Icon icon="tabler:wifi" height={16} className="text-brand" />
                  Plan contratado
                </p>
                <Badge className={`${ESTADO_BADGE[cliente.estado]} rounded-full px-2.5`}>
                  {ESTADO_LABEL[cliente.estado]}
                </Badge>
              </div>

              {/* Color explícito: globals.css aplica `h1..h6 { color: var(--foreground) }`
                  a todo el panel, y en tema claro pintaría este título de azul
                  oscuro sobre una tarjeta oscura. */}
              <h3 className="relative mt-3 text-2xl font-bold !text-white">{cliente.plan.nombre}</h3>
              <p className="relative mt-1 text-sm text-white/70">
                {cliente.tipo_conexion === 'fibra_optica' ? 'Fibra óptica' : 'Inalámbrico'}
                {cliente.plan.incluye_tv ? ' · Incluye TV' : ''}
              </p>

              <p className="relative mt-4 text-3xl font-extrabold">
                {cliente.monto_mensual != null ? soles(cliente.monto_mensual) : '—'}
                <span className="ms-1 text-sm font-medium text-white/70">/ mes</span>
              </p>

              {tieneDetalleCuota && (
                <ul className="relative mt-2 space-y-0.5">
                  {cliente.monto_mensual_detalle!.map((d, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-white/70">
                      <Icon icon="tabler:circle-check" height={13} className="shrink-0 text-brand" />
                      {d.concepto} · {soles(d.monto)}
                    </li>
                  ))}
                </ul>
              )}

              <div className="relative mt-4 flex gap-6 border-t border-white/15 pt-4">
                <div className="flex items-center gap-2">
                  <Icon icon="tabler:arrow-down" height={20} className="text-brand" />
                  <div>
                    <p className="text-base font-bold leading-none">
                      {cliente.plan.bajada_mbps} Mbps
                    </p>
                    <p className="text-[11px] text-white/60">Descarga</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Icon icon="tabler:arrow-up" height={20} className="text-brand" />
                  <div>
                    <p className="text-base font-bold leading-none">
                      {cliente.plan.subida_mbps} Mbps
                    </p>
                    <p className="text-[11px] text-white/60">Subida</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Equipo instalado: solo con datos reales */}
          {(onuAsignada || cliente.borne) && (
            <SectionCard titulo="Equipo instalado" icono="tabler:device-desktop">
              <div className="space-y-2.5 text-sm">
                {onuAsignada ? (
                  <>
                    <p className="font-semibold">
                      {onuAsignada.marca ? `ONU ${onuAsignada.marca}` : 'ONU asignada'}
                    </p>
                    <Field label="Número de serie" value={onuAsignada.numero_serie} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin ONU asignada</p>
                )}
                {cliente.borne?.caja_nap && (
                  <Field
                    label="Caja NAP"
                    value={`${cliente.borne.caja_nap.codigo} · borne ${cliente.borne.numero}`}
                  />
                )}
                {cliente.fecha_instalacion && (
                  <Field label="Instalado" value={cliente.fecha_instalacion} />
                )}
              </div>
            </SectionCard>
          )}

          {/* Vencimiento y compromiso: datos que ya existían */}
          <SectionCard titulo="Vencimiento" icono="tabler:calendar-event">
            <p className="text-lg font-bold">{cliente.fecha_vencimiento ?? 'No disponible'}</p>
            {diasParaVencer && (
              <p className="mt-1 text-sm text-muted-foreground">{diasParaVencer}</p>
            )}
            {cliente.compromiso_pago_hasta && (
              <p className="mt-2 rounded-lg bg-lightwarning px-3 py-2 text-xs text-warning-text">
                Compromiso de pago hasta {cliente.compromiso_pago_hasta}
              </p>
            )}
            {cliente.pausa_hasta && (
              <p className="mt-2 rounded-lg bg-lightinfo px-3 py-2 text-xs text-info-text">
                En pausa hasta {cliente.pausa_hasta}
              </p>
            )}
          </SectionCard>

          {/* Últimos eventos, como en la referencia */}
          {historial.length > 0 && (
            <SectionCard
              titulo="Últimos eventos"
              icono="tabler:clock"
              extra={
                <button
                  type="button"
                  onClick={() => setPestana('historial')}
                  className="transition-ui text-sm font-medium text-primary hover:underline"
                >
                  Ver todos
                </button>
              }
            >
              <ol className="relative ms-1 border-s border-ld">
                {historial.slice(0, 4).map((h) => (
                  <li key={h.id} className="relative ms-4 pb-4 last:pb-0">
                    <span
                      className="absolute -start-[21px] top-1 size-2.5 rounded-full border-2 border-card"
                      style={{ backgroundColor: colorEvento(h.tipo) }}
                      aria-hidden="true"
                    />
                    <p className="text-sm leading-snug">{h.descripcion}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(h.creado_en).toLocaleString('es-PE', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>
      </div>

      <FormDialog
        open={rechazarOpen}
        onOpenChange={setRechazarOpen}
        title="Rechazar instalación"
        subtitle={cliente.nombre}
        icon="tabler:circle-x"
        tone="error"
        size="md"
        footer={
          <FormActions
            onCancel={() => setRechazarOpen(false)}
            submitLabel="Rechazar"
            submitIcon="tabler:circle-x"
            submitVariant="destructive"
            onSubmit={handleRechazar}
            disabled={!motivo.trim()}
          />
        }
      >
        <FormField label="Motivo del rechazo" icon="tabler:message-2" htmlFor="motivoRechazo" required>
          <Textarea
            id="motivoRechazo"
            placeholder="Motivo del rechazo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </FormField>
      </FormDialog>

      {/* Editar cliente */}
      <FormDialog
        open={editarOpen}
        onOpenChange={setEditarOpen}
        title="Editar cliente"
        subtitle={cliente.nombre}
        icon="tabler:edit"
        tone="primary"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setEditarOpen(false)}
            submitLabel="Guardar cambios"
            onSubmit={handleGuardarEdicion}
            submitting={guardandoEdicion}
          />
        }
      >
        <FormGrid>
          <FormSection title="Datos del titular" icon="tabler:user">
            <FormField label="Nombre" htmlFor="editNombre" wide>
              <FieldIcon icon="tabler:user">
                <Input
                  id="editNombre"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormSection>

          <FormSection title="Información de contacto" icon="tabler:address-book">
            <FormField label="Teléfono" htmlFor="editTelefono">
              <FieldIcon icon="tabler:phone">
                <Input
                  id="editTelefono"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="WhatsApp" htmlFor="editWhatsapp">
              <FieldIcon icon="tabler:brand-whatsapp">
                <Input
                  id="editWhatsapp"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="Igual al teléfono si lo dejas vacío"
                />
              </FieldIcon>
            </FormField>
            <FormField label="Dirección" htmlFor="editDireccion" wide>
              <FieldIcon icon="tabler:map-2">
                <Input
                  id="editDireccion"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormSection>

          <FormSection title="Datos del servicio" icon="tabler:router">
            <FormField label="Zona">
              <FieldIcon icon="tabler:map-pin">
                <Select value={editZonaId} onValueChange={setEditZonaId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {zonas.map((z) => (
                      <SelectItem key={z.id} value={String(z.id)}>
                        {z.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>
            <FormField label="Plan">
              <FieldIcon icon="tabler:stack-2">
                <Select value={editPlanId} onValueChange={setEditPlanId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {planes.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nombre} — S/ {p.precio.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>
            <FormField label="Cantidad de TVs" htmlFor="editCantidadTv">
              <Input
                id="editCantidadTv"
                type="number"
                min={0}
                value={editCantidadTv}
                onChange={(e) => setEditCantidadTv(e.target.value)}
              />
            </FormField>
            <FormField label="Tipo de conexión">
              <FieldIcon icon="tabler:router">
                <Select
                  value={editTipoConexion}
                  onValueChange={(v) => setEditTipoConexion(v as 'fibra_optica' | 'inalambrico')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                    <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>
            <FormField label="Notas" htmlFor="editNotas" wide>
              <Textarea
                id="editNotas"
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                rows={3}
              />
            </FormField>
          </FormSection>

          {editError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{editError}</FormCallout>
            </div>
          )}
        </FormGrid>
      </FormDialog>

      {/* Pausa temporal */}
      <FormDialog
        open={pausarOpen}
        onOpenChange={setPausarOpen}
        title="Pausar servicio temporalmente"
        subtitle={cliente.nombre}
        icon="tabler:player-pause"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setPausarOpen(false)}
            submitLabel="Confirmar pausa"
            submitIcon="tabler:player-pause"
            onSubmit={handlePausar}
          />
        }
      >
        <FormField label="¿Por cuántos meses?" icon="tabler:calendar" htmlFor="mesesPausaDetalle">
          <Input
            id="mesesPausaDetalle"
            type="number"
            min={1}
            value={mesesPausa}
            onChange={(e) => setMesesPausa(e.target.value)}
          />
        </FormField>
      </FormDialog>

      {/* Registrar pago */}
      <FormDialog
        open={pagoDialogOpen}
        onOpenChange={setPagoDialogOpen}
        title="Registrar pago"
        subtitle={cliente.nombre}
        icon="tabler:receipt-2"
        tone="success"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setPagoDialogOpen(false)}
            submitLabel="Registrar pago"
            submitIcon="tabler:receipt-2"
            onSubmit={handleRegistrarPago}
            submitting={guardandoPago}
          />
        }
      >
        <FormGrid>
          <FormSection title="Meses a pagar" icon="tabler:calendar-dollar">
            <FormField
              label="Mes que paga"
              htmlFor="pagoMes"
              wide
              hint="Desde este mes se arma el cobro."
            >
              <Input
                id="pagoMes"
                type="month"
                value={pagoMes}
                onChange={(e) => setPagoMes(e.target.value)}
              />
            </FormField>

            <FormField
              label={pagoMesesNum === 1 ? 'Mes en el cobro' : `Meses en el cobro (${pagoMesesNum})`}
              icon="tabler:shopping-cart"
              wide
            >
              <CarritoMeses
                mesInicio={pagoMes}
                meses={pagoMesesNum}
                onChange={cambiarPagoMeses}
                cuota={pagoCuota}
              />
            </FormField>
          </FormSection>

          <FormSection title="Importe" icon="tabler:cash">
            <FormField
              label="Subtotal (S/)"
              htmlFor="pagoSubtotal"
              hint={pagoMesesNum > 1 ? `${pagoMesesNum} × S/ ${pagoCuota.toFixed(2)}` : undefined}
            >
              <Input
                id="pagoSubtotal"
                type="number"
                step="0.01"
                min={0}
                value={pagoSubtotal}
                onChange={(e) => setPagoSubtotal(e.target.value)}
              />
            </FormField>

            <FormField
              label="Descuento (S/)"
              htmlFor="pagoDescuento"
              hint="Déjalo en 0 si no le haces rebaja."
            >
              <Input
                id="pagoDescuento"
                type="number"
                step="0.01"
                min={0}
                value={pagoDescuento}
                onChange={(e) => setPagoDescuento(e.target.value)}
              />
            </FormField>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ld bg-card px-4 py-3 md:col-span-2">
              <span className="text-sm font-medium">Total a pagar</span>
              <span
                className={`text-xl font-bold tabular-nums ${pagoTotal > 0 ? 'text-success-text' : 'text-error-text'}`}
              >
                S/ {pagoTotal.toFixed(2)}
              </span>
            </div>
          </FormSection>

          <FormSection title="Forma de pago" icon="tabler:credit-card">
            <FormField label="Fecha de pago" htmlFor="pagoFecha">
              <Input
                id="pagoFecha"
                type="date"
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </FormField>
            <FormField label="Método de pago">
              <FieldIcon icon="tabler:credit-card">
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
              </FieldIcon>
            </FormField>
            <FormField
              label="Número de operación"
              htmlFor="pagoNumeroOperacion"
              wide
              hint={
                pagoMetodo !== 'efectivo' && !pagoNumeroOperacion
                  ? 'Recomendado para Yape/Plin/transferencia/depósito — evita registrar el mismo comprobante dos veces.'
                  : undefined
              }
            >
              <FieldIcon icon="tabler:hash">
                <Input
                  id="pagoNumeroOperacion"
                  value={pagoNumeroOperacion}
                  onChange={(e) => setPagoNumeroOperacion(e.target.value.toUpperCase())}
                />
              </FieldIcon>
            </FormField>
          </FormSection>

          {pagoError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{pagoError}</FormCallout>
            </div>
          )}
        </FormGrid>
      </FormDialog>

      {/* Visor de foto en grande */}
      <FormDialog
        open={!!fotoAbierta}
        onOpenChange={(o) => !o && setFotoAbierta(null)}
        title={fotoAbierta?.descripcion ?? 'Foto'}
        subtitle={
          fotoAbierta ? new Date(fotoAbierta.creado_en).toLocaleString('es-PE') : undefined
        }
        icon="tabler:photo"
        tone="primary"
        size="xl"
      >
        {fotoAbierta && (
          <img
            src={fotoAbierta.blobUrl}
            alt={fotoAbierta.descripcion ?? 'Foto del cliente'}
            className="w-full rounded-xl"
          />
        )}
      </FormDialog>

      <FormDialog
        open={!!comprobanteAbierto}
        onOpenChange={(o) => {
          if (!o) {
            if (comprobanteAbierto) URL.revokeObjectURL(comprobanteAbierto.url);
            setComprobanteAbierto(null);
          }
        }}
        title={`Voucher — ${comprobanteAbierto?.pago.mes_pagado ?? ''}`}
        subtitle="Comprobante cargado por el cliente"
        icon="tabler:receipt"
        tone="success"
        size="md"
      >
        {comprobanteAbierto && (
          <img
            src={comprobanteAbierto.url}
            alt="Comprobante de pago"
            className="max-h-[60vh] w-full rounded-xl object-contain"
          />
        )}
      </FormDialog>

      <ReciboDialog pagoId={reciboAbierto} onOpenChange={(o) => !o && setReciboAbierto(null)} />
    </div>
  );
};

export default ClienteDetail;
