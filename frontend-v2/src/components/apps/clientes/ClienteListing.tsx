import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import { Textarea } from 'src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import ClienteCreateDialog from './ClienteCreateDialog';
import {
  listClientes,
  listZonas,
  aprobarCliente,
  rechazarCliente,
  cortarCliente,
  reactivarCliente,
  pausarCliente,
  type ClienteListItem,
  type EstadoCliente,
  type Zona,
} from 'src/lib/clientes';
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
  pendiente_aprobacion: 'bg-lightwarning text-warning',
  rechazado: 'bg-muted text-muted-foreground',
  aprobado: 'bg-lightinfo text-info',
  no_instalado: 'bg-muted text-muted-foreground',
  activo: 'bg-lightsuccess text-success',
  anulado: 'bg-muted text-muted-foreground',
  suspendido: 'bg-lighterror text-error',
  pausado: 'bg-lightinfo text-info',
};

interface Props {
  filter: EstadoCliente | 'todos';
  currentUser: Usuario | null;
}

const puedeAprobar = (rol?: string) => rol === 'admin' || rol === 'subadmin' || rol === 'super_admin';

const ClienteListing = ({ filter, currentUser }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [rechazando, setRechazando] = useState<ClienteListItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pausando, setPausando] = useState<ClienteListItem | null>(null);
  const [mesesPausa, setMesesPausa] = useState('1');
  const [crearOpen, setCrearOpen] = useState(false);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState('todas');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'fibra_optica' | 'inalambrico'>('todos');

  async function reload() {
    setLoading(true);
    try {
      const data = await listClientes({
        page,
        search: search || undefined,
        estado: filter === 'todos' ? undefined : filter,
        zona_id: zonaFiltro === 'todas' ? undefined : Number(zonaFiltro),
        tipo_conexion: tipoFiltro === 'todos' ? 'fibra_optica,inalambrico' : tipoFiltro,
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
  }, [filter, zonaFiltro, tipoFiltro, page]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, zonaFiltro, tipoFiltro]);

  async function handleAprobar(c: ClienteListItem) {
    try {
      await aprobarCliente(c.id);
      reload();
      toast.success(`Instalación de ${c.nombre} aprobada`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo aprobar la instalación');
    }
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

  async function handleCortar(c: ClienteListItem) {
    try {
      await cortarCliente(c.id);
      reload();
      toast.success(`Servicio de ${c.nombre} cortado`);
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
    <div className="my-6">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
        <Button onClick={() => setCrearOpen(true)} className="rounded-md whitespace-nowrap">
          Registrar cliente
        </Button>

        <div className="flex gap-3 flex-wrap w-full sm:w-auto sm:ml-auto">
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

          <div className="relative sm:max-w-60 w-full">
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
              placeholder="Buscar por nombre, DNI, usuario PPPoE…"
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
                          onClick={() => navigate(`/clientes/${c.id}`)}
                        >
                          {c.nombre}
                        </h6>
                        <Badge className={`rounded-md text-[10px] ${c.tipo_conexion === 'fibra_optica' ? 'bg-lightprimary text-primary' : 'bg-lightinfo text-info'}`}>
                          {c.tipo_conexion === 'fibra_optica' ? 'Fibra' : 'Inalámbrico'}
                        </Badge>
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
                              <Button variant="ghost" size="icon" onClick={() => handleCortar(c)}>
                                <Icon icon="tabler:player-pause" height={18} className="text-error" />
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
                                onClick={() => { setPausando(c); setMesesPausa('1'); }}
                              >
                                <Icon icon="tabler:clock-pause" height={18} className="text-info" />
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
                            <Button variant="ghost" size="icon" onClick={() => handleReactivar(c)}>
                              <Icon icon="tabler:player-play" height={18} className="text-success" />
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

      {/* Motivo de rechazo */}
      <Dialog open={!!rechazando} onOpenChange={(open) => !open && setRechazando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar instalación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="text-foreground font-medium">{rechazando?.nombre}</span>
          </p>
          <Textarea
            placeholder="Motivo del rechazo (ej. fuera de cobertura)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={!motivo.trim()} onClick={handleRechazarConfirm}>
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pausa temporal */}
      <Dialog open={!!pausando} onOpenChange={(open) => !open && setPausando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar servicio temporalmente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="text-foreground font-medium">{pausando?.nombre}</span>
          </p>
          <div>
            <div className="mb-2 block">
              <Label htmlFor="mesesPausa">¿Por cuántos meses?</Label>
            </div>
            <Input
              id="mesesPausa"
              type="number"
              min={1}
              value={mesesPausa}
              onChange={(e) => setMesesPausa(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPausando(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePausarConfirm}>Confirmar pausa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClienteCreateDialog open={crearOpen} onOpenChange={setCrearOpen} onCreated={reload} />
    </div>
  );
};

export default ClienteListing;
