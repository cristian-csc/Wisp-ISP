import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import StatCard from 'src/components/shared/StatCard';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import BotonDescargarReporte from 'src/components/shared/BotonDescargarReporte';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeAccion } from 'src/lib/permisos';
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
import ClienteSearchInput from 'src/components/apps/pagos/ClienteSearchInput';
import CarritoMeses from 'src/components/apps/pagos/CarritoMeses';
import ReciboDialog from 'src/components/apps/pagos/ReciboDialog';
import {
  listPagos,
  createPago,
  instalacionSugerida,
  deletePago,
  subirComprobantePago,
  getComprobanteBlobUrl,
  getResumenMensual,
  getClientesSinPago,
  type ClienteMoroso,
  getClientesCortados,
  getPausasPorVencer,
  getCompromisosVigentes,
  type ClienteConCompromiso,
  descargarReportePagos,
  type Pago,
  type EstadoPago,
  type ClienteCortado,
} from 'src/lib/pagos';
import {
  reactivarCliente,
  darCompromisoPago,
  quitarCompromisoPago,
  type ClienteListItem,
} from 'src/lib/clientes';

const MESES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

function tiempoDesde(iso: string | null): string {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
  const anios = Math.floor(meses / 12);
  return anios === 1 ? 'hace 1 año' : `hace ${anios} años`;
}

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagado: 'Al día',
  pendiente: 'Pendiente',
  vencido: 'Atrasado',
  corte_temporal: 'Corte temporal',
};

const ESTADO_BADGE: Record<EstadoPago, string> = {
  pagado: 'bg-lightsuccess text-success-text',
  pendiente: 'bg-lightwarning text-warning-text',
  vencido: 'bg-lighterror text-error-text',
  corte_temporal: 'bg-muted text-muted-foreground',
};

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'otro', label: 'Otro' },
];

const hoy = new Date().toISOString().split('T')[0];
const mesActual = hoy.slice(0, 7);

/** El mes que el cliente realmente debe según su propio ciclo (fecha de
 * vencimiento), no el mes calendario — así un pago de gracia hecho el 1 de
 * octubre para un cliente que vence el 29 de septiembre se sugiere como
 * "2026-09" automáticamente, en vez de "2026-10" por defecto. */
function mesQueDebe(c: ClienteListItem | null): string {
  return c?.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 7) : mesActual;
}

function labelAtraso(dias: number): string {
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return '1 día de atraso';
  return `${dias} días de atraso`;
}

type CategoriaControl = 'atrasado' | 'cortado' | 'pausado' | 'con_compromiso';

type ClienteControl = ClienteListItem & {
  categoria: CategoriaControl;
  dias_atraso?: number;
  cortado_en?: string | null;
  dias_restantes?: number;
};

const CATEGORIA_FILTRO_LABEL: Record<'todos' | CategoriaControl, string> = {
  todos: 'Todos los que requieren atención',
  atrasado: 'Atrasados',
  cortado: 'Cortados',
  pausado: 'Pausados',
  con_compromiso: 'Con compromiso de pago',
};

const Pagos = () => {
  const { user } = useCurrentUser();
  /** Atención al cliente cobra, pero no corrige el histórico:
   *  borrar un pago queda para administración. */
  const puedeBorrarPago = puedeAccion('pagos.borrar', user?.rol);
  const navigate = useNavigate();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const anioActual = new Date().getFullYear();
  const [mesSel, setMesSel] = useState('todos');
  const [anioSel, setAnioSel] = useState(String(anioActual));
  const mesFiltro = mesSel === 'todos' ? '' : `${anioSel}-${mesSel}`;
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [search, setSearch] = useState('');

  const [sinPago, setSinPago] = useState<ClienteMoroso[]>([]);
  const [cortados, setCortados] = useState<ClienteCortado[]>([]);
  const [pausas, setPausas] = useState<ClienteListItem[]>([]);
  const [compromisos, setCompromisos] = useState<ClienteConCompromiso[]>([]);
  const [quitandoCompromiso, setQuitandoCompromiso] = useState<ClienteListItem | null>(null);
  const [controlFiltro, setControlFiltro] = useState<'todos' | CategoriaControl>('todos');
  const [compromisoCliente, setCompromisoCliente] = useState<ClienteListItem | null>(null);
  const [compromisoFecha, setCompromisoFecha] = useState('');
  const [compromisoError, setCompromisoError] = useState<string | null>(null);
  const [guardandoCompromiso, setGuardandoCompromiso] = useState(false);
  const [ingresosMes, setIngresosMes] = useState(0);
  const [gastosMes, setGastosMes] = useState(0);

  const [open, setOpen] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteListItem | null>(null);
  const [subtotal, setSubtotal] = useState('');
  // Rebaja que decide quien cobra; el total a pagar sale de restarla
  const [descuento, setDescuento] = useState('0');
  // Costo de instalación: solo aparece en el primer pago de un cliente de una
  // zona que lo cobra. Precargado por el servidor y editable (0 lo quita).
  const [cargoInstalacion, setCargoInstalacion] = useState('');
  const [aplicaInstalacion, setAplicaInstalacion] = useState(false);
  const [mesPagado, setMesPagado] = useState(mesActual);
  const [fechaPago, setFechaPago] = useState(hoy);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  // Meses que paga de una vez. Con más de uno, el monto pasa a ser el total
  // cobrado y el backend lo reparte entre los meses cubiertos.
  const [mesesPago, setMesesPago] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [borrando, setBorrando] = useState<Pago | null>(null);
  const [comprobanteAbierto, setComprobanteAbierto] = useState<{ pago: Pago; url: string } | null>(null);
  const [reciboAbierto, setReciboAbierto] = useState<number | null>(null);
  const [cargandoComprobanteId, setCargandoComprobanteId] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await listPagos({
        page,
        mes: mesFiltro || undefined,
        estado: estadoFiltro === 'todos' ? undefined : (estadoFiltro as EstadoPago),
        search: search || undefined,
      });
      setPagos(data.items);
      setPages(data.pages);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function reloadResumen() {
    const [resumen, morosos, cortadosData, pausasData, compromisosData] = await Promise.all([
      // Las cifras globales son de gerencia: sin ese permiso el resto carga igual.
      getResumenMensual().catch(() => []),
      getClientesSinPago(),
      getClientesCortados(),
      getPausasPorVencer(),
      getCompromisosVigentes(),
    ]);
    const actual = resumen.find((r) => r.mes === mesActual);
    setIngresosMes(actual?.ingresos ?? 0);
    setGastosMes(actual?.gastos ?? 0);
    setSinPago(morosos);
    setCortados(cortadosData);
    setPausas(pausasData);
    setCompromisos(compromisosData);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, mesSel, anioSel, estadoFiltro]);

  useEffect(() => {
    reloadResumen();
  }, []);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesSel, anioSel, estadoFiltro]);

  /** Pregunta al servidor si a este cliente le toca cobro de instalación y lo
   *  precarga (editable). Solo informa; no cobra nada. */
  async function cargarInstalacion(c: ClienteListItem | null) {
    if (!c) {
      setAplicaInstalacion(false);
      setCargoInstalacion('');
      return;
    }
    try {
      const s = await instalacionSugerida(c.id);
      setAplicaInstalacion(s.aplica);
      setCargoInstalacion(s.aplica ? String(s.costo) : '');
    } catch {
      setAplicaInstalacion(false);
      setCargoInstalacion('');
    }
  }

  function abrirRegistrarPago(clientePreseleccionado?: ClienteListItem) {
    setClienteSel(clientePreseleccionado ?? null);
    cargarInstalacion(clientePreseleccionado ?? null);
    setSubtotal(
      clientePreseleccionado?.monto_mensual != null
        ? clientePreseleccionado.monto_mensual.toFixed(2)
        : '',
    );
    setDescuento('0');
    setMesPagado(mesQueDebe(clientePreseleccionado ?? null));
    setFechaPago(hoy);
    setMetodoPago('efectivo');
    setNumeroOperacion('');
    setComprobanteFile(null);
    setMesesPago('1');
    setError(null);
    setOpen(true);
  }

  /** Subtotal = lo que suman los meses del carrito. El descuento lo decide
   *  quien cobra y el total a pagar es la resta: así queda constancia de los
   *  tres números, como en una boleta. */
  const cuotaCliente = clienteSel?.monto_mensual ?? 0;
  const mesesNum = Number(mesesPago) || 1;
  const subtotalNum = Number(subtotal) || 0;
  const descuentoNum = Number(descuento) || 0;
  const totalAPagar = subtotalNum - descuentoNum;
  // El costo de instalación va aparte de la mensualidad: no entra en el
  // descuento ni en el `monto`, se suma al total que entra a caja.
  const cargoInstalacionNum = aplicaInstalacion ? Number(cargoInstalacion) || 0 : 0;
  const totalACobrar = totalAPagar + cargoInstalacionNum;

  /** Al agregar o quitar un mes, el subtotal se recalcula con la cuota. */
  function cambiarMeses(cantidad: number) {
    setMesesPago(String(cantidad));
    if (cuotaCliente) setSubtotal((cuotaCliente * cantidad).toFixed(2));
  }

  async function handleSubmit() {
    setError(null);
    if (!clienteSel) {
      setError('Selecciona un cliente.');
      return;
    }
    if (totalAPagar <= 0) {
      setError('El descuento no puede ser igual ni mayor que el subtotal.');
      return;
    }
    setGuardando(true);
    try {
      const pago = await createPago({
        cliente_id: clienteSel.id,
        monto: Number(totalAPagar.toFixed(2)),
        mes_pagado: mesPagado,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        numero_operacion: numeroOperacion || undefined,
        meses: mesesNum,
        descuento: descuentoNum,
        // Solo cuando la zona cobra instalación y es el primer pago. Se manda
        // explícito (incluido 0 si quien cobra lo quitó) para que lo guardado
        // coincida con lo que vio en pantalla.
        cargo_instalacion: aplicaInstalacion ? cargoInstalacionNum : undefined,
      });
      if (comprobanteFile) {
        try {
          await subirComprobantePago(pago.id, comprobanteFile);
        } catch {
          // El pago ya se registró — el comprobante se puede adjuntar después.
        }
      }
      setOpen(false);
      reload();
      reloadResumen();
      toast.success('Pago registrado');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  }

  async function handleReactivar(c: ClienteListItem) {
    try {
      await reactivarCliente(c.id);
      reloadResumen();
      toast.success(`${c.nombre} reactivado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo reactivar al cliente');
    }
  }

  /** Quien atiende se equivoca de cliente —son dos nombres parecidos en
   *  una lista larga— y hasta ahora el plazo quedaba puesto hasta que
   *  vencía solo. Esto lo deshace, y queda escrito quién lo deshizo. */
  async function handleQuitarCompromiso() {
    if (!quitandoCompromiso) return;
    const quien = quitandoCompromiso;
    setQuitandoCompromiso(null);
    try {
      await quitarCompromisoPago(quien.id);
      reloadResumen();
      toast.success(`Se quitó el compromiso de ${quien.nombre}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo quitar el compromiso');
    }
  }

  function abrirCompromiso(c: ClienteListItem) {
    setCompromisoCliente(c);
    const sugerida = new Date();
    sugerida.setDate(sugerida.getDate() + 7);
    setCompromisoFecha(sugerida.toISOString().split('T')[0]);
    setCompromisoError(null);
  }

  async function handleDarCompromiso() {
    if (!compromisoCliente) return;
    setGuardandoCompromiso(true);
    setCompromisoError(null);
    try {
      await darCompromisoPago(compromisoCliente.id, compromisoFecha);
      setCompromisoCliente(null);
      reloadResumen();
      toast.success('Compromiso de pago registrado');
    } catch (err: any) {
      setCompromisoError(err?.response?.data?.detail ?? 'No se pudo registrar el compromiso de pago');
    } finally {
      setGuardandoCompromiso(false);
    }
  }

  async function handleEliminar() {
    if (!borrando) return;
    try {
      await deletePago(borrando.id);
      reload();
      reloadResumen();
      toast.success('Pago eliminado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar el pago');
    }
  }

  async function handleVerComprobante(p: Pago) {
    setCargandoComprobanteId(p.id);
    try {
      const url = await getComprobanteBlobUrl(p.id);
      setComprobanteAbierto({ pago: p, url });
    } catch {
      toast.error('No se pudo cargar el comprobante.');
    } finally {
      setCargandoComprobanteId(null);
    }
  }

  // Orden alfabético fijo (no por categoría) — así una fila no "salta" de
  // posición al cortar/reactivar, solo cambia su propio badge y botón.
  // Quien tiene un compromiso vigente aparece SOLO en esa categoría,
  // aunque también esté atrasado: su situación de hoy es que se le dio
  // plazo. Dos filas del mismo cliente diciendo cosas distintas es como se
  // le cobra dos veces a alguien.
  const conPlazo = new Set(compromisos.map((c) => c.id));
  const controlClientes: ClienteControl[] = [
    ...compromisos.map((c) => ({ ...c, categoria: 'con_compromiso' as const })),
    ...sinPago.filter((c) => !conPlazo.has(c.id)).map((c) => ({ ...c, categoria: 'atrasado' as const })),
    ...cortados.filter((c) => !conPlazo.has(c.id)).map((c) => ({ ...c, categoria: 'cortado' as const })),
    ...pausas.filter((c) => !conPlazo.has(c.id)).map((c) => ({ ...c, categoria: 'pausado' as const })),
  ].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const controlFiltrados = controlFiltro === 'todos'
    ? controlClientes
    : controlClientes.filter((c) => c.categoria === controlFiltro);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl">Pagos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Baja el historial completo, no solo la página que se ve, y
              respetando los filtros que estén puestos en la tabla. */}
          <BotonDescargarReporte
            etiqueta="Descargar reporte"
            titulo="Historial de pagos, con los filtros puestos"
            onDescargar={(formato) =>
              descargarReportePagos(formato, {
                mes: mesFiltro || undefined,
                estado: estadoFiltro === 'todos' ? undefined : (estadoFiltro as EstadoPago),
                search: search || undefined,
              })
            }
          />
          <Button onClick={() => abrirRegistrarPago()}>Registrar pago</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icono="tabler:cash"
          etiqueta="Recaudado este mes"
          valor={`S/ ${ingresosMes.toFixed(2)}`}
          tono="success"
        />
        <StatCard
          icono="tabler:alert-triangle"
          etiqueta="Clientes sin pagar"
          valor={sinPago.length}
          tono="warning"
        />
        <StatCard
          icono="tabler:receipt-2"
          etiqueta="Gastos este mes"
          valor={`S/ ${gastosMes.toFixed(2)}`}
          tono="error"
        />
      </div>

      {controlClientes.length > 0 && (
        <CardBox>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="text-sm font-semibold">Control de clientes</h3>
            <Select value={controlFiltro} onValueChange={(v) => setControlFiltro(v as typeof controlFiltro)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORIA_FILTRO_LABEL) as Array<'todos' | CategoriaControl>).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CATEGORIA_FILTRO_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cuota</TableHead>
                  <TableHead>Situación</TableHead>
                  <TableHead className="text-end">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controlFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      Nadie en esta categoría.
                    </TableCell>
                  </TableRow>
                )}
                {controlFiltrados.map((c) => (
                  <TableRow key={`${c.categoria}-${c.id}`}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => navigate(`/clientes/${c.id}`)}
                      >
                        {c.nombre}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{c.zona?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.plan?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.monto_mensual != null ? `S/ ${c.monto_mensual.toFixed(2)}` : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {c.categoria === 'atrasado' && (
                          <Badge className={`${(c.dias_atraso ?? 0) >= 5 ? 'bg-lighterror text-error-text' : 'bg-lightwarning text-warning-text'} rounded-md`}>
                            {labelAtraso(c.dias_atraso ?? 0)}
                          </Badge>
                        )}
                        {c.categoria === 'cortado' && (
                          <Badge className="bg-lighterror text-error-text rounded-md">
                            Cortado {tiempoDesde(c.cortado_en ?? null)}
                          </Badge>
                        )}
                        {c.categoria === 'pausado' && (
                          <Badge className="bg-lightinfo text-info-text rounded-md">
                            Pausado hasta {c.pausa_hasta ?? '—'}
                          </Badge>
                        )}
                        {c.compromiso_pago_hasta && (
                          <Badge className="bg-lightprimary text-primary-text rounded-md">
                            <Icon icon="tabler:handshake" height={12} className="mr-1" />
                            Compromiso hasta {c.compromiso_pago_hasta}
                            {c.dias_restantes != null && (
                              <span className="ml-1 font-normal">
                                ({c.dias_restantes === 0
                                  ? 'vence hoy'
                                  : c.dias_restantes === 1
                                    ? 'queda 1 día'
                                    : `quedan ${c.dias_restantes} días`})
                              </span>
                            )}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        {c.categoria === 'atrasado' && (
                          <>
                            <Button size="sm" onClick={() => abrirRegistrarPago(c)}>
                              Registrar pago
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => abrirCompromiso(c)}>
                              <Icon icon="tabler:handshake" height={14} className="mr-1" />
                              Compromiso
                            </Button>
                          </>
                        )}
                        {c.categoria === 'cortado' && (
                          <>
                            <Button size="sm" onClick={() => abrirRegistrarPago(c)}>
                              Registrar pago
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => abrirCompromiso(c)}>
                              <Icon icon="tabler:handshake" height={14} className="mr-1" />
                              Compromiso
                            </Button>
                          </>
                        )}
                        {c.categoria === 'pausado' && (
                          <Button size="sm" variant="outlinesuccess" onClick={() => handleReactivar(c)}>
                            <Icon icon="tabler:player-play" height={14} className="mr-1" />
                            Reactivar
                          </Button>
                        )}
                        {c.categoria === 'con_compromiso' && (
                          <>
                            <Button size="sm" onClick={() => abrirRegistrarPago(c)}>
                              Registrar pago
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirCompromiso(c)}
                              title="Correr la fecha del compromiso"
                            >
                              <Icon icon="tabler:calendar-plus" height={14} className="mr-1" />
                              Cambiar fecha
                            </Button>
                            <Button
                              size="sm"
                              variant="lighterror"
                              onClick={() => setQuitandoCompromiso(c)}
                              title="Lo puse por error: deshacerlo"
                            >
                              <Icon icon="tabler:eraser" height={14} className="mr-1" />
                              Quitar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBox>
      )}

      <CardBox>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-sm font-semibold">Historial de pagos</h3>
          <div className="flex gap-3 flex-wrap">
            <Select value={mesSel} onValueChange={setMesSel}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los meses</SelectItem>
                {MESES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mesSel !== 'todos' && (
              <Select value={anioSel} onValueChange={setAnioSel}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[anioActual - 2, anioActual - 1, anioActual, anioActual + 1].map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {Object.entries(ESTADO_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Icon
                icon="tabler:search"
                height={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9 w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setPage(1); reload(); }
                }}
                placeholder="Buscar cliente o DNI y pulsa Enter"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Mes</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Voucher del cliente</TableHead>
                <TableHead className="text-end">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && pagos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay pagos registrados.
                  </TableCell>
                </TableRow>
              )}
              {pagos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => navigate(`/clientes/${p.cliente_id}`)}
                    >
                      {p.cliente?.nombre ?? `#${p.cliente_id}`}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{p.mes_pagado}</TableCell>
                  <TableCell className="text-sm">S/ {p.monto.toFixed(2)}</TableCell>
                  <TableCell className="text-sm capitalize">{p.metodo_pago}</TableCell>
                  <TableCell>
                    <Badge className={`${ESTADO_BADGE[p.estado]} rounded-md`}>{ESTADO_LABEL[p.estado]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.fecha_pago}</TableCell>
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
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Imprimir recibo"
                        onClick={() => setReciboAbierto(p.id)}
                      >
                        <Icon icon="tabler:printer" height={18} />
                      </Button>
                      {puedeBorrarPago && (
                        <Button variant="ghost" size="icon" title="Eliminar pago" onClick={() => setBorrando(p)}>
                          <Icon icon="tabler:trash" height={18} className="text-error" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">
              {total} pagos — página {page} de {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </CardBox>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar pago"
        subtitle="Cobro de un cliente, con su comprobante"
        icon="tabler:receipt-2"
        tone="success"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Guardar"
            onSubmit={handleSubmit}
            submitting={guardando}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <FormField label="Cliente" icon="tabler:user" required>
            <ClienteSearchInput
              value={clienteSel}
              onChange={(c) => {
                setClienteSel(c);
                setSubtotal(c?.monto_mensual != null ? c.monto_mensual.toFixed(2) : '');
                setDescuento('0');
                setMesPagado(mesQueDebe(c));
                setMesesPago('1');
                cargarInstalacion(c);
              }}
              placeholder="Buscar por nombre, DNI o usuario…"
            />
          </FormField>

          <FormGrid>
            <FormSection title="Meses a pagar" icon="tabler:calendar-dollar">
              <FormField
                label="Mes que paga"
                htmlFor="mesPago"
                required
                wide
                hint="Desde este mes se arma el cobro."
              >
                <Input
                  id="mesPago"
                  type="month"
                  value={mesPagado}
                  onChange={(e) => setMesPagado(e.target.value)}
                  required
                />
              </FormField>

              <FormField
                label={mesesNum === 1 ? 'Mes en el cobro' : `Meses en el cobro (${mesesNum})`}
                icon="tabler:shopping-cart"
                wide
              >
                <CarritoMeses
                  mesInicio={mesPagado}
                  meses={mesesNum}
                  onChange={cambiarMeses}
                  cuota={cuotaCliente}
                />
              </FormField>
            </FormSection>

            <FormSection title="Importe" icon="tabler:cash">
              <FormField
                label="Subtotal (S/)"
                htmlFor="montoPago"
                required
                hint={
                  mesesNum > 1
                    ? `${mesesNum} × S/ ${cuotaCliente.toFixed(2)}`
                    : clienteSel?.monto_mensual_detalle && clienteSel.monto_mensual_detalle.length > 1
                      ? clienteSel.monto_mensual_detalle
                          .map((d) => `${d.concepto}: S/ ${d.monto.toFixed(2)}`)
                          .join('  +  ')
                      : undefined
                }
              >
                <Input
                  id="montoPago"
                  type="number"
                  step="0.01"
                  min={0}
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  required
                />
              </FormField>

              <FormField
                label="Descuento (S/)"
                htmlFor="descuentoPago"
                hint="Déjalo en 0 si no le haces rebaja."
              >
                <Input
                  id="descuentoPago"
                  type="number"
                  step="0.01"
                  min={0}
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                />
              </FormField>

              {aplicaInstalacion && (
                <FormField
                  label="Costo de instalación (S/)"
                  htmlFor="cargoInstalacion"
                  wide
                  hint="Primera instalación en esta zona. Se cobra una sola vez. Déjalo en 0 si a este cliente no le cobras instalación."
                >
                  <FieldIcon icon="tabler:tool">
                    <Input
                      id="cargoInstalacion"
                      type="number"
                      step="0.01"
                      min={0}
                      value={cargoInstalacion}
                      onChange={(e) => setCargoInstalacion(e.target.value)}
                    />
                  </FieldIcon>
                </FormField>
              )}

              <div className="flex flex-col gap-1 rounded-xl border border-ld bg-card px-4 py-3 md:col-span-2">
                {aplicaInstalacion && cargoInstalacionNum > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Mensualidad S/ {totalAPagar.toFixed(2)} · Instalación S/ {cargoInstalacionNum.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Total a cobrar</span>
                  <span
                    className={`text-xl font-bold tabular-nums ${totalACobrar > 0 ? 'text-success-text' : 'text-error-text'}`}
                  >
                    S/ {totalACobrar.toFixed(2)}
                  </span>
                </div>
              </div>
            </FormSection>

            <FormSection title="Forma de pago" icon="tabler:credit-card">
              <FormField label="Fecha de pago" htmlFor="fechaPago" required>
                <Input
                  id="fechaPago"
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Método de pago">
                <FieldIcon icon="tabler:credit-card">
                  <Select value={metodoPago} onValueChange={setMetodoPago}>
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
                htmlFor="numeroOperacionPago"
                wide
                hint={
                  metodoPago !== 'efectivo' && !numeroOperacion
                    ? 'Recomendado para Yape/Plin/transferencia/depósito — evita registrar el mismo comprobante dos veces.'
                    : undefined
                }
              >
                <FieldIcon icon="tabler:hash">
                  <Input
                    id="numeroOperacionPago"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value.toUpperCase())}
                  />
                </FieldIcon>
              </FormField>
              <FormField
                label="Voucher del cliente"
                htmlFor="comprobantePago"
                wide
                hint="Foto de Yape/Plin/depósito."
              >
                <Input
                  id="comprobantePago"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)}
                />
              </FormField>
            </FormSection>
          </FormGrid>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </div>
      </FormDialog>

      <FormDialog
        open={!!comprobanteAbierto}
        onOpenChange={(o) => {
          if (!o) {
            if (comprobanteAbierto) URL.revokeObjectURL(comprobanteAbierto.url);
            setComprobanteAbierto(null);
          }
        }}
        title={`Voucher — ${comprobanteAbierto?.pago.cliente?.nombre ?? ''}`}
        subtitle="Comprobante cargado por el cliente"
        icon="tabler:receipt"
        tone="success"
        size="sm"
      >
        {comprobanteAbierto && (
          <img
            src={comprobanteAbierto.url}
            alt="Comprobante de pago"
            className="mx-auto max-h-[60vh] w-auto rounded-xl object-contain"
          />
        )}
      </FormDialog>

      <ReciboDialog pagoId={reciboAbierto} onOpenChange={(o) => !o && setReciboAbierto(null)} />

      <FormDialog
        open={!!compromisoCliente}
        onOpenChange={(o) => !o && setCompromisoCliente(null)}
        title={`Compromiso de pago — ${compromisoCliente?.nombre ?? ''}`}
        subtitle="Plazo acordado con el cliente"
        icon="tabler:calendar-check"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setCompromisoCliente(null)}
            submitLabel="Registrar compromiso"
            submitIcon="tabler:calendar-check"
            onSubmit={handleDarCompromiso}
            submitting={guardandoCompromiso}
            disabled={!compromisoFecha}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <FormCallout>
            El cliente pidió plazo. Hasta la fecha que elijas no se cortará automáticamente
            {compromisoCliente?.estado === 'suspendido'
              ? ' y su servicio se reactivará de una vez.'
              : '.'}
          </FormCallout>

          <FormField label="Fecha límite" icon="tabler:calendar" htmlFor="fechaCompromiso" required>
            <Input
              id="fechaCompromiso"
              type="date"
              value={compromisoFecha}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              onChange={(e) => setCompromisoFecha(e.target.value)}
            />
          </FormField>

          {compromisoError && <FormCallout tone="error">{compromisoError}</FormCallout>}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!quitandoCompromiso}
        onOpenChange={(v) => !v && setQuitandoCompromiso(null)}
        title="Quitar el compromiso de pago"
        description={
          quitandoCompromiso
            ? `Se le quita el plazo a ${quitandoCompromiso.nombre} y vuelve al control normal de morosos. `
              + 'El servicio NO se corta ahora: eso lo decide el corte automático cuando le toque, con la deuda real a la vista.'
            : undefined
        }
        onConfirm={handleQuitarCompromiso}
      />

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(v) => !v && setBorrando(null)}
        title="Eliminar pago"
        description={borrando ? `¿Eliminar el pago de ${borrando.cliente?.nombre ?? 'este cliente'} por S/ ${borrando.monto.toFixed(2)}?` : undefined}
        onConfirm={handleEliminar}
      />
    </div>
  );
};

export default Pagos;
