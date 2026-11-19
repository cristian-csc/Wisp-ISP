import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import { Avatar, AvatarFallback } from 'src/components/ui/avatar';
import { Badge } from 'src/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'src/components/ui/tooltip';
import {
  FormActions,
  FormDialog,
  FormField,
} from 'src/components/shared/form';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Textarea } from 'src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import ClienteCreateDialog from './ClienteCreateDialog';
import ClienteVistaRapida from './ClienteVistaRapida';
import AprobarClienteDialog from './AprobarClienteDialog';
import {
  listClientes,
  listZonas,
  rechazarCliente,
  cortarCliente,
  reactivarCliente,
  pausarCliente,
  ESTADOS_CLIENTE,
  type ClienteListItem,
  type EstadoCliente,
  type ResumenEstados,
  type Zona,
} from 'src/lib/clientes';
import { ESTADOS_DESTACADOS } from './ClienteFilter';
import type { Usuario } from 'src/lib/api';

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
  pendiente_aprobacion: 'bg-lightwarning text-warning-text',
  rechazado: 'bg-muted text-muted-foreground',
  aprobado: 'bg-lightinfo text-info-text',
  no_instalado: 'bg-muted text-muted-foreground',
  activo: 'bg-lightsuccess text-success-text',
  anulado: 'bg-muted text-muted-foreground',
  suspendido: 'bg-lighterror text-error-text',
  pausado: 'bg-lightinfo text-info-text',
};

interface Props {
  filter: EstadoCliente | 'todos';
  setFilter: (f: EstadoCliente | 'todos') => void;
  /** Cuentas por estado, para decirlas junto a cada opción */
  resumen: ResumenEstados | null;
  currentUser: Usuario | null;
  /** Fija el tipo de conexión: la sección ya es de un solo tipo y el
   *  selector de tipo deja de tener sentido. */
  tipo?: 'fibra_optica' | 'inalambrico';
}

const puedeAprobar = (rol?: string) => rol === 'admin';

const ClienteListing = ({ filter, setFilter, resumen, currentUser, tipo }: Props) => {
  /** Los estados que no tienen tarjeta arriba. No son un segundo filtro: es
   *  el mismo, con las opciones que no caben en el encabezado. */
  const otrosEstados = ESTADOS_CLIENTE.filter(
    (e) => !ESTADOS_DESTACADOS.includes(e.valor),
  );
  const enOtros = otrosEstados.some((e) => e.valor === filter);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [aprobando, setAprobando] = useState<ClienteListItem | null>(null);
  const [rechazando, setRechazando] = useState<ClienteListItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pausando, setPausando] = useState<ClienteListItem | null>(null);
  /** Cortar deja a una persona sin internet: siempre se confirma antes. */
  const [cortando, setCortando] = useState<ClienteListItem | null>(null);
  const [mesesPausa, setMesesPausa] = useState('1');
  const [crearOpen, setCrearOpen] = useState(false);
  /** El cliente que se está mirando por encima. Tocar el nombre abre esto y
   *  no la ficha: así no se pierden el filtro, la búsqueda ni la página. */
  const [vistaRapida, setVistaRapida] = useState<ClienteListItem | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState('todas');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'fibra_optica' | 'inalambrico'>('todos');
  /** El pendiente de la migracion: clientes ya instalados a los que todavia
   *  les falta la caja, el borne o el equipo. No es un estado mas --no
   *  cuelga del filtro de estados-- porque es ortogonal: los hay activos,
   *  suspendidos y pausados. */
  const [soloIncompletos, setSoloIncompletos] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const data = await listClientes({
        page,
        search: search || undefined,
        estado: filter === 'todos' ? undefined : filter,
        zona_id: zonaFiltro === 'todas' ? undefined : Number(zonaFiltro),
        tipo_conexion: tipo ?? (tipoFiltro === 'todos' ? 'fibra_optica,inalambrico' : tipoFiltro),
        faltan_datos: soloIncompletos || undefined,
      });
      setItems(data.items);
      setPages(data.pages);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    listZonas().then(setZonas);
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, zonaFiltro, tipoFiltro, soloIncompletos, tipo, page]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, zonaFiltro, tipoFiltro, soloIncompletos, tipo]);

  // Aprobar abre la ventana de la IP: antes aprobaba directamente y el
  // cliente se quedaba sin IP fija, lo que hace que el corte por morosidad no
  // acierte. Los avisos los da ya la propia ventana.
  function handleAprobar(c: ClienteListItem) {
    setAprobando(c);
  }

  async function handleRechazarConfirm() {
    if (!rechazando) return;
    try {
      await rechazarCliente(rechazando.id, motivo);
      setRechazando(null);
      setMotivo('');
      reload();
      toast.success('Instalación rechazada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo rechazar la instalación');
    }
  }

  async function handleCortar() {
    if (!cortando) return;
    const c = cortando;
    try {
      await cortarCliente(c.id);
      reload();
      toast.success(`Servicio de ${c.nombre} cortado`, {
        action: { label: 'Reactivar', onClick: () => handleReactivar(c) },
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo cortar el servicio');
    }
  }

  async function handleReactivar(c: ClienteListItem) {
    try {
      await reactivarCliente(c.id);
      reload();
      toast.success(`${c.nombre} reactivado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo reactivar al cliente');
    }
  }

  async function handlePausarConfirm() {
    if (!pausando) return;
    try {
      await pausarCliente(pausando.id, Number(mesesPausa) || 1);
      setPausando(null);
      reload();
      toast.success('Servicio pausado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo pausar el servicio');
    }
  }

  return (
    <div>
      {/* Registrar a la izquierda; zona y buscador a la derecha. En pantalla
          chica se reparten en varias filas en vez de desbordarse. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setCrearOpen(true)} className="rounded-md whitespace-nowrap">
          Registrar cliente
        </Button>

        <div className="flex gap-3 flex-wrap w-full sm:w-auto sm:ml-auto">
          {/* Los cuatro estados que no tienen tarjeta arriba. Sin esto no
              habría forma de ver los pausados ni los aprobados sin instalar. */}
          <Select
            value={enOtros ? (filter as string) : 'ninguno'}
            onValueChange={(v) => setFilter(v === 'ninguno' ? 'todos' : (v as EstadoCliente))}
          >
            <SelectTrigger
              className={`w-full sm:w-48 ${enOtros ? 'border-primary text-primary-text' : ''}`}
            >
              <SelectValue placeholder="Otros estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">Otros estados</SelectItem>
              {otrosEstados.map((e) => (
                <SelectItem key={e.valor} value={e.valor}>
                  {e.etiqueta} ({resumen?.por_estado[e.valor] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* La sección ya es de un solo tipo: el selector sobra */}
          {!tipo && (
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Fibra + Inalámbrico</SelectItem>
                <SelectItem value="fibra_optica">Solo fibra óptica</SelectItem>
                <SelectItem value="inalambrico">Solo inalámbrico</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Un interruptor y no una opción más del selector de estados:
              esto es perpendicular a estar activo o suspendido —hay fichas
              incompletas en los tres estados— y meterlo ahí obligaría a
              elegir entre una cosa y la otra. */}
          <Button
            type="button"
            variant={soloIncompletos ? 'default' : 'outline'}
            className="w-full sm:w-auto"
            onClick={() => setSoloIncompletos((v) => !v)}
            title="Clientes ya instalados a los que todavía les falta registrar la caja, el borne o el equipo"
          >
            <Icon icon="tabler:clipboard-x" height={17} className="me-1.5" />
            Faltan datos
          </Button>

          <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todas las zonas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las zonas</SelectItem>
              {zonas.map((z) => (
                <SelectItem key={z.id} value={String(z.id)}>
                  {z.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-full sm:w-60">
            <Icon
              icon="tabler:search"
              height={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (page !== 1) setPage(1);
                else reload();
              }}
              placeholder="Buscar por nombre, DNI o PPPoE y pulsa Enter"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-base font-semibold py-3 whitespace-nowrap">Cliente</TableHead>
              <TableHead className="text-base font-semibold py-3 whitespace-nowrap">Zona / Plan</TableHead>
              <TableHead className="text-base font-semibold py-3 whitespace-nowrap">Estado</TableHead>
              <TableHead className="text-base font-semibold py-3 whitespace-nowrap">Cuota mensual</TableHead>
              <TableHead className="text-base font-semibold py-3 whitespace-nowrap">Vencimiento</TableHead>
              <TableHead className="text-base font-semibold py-3 text-end">Acciones</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay clientes en esta categoría.
                </TableCell>
              </TableRow>
            )}
            {items.map((c) => (
              <TableRow key={c.id} className="hover:bg-primary/5">
                <TableCell className="max-w-xs">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{c.nombre.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h6
                          className="text-base truncate cursor-pointer hover:text-primary"
                          onClick={() => setVistaRapida(c)}
                          title="Ver un resumen sin salir de la lista"
                        >
                          {c.nombre}
                        </h6>
                        {!tipo && (
                          <Badge className={`rounded-md text-[10px] ${c.tipo_conexion === 'fibra_optica' ? 'bg-lightprimary text-primary-text' : 'bg-lightinfo text-info-text'}`}>
                            {c.tipo_conexion === 'fibra_optica' ? 'Fibra' : 'Inalámbrico'}
                          </Badge>
                        )}
                        {/* Ambar y no rojo: una ficha a medias es trabajo
                            pendiente, no una avería. El rojo se gasta si se
                            usa para cosas que no son culpa de nadie. */}
                        {c.faltan_datos && (
                          <Badge
                            className="rounded-md bg-lightwarning text-warning-text text-[10px]"
                            title="Ya instalado pero sin caja, borne o equipo registrado"
                          >
                            Faltan datos
                          </Badge>
                        )}
                        {c.sin_fotos && !c.faltan_datos && (
                          <Badge
                            className="rounded-md bg-muted text-muted-foreground text-[10px]"
                            title="No tiene ninguna foto cargada"
                          >
                            Sin fotos
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        DNI {c.dni ?? '—'} · {c.usuario_pppoe}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{c.zona?.nombre ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">{c.plan?.nombre ?? '—'}</p>
                </TableCell>
                <TableCell>
                  <Badge className={`${ESTADO_BADGE[c.estado]} rounded-md`}>
                    {ESTADO_LABEL[c.estado]}
                  </Badge>
                </TableCell>
                <TableCell>{c.monto_mensual != null ? `S/ ${c.monto_mensual.toFixed(2)}` : '—'}</TableCell>
                <TableCell>
                  <p className="text-sm text-muted-foreground">{c.fecha_vencimiento ?? '—'}</p>
                </TableCell>
                <TableCell className="text-end">
                  <TooltipProvider>
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/clientes/${c.id}`)}
                          >
                            <Icon icon="tabler:eye" height={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ver detalle</p>
                        </TooltipContent>
                      </Tooltip>

                      {c.estado === 'pendiente_aprobacion' && puedeAprobar(currentUser?.rol) && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleAprobar(c)}>
                                <Icon icon="tabler:check" height={18} className="text-success" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Aprobar instalación</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setRechazando(c)}>
                                <Icon icon="tabler:x" height={18} className="text-error" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Rechazar</p>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}

                      {c.estado === 'activo' && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Cortar servicio de ${c.nombre}`}
                                onClick={() => setCortando(c)}
                              >
                                <Icon icon="tabler:plug-off" height={18} className="text-error-text" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Cortar servicio</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Pausar servicio de ${c.nombre}`}
                                onClick={() => { setPausando(c); setMesesPausa('1'); }}
                              >
                                <Icon icon="tabler:player-pause" height={18} className="text-info-text" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Pausar temporalmente (a pedido del cliente)</p>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}

                      {(c.estado === 'suspendido' || c.estado === 'pausado') && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Reactivar servicio de ${c.nombre}`}
                              onClick={() => handleReactivar(c)}
                            >
                              <Icon icon="tabler:player-play" height={18} className="text-success-text" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Reactivar</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            {total} clientes — página {page} de {pages}
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

      <ConfirmDialog
        open={!!cortando}
        onOpenChange={(abierto) => !abierto && setCortando(null)}
        title="¿Cortar el servicio?"
        description={
          cortando
            ? `${cortando.nombre}${cortando.zona ? `, de ${cortando.zona.nombre},` : ''} se quedará sin internet hasta que reactives su servicio.`
            : undefined
        }
        confirmText="Sí, cortar servicio"
        loadingText="Cortando…"
        cancelText="No, mantener activo"
        icon="tabler:plug-off"
        onConfirm={handleCortar}
      />

      <AprobarClienteDialog
        cliente={aprobando}
        onClose={() => setAprobando(null)}
        onAprobado={reload}
      />

      {/* Motivo de rechazo */}
      <FormDialog
        open={!!rechazando}
        onOpenChange={(open) => !open && setRechazando(null)}
        title="Rechazar instalación"
        subtitle={rechazando?.nombre}
        icon="tabler:circle-x"
        tone="error"
        size="md"
        footer={
          <FormActions
            onCancel={() => setRechazando(null)}
            submitLabel="Rechazar"
            submitIcon="tabler:circle-x"
            submitVariant="destructive"
            onSubmit={handleRechazarConfirm}
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

      {/* Pausa temporal */}
      <FormDialog
        open={!!pausando}
        onOpenChange={(open) => !open && setPausando(null)}
        title="Pausar servicio temporalmente"
        subtitle={pausando?.nombre}
        icon="tabler:player-pause"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setPausando(null)}
            submitLabel="Confirmar pausa"
            submitIcon="tabler:player-pause"
            onSubmit={handlePausarConfirm}
          />
        }
      >
        <FormField label="¿Por cuántos meses?" icon="tabler:calendar" htmlFor="mesesPausa">
          <Input
            id="mesesPausa"
            type="number"
            min={1}
            value={mesesPausa}
            onChange={(e) => setMesesPausa(e.target.value)}
          />
        </FormField>
      </FormDialog>

      <ClienteVistaRapida
        cliente={vistaRapida}
        onOpenChange={(abierto) => !abierto && setVistaRapida(null)}
        estadoLabel={vistaRapida ? ESTADO_LABEL[vistaRapida.estado] : ''}
        estadoBadge={vistaRapida ? ESTADO_BADGE[vistaRapida.estado] : ''}
      />

      <ClienteCreateDialog
        open={crearOpen}
        onOpenChange={setCrearOpen}
        onCreated={reload}
        tipoInicial={tipo}
      />
    </div>
  );
};

export default ClienteListing;
