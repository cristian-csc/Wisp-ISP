import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
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
import ClienteSearchInput from 'src/components/apps/pagos/ClienteSearchInput';
import ReciboDialog from 'src/components/apps/pagos/ReciboDialog';
import {
  listPagos,
  createPago,
  deletePago,
  subirComprobantePago,
  getComprobanteBlobUrl,
  getResumenMensual,
  getClientesSinPago,
  type ClienteMoroso,
  getClientesCortados,
  getPausasPorVencer,
  type Pago,
  type EstadoPago,
  type ClienteCortado,
} from 'src/lib/pagos';
import { reactivarCliente, darCompromisoPago, type ClienteListItem } from 'src/lib/clientes';

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
  pagado: 'bg-lightsuccess text-success',
  pendiente: 'bg-lightwarning text-warning',
  vencido: 'bg-lighterror text-error',
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

type CategoriaControl = 'atrasado' | 'cortado' | 'pausado';

type ClienteControl = ClienteListItem & {
  categoria: CategoriaControl;
  dias_atraso?: number;
  cortado_en?: string | null;
};

const CATEGORIA_FILTRO_LABEL: Record<'todos' | CategoriaControl, string> = {
  todos: 'Todos los que requieren atención',
  atrasado: 'Atrasados',
  cortado: 'Cortados',
  pausado: 'Pausados',
};

const StatCard = ({
  icon,
  label,
  value,
  bg,
  text,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  bg: string;
  text: string;
}) => (
  <CardBox className="p-4">
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${bg} ${text}`}>
        <Icon icon={icon} height={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  </CardBox>
);

const Pagos = () => {
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
  const [controlFiltro, setControlFiltro] = useState<'todos' | CategoriaControl>('todos');
  const [compromisoCliente, setCompromisoCliente] = useState<ClienteListItem | null>(null);
  const [compromisoFecha, setCompromisoFecha] = useState('');
  const [compromisoError, setCompromisoError] = useState<string | null>(null);
  const [guardandoCompromiso, setGuardandoCompromiso] = useState(false);
  const [ingresosMes, setIngresosMes] = useState(0);
  const [gastosMes, setGastosMes] = useState(0);

  const [open, setOpen] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteListItem | null>(null);
  const [monto, setMonto] = useState('');
  const [mesPagado, setMesPagado] = useState(mesActual);
  const [fechaPago, setFechaPago] = useState(hoy);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
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
    const [resumen, morosos, cortadosData, pausasData] = await Promise.all([
      getResumenMensual(),
      getClientesSinPago(),
      getClientesCortados(),
      getPausasPorVencer(),
    ]);
    const actual = resumen.find((r) => r.mes === mesActual);
    setIngresosMes(actual?.ingresos ?? 0);
    setGastosMes(actual?.gastos ?? 0);
    setSinPago(morosos);
    setCortados(cortadosData);
    setPausas(pausasData);
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

  function abrirRegistrarPago(clientePreseleccionado?: ClienteListItem) {
    setClienteSel(clientePreseleccionado ?? null);
    setMonto(clientePreseleccionado?.monto_mensual != null ? String(clientePreseleccionado.monto_mensual) : '');
    setMesPagado(mesQueDebe(clientePreseleccionado ?? null));
    setFechaPago(hoy);
    setMetodoPago('efectivo');
    setNumeroOperacion('');
    setComprobanteFile(null);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    if (!clienteSel) {
      setError('Selecciona un cliente.');
      return;
    }
    setGuardando(true);
    try {
      const pago = await createPago({
        cliente_id: clienteSel.id,
        monto: Number(monto),
        mes_pagado: mesPagado,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        numero_operacion: numeroOperacion || undefined,
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
  const controlClientes: ClienteControl[] = [
    ...sinPago.map((c) => ({ ...c, categoria: 'atrasado' as const })),
    ...cortados.map((c) => ({ ...c, categoria: 'cortado' as const })),
    ...pausas.map((c) => ({ ...c, categoria: 'pausado' as const })),
  ].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const controlFiltrados = controlFiltro === 'todos'
    ? controlClientes
    : controlClientes.filter((c) => c.categoria === controlFiltro);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl">Pagos</h1>
        <Button onClick={() => abrirRegistrarPago()}>Registrar pago</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon="tabler:cash"
          label="Recaudado este mes"
          value={`S/ ${ingresosMes.toFixed(2)}`}
          bg="bg-success/10"
          text="text-success"
        />
        <StatCard
          icon="tabler:alert-triangle"
          label="Clientes sin pagar"
          value={sinPago.length}
          bg="bg-warning/10"
          text="text-warning"
        />
        <StatCard
          icon="tabler:receipt-2"
          label="Gastos este mes"
          value={`S/ ${gastosMes.toFixed(2)}`}
          bg="bg-error/10"
          text="text-error"
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
                          <Badge className={`${(c.dias_atraso ?? 0) >= 5 ? 'bg-lighterror text-error' : 'bg-lightwarning text-warning'} rounded-md`}>
                            {labelAtraso(c.dias_atraso ?? 0)}
                          </Badge>
                        )}
                        {c.categoria === 'cortado' && (
                          <Badge className="bg-lighterror text-error rounded-md">
                            Cortado {tiempoDesde(c.cortado_en ?? null)}
                          </Badge>
                        )}
                        {c.categoria === 'pausado' && (
                          <Badge className="bg-lightinfo text-info rounded-md">
                            Pausado hasta {c.pausa_hasta ?? '—'}
                          </Badge>
                        )}
                        {c.compromiso_pago_hasta && (
                          <Badge className="bg-lightprimary text-primary rounded-md">
                            <Icon icon="tabler:handshake" height={12} className="mr-1" />
                            Compromiso hasta {c.compromiso_pago_hasta}
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
                placeholder="Buscar cliente, DNI…"
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
                      <Button variant="ghost" size="icon" title="Eliminar pago" onClick={() => setBorrando(p)}>
                        <Icon icon="tabler:trash" height={18} className="text-error" />
                      </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Cliente</Label>
              <div className="mt-2">
                <ClienteSearchInput
                  value={clienteSel}
                  onChange={(c) => {
                    setClienteSel(c);
                    setMonto(c?.monto_mensual != null ? String(c.monto_mensual) : '');
                    setMesPagado(mesQueDebe(c));
                  }}
                  placeholder="Buscar por nombre, DNI o usuario…"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="montoPago">Monto (S/)</Label>
              <Input id="montoPago" type="number" step="0.01" className="mt-2" value={monto} onChange={(e) => setMonto(e.target.value)} required />
              {clienteSel?.monto_mensual_detalle && clienteSel.monto_mensual_detalle.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {clienteSel.monto_mensual_detalle.map((d) => `${d.concepto}: S/ ${d.monto.toFixed(2)}`).join('  +  ')}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="mesPago">Mes pagado</Label>
              <Input id="mesPago" type="month" className="mt-2" value={mesPagado} onChange={(e) => setMesPagado(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="fechaPago">Fecha de pago</Label>
              <Input id="fechaPago" type="date" className="mt-2" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger className="w-full mt-2">
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
            <div>
              <Label htmlFor="numeroOperacionPago">Número de operación</Label>
              <Input
                id="numeroOperacionPago"
                className="mt-2"
                value={numeroOperacion}
                onChange={(e) => setNumeroOperacion(e.target.value.toUpperCase())}
              />
              {metodoPago !== 'efectivo' && !numeroOperacion && (
                <p className="text-xs text-warning mt-1">
                  Recomendado para Yape/Plin/transferencia/depósito — evita registrar el mismo comprobante dos veces.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="comprobantePago">Voucher del cliente (foto de Yape/Plin/depósito)</Label>
              <Input
                id="comprobantePago"
                type="file"
                accept="image/*,.pdf"
                className="mt-2"
                onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={guardando} onClick={handleSubmit}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Voucher — {comprobanteAbierto?.pago.cliente?.nombre}</DialogTitle>
          </DialogHeader>
          {comprobanteAbierto && (
            <img
              src={comprobanteAbierto.url}
              alt="Comprobante de pago"
              className="max-h-[60vh] w-auto mx-auto rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <ReciboDialog pagoId={reciboAbierto} onOpenChange={(o) => !o && setReciboAbierto(null)} />

      <Dialog open={!!compromisoCliente} onOpenChange={(o) => !o && setCompromisoCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compromiso de pago — {compromisoCliente?.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            El cliente pidió plazo. Hasta la fecha que elijas no se cortará automáticamente
            {compromisoCliente?.estado === 'suspendido' ? ' y su servicio se reactivará de una vez.' : '.'}
          </p>
          <div>
            <Label htmlFor="fechaCompromiso">Fecha límite</Label>
            <Input
              id="fechaCompromiso"
              type="date"
              className="mt-2"
              value={compromisoFecha}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              onChange={(e) => setCompromisoFecha(e.target.value)}
            />
          </div>
          {compromisoError && <p className="text-sm text-error">{compromisoError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompromisoCliente(null)}>
              Cancelar
            </Button>
            <Button disabled={guardandoCompromiso || !compromisoFecha} onClick={handleDarCompromiso}>
              {guardandoCompromiso ? 'Guardando…' : 'Registrar compromiso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
