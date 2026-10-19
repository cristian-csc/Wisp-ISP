import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import { Badge } from 'src/components/ui/badge';
import { Avatar, AvatarFallback } from 'src/components/ui/avatar';
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
import BorneCardGrid from './BorneCardGrid';
import {
  getCajaNap,
  ampliarCajaNap,
  marcarBorne,
  setCodigoPrecinto,
  getEstadoPppoeCaja,
  type CajaNap,
  type Borne,
  type EstadoPppoeBorne,
} from 'src/lib/cajasnap';
import { getPppoeStatus, type PppoeStatus } from 'src/lib/clientes';

interface Props {
  cajaId: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const CajaNapDetailDialog = ({ cajaId, onOpenChange, onChanged }: Props) => {
  const navigate = useNavigate();
  const [caja, setCaja] = useState<CajaNap | null>(null);
  const [borneAbierto, setBorneAbierto] = useState<Borne | null>(null);
  const [precintoEdit, setPrecintoEdit] = useState('');
  const [guardandoPrecinto, setGuardandoPrecinto] = useState(false);
  const [pppoeStatus, setPppoeStatus] = useState<PppoeStatus | null>(null);
  const [cargandoPppoe, setCargandoPppoe] = useState(false);
  const [estadosPppoe, setEstadosPppoe] = useState<Record<number, EstadoPppoeBorne>>({});
  const [cargandoEstados, setCargandoEstados] = useState(false);

  async function reload() {
    if (!cajaId) return;
    setCaja(await getCajaNap(cajaId));
    onChanged?.();
  }

  useEffect(() => {
    if (cajaId) reload();
    else setCaja(null);
    setEstadosPppoe({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaId]);

  async function handleRefrescarEstados() {
    if (!caja) return;
    setCargandoEstados(true);
    try {
      const estados = await getEstadoPppoeCaja(caja.id);
      const map: Record<number, EstadoPppoeBorne> = {};
      estados.forEach((e) => { map[e.borne_id] = e; });
      setEstadosPppoe(map);
    } finally {
      setCargandoEstados(false);
    }
  }

  async function handleAmpliar() {
    if (!caja) return;
    const nueva = caja.capacidad_bornes >= 16 ? 32 : 16;
    await ampliarCajaNap(caja.id, nueva);
    reload();
  }

  async function handleBorneClick(b: Borne) {
    if (b.estado === 'ocupado') {
      setPrecintoEdit(b.codigo_precinto ?? '');
      setPppoeStatus(null);
      setBorneAbierto(b);
      return;
    }
    await marcarBorne(b.id, b.estado !== 'danado');
    reload();
  }

  async function handleVerEstadoPppoe() {
    if (!borneAbierto?.cliente) return;
    setCargandoPppoe(true);
    try {
      setPppoeStatus(await getPppoeStatus(borneAbierto.cliente.id));
    } finally {
      setCargandoPppoe(false);
    }
  }

  async function handleGuardarPrecinto() {
    if (!borneAbierto) return;
    setGuardandoPrecinto(true);
    try {
      await setCodigoPrecinto(borneAbierto.id, precintoEdit.trim() || null);
      setBorneAbierto(null);
      reload();
    } finally {
      setGuardandoPrecinto(false);
    }
  }

  const libres = caja?.bornes.filter((b) => b.estado === 'libre').length ?? 0;
  const ocupados = caja?.bornes.filter((b) => b.estado === 'ocupado').length ?? 0;
  const danados = caja?.bornes.filter((b) => b.estado === 'danado').length ?? 0;

  return (
    <>
      <Dialog open={!!cajaId} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightprimary text-primary">
                <Icon icon="tabler:box" height={19} />
              </span>
              {caja?.codigo ?? 'Cargando…'}
            </DialogTitle>
          </DialogHeader>

          {caja && (
            <>
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2.5 rounded-xl bg-lightprimary px-3.5 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Icon icon="tabler:plug-connected" height={17} />
                    </span>
                    <div className="leading-none">
                      <p className="text-xl font-bold text-primary">{libres}</p>
                      <p className="text-[10px] font-medium text-primary/70 uppercase tracking-wide">Libres</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-lightsuccess px-3.5 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
                      <Icon icon="tabler:wifi" height={17} />
                    </span>
                    <div className="leading-none">
                      <p className="text-xl font-bold text-success">{ocupados}</p>
                      <p className="text-[10px] font-medium text-success/70 uppercase tracking-wide">Ocupados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-lighterror px-3.5 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-error/15 text-error">
                      <Icon icon="tabler:alert-triangle-filled" height={17} />
                    </span>
                    <div className="leading-none">
                      <p className="text-xl font-bold text-error">{danados}</p>
                      <p className="text-[10px] font-medium text-error/70 uppercase tracking-wide">Dañados</p>
                    </div>
                  </div>
                </div>
                {caja.capacidad_bornes < 32 && (
                  <Button size="sm" onClick={handleAmpliar}>
                    <Icon icon="tabler:layout-grid-add" height={15} className="mr-1" />
                    Ampliar a {caja.capacidad_bornes >= 16 ? 32 : 16} bornes
                  </Button>
                )}
              </div>

              <BorneCardGrid bornes={caja.bornes} onClickBorne={handleBorneClick} />
              <div className="flex items-start gap-2 rounded-lg bg-lightinfo px-3 py-2.5">
                <Icon icon="tabler:info-circle" height={16} className="text-info shrink-0 mt-0.5" />
                <p className="text-xs text-info/90">
                  Click en un borne libre/dañado para alternar su estado. Click en un borne ocupado
                  para ver el cliente conectado y su código de precinto.
                </p>
              </div>

              {ocupados > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 mt-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Icon icon="tabler:users" height={16} className="text-muted-foreground" />
                      Registro de abonados
                    </h4>
                    <Button variant="outline" size="sm" disabled={cargandoEstados} onClick={handleRefrescarEstados}>
                      <Icon icon="tabler:refresh" height={14} className="mr-1" />
                      {cargandoEstados ? 'Consultando…' : 'Refrescar estados'}
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Borne</TableHead>
                          <TableHead>DNI</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Cable</TableHead>
                          <TableHead>Instalación</TableHead>
                          <TableHead>Precinto</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {caja.bornes.filter((b) => b.estado === 'ocupado' && b.cliente).map((b) => {
                          const estado = estadosPppoe[b.id];
                          return (
                            <TableRow key={b.id}>
                              <TableCell className="font-mono text-xs">#{b.numero}</TableCell>
                              <TableCell className="font-mono text-xs">{b.cliente!.usuario_pppoe}</TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  className="text-primary hover:underline text-sm"
                                  onClick={() => navigate(`/clientes/${b.cliente!.id}`)}
                                >
                                  {b.cliente!.nombre}
                                </button>
                              </TableCell>
                              <TableCell className="text-sm">{b.cliente!.plan?.nombre ?? '—'}</TableCell>
                              <TableCell className="text-sm">{b.cliente!.metros_cable != null ? `${b.cliente!.metros_cable} m` : '—'}</TableCell>
                              <TableCell className="text-sm">{b.cliente!.fecha_instalacion ?? '—'}</TableCell>
                              <TableCell>
                                {b.codigo_precinto ? (
                                  <span className="text-sm">{b.codigo_precinto}</span>
                                ) : (
                                  <Badge className="bg-lightwarning text-warning rounded-md text-[10px]">Falta precinto</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {!estado && <span className="text-xs text-muted-foreground">—</span>}
                                {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
                                {estado && !estado.error && (
                                  <span className={`text-xs font-medium ${estado.conectado ? 'text-success' : 'text-muted-foreground'}`}>
                                    {estado.conectado ? 'En línea' : 'Desconectado'}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!borneAbierto} onOpenChange={(o) => !o && setBorneAbierto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borne {borneAbierto?.numero}</DialogTitle>
          </DialogHeader>
          {borneAbierto?.cliente && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-ld bg-muted/40 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar>
                  <AvatarFallback>{borneAbierto.cliente.nombre.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{borneAbierto.cliente.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{borneAbierto.cliente.usuario_pppoe}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => navigate(`/clientes/${borneAbierto.cliente!.id}`)}
              >
                <Icon icon="tabler:arrow-up-right" height={14} className="mr-1" />
                Ver detalle
              </Button>
            </div>
          )}

          {(borneAbierto?.cliente?.metros_cable != null || borneAbierto?.potencia_optica_dbm != null) && (
            <div className="flex gap-6 text-sm">
              {borneAbierto?.cliente?.metros_cable != null && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Cable</p>
                  <p>{borneAbierto.cliente.metros_cable} m</p>
                </div>
              )}
              {borneAbierto?.potencia_optica_dbm != null && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Potencia óptica</p>
                  <p>{borneAbierto.potencia_optica_dbm} dBm — registrada en instalación</p>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 block">
              <Label htmlFor="precinto">Código de precinto</Label>
            </div>
            <Input
              id="precinto"
              value={precintoEdit}
              onChange={(e) => setPrecintoEdit(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Número de serie del precinto físico amarrado al cable drop de este cliente.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Estado en el MikroTik</Label>
              <Button variant="outline" size="sm" disabled={cargandoPppoe} onClick={handleVerEstadoPppoe}>
                <Icon icon="tabler:refresh" height={14} className="mr-1" />
                {cargandoPppoe ? 'Consultando…' : 'Ver estado'}
              </Button>
            </div>
            {pppoeStatus && (
              pppoeStatus.error ? (
                <p className="text-sm text-error">{pppoeStatus.error}</p>
              ) : (
                <p className="text-sm">
                  <span className={pppoeStatus.conectado ? 'text-success font-medium' : 'text-muted-foreground font-medium'}>
                    {pppoeStatus.conectado ? 'En línea' : 'Desconectado'}
                  </span>
                  {pppoeStatus.conectado && pppoeStatus.uptime && ` — activo hace ${pppoeStatus.uptime}`}
                  {pppoeStatus.conectado && pppoeStatus.ip_remota && ` (${pppoeStatus.ip_remota})`}
                </p>
              )
            )}
            {!pppoeStatus && (
              <p className="text-xs text-muted-foreground">
                Consulta en vivo si el cliente está conectado ahora mismo al router de su zona.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBorneAbierto(null)}>
              Cancelar
            </Button>
            <Button disabled={guardandoPrecinto} onClick={handleGuardarPrecinto}>
              {guardandoPrecinto ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CajaNapDetailDialog;
