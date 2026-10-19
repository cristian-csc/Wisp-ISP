import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import BorneDots from 'src/components/apps/cajasnap/BorneDots';
import RingProgress, { toneForPct } from 'src/components/apps/cajasnap/RingProgress';
import MapaZona from 'src/components/apps/zonas/MapaZona';
import { listUsuarios } from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';
import {
  getZona,
  wireguardStatus,
  listTecnicosZona,
  asignarTecnicoZona,
  quitarTecnicoZona,
  updateZonaDatos,
  type Zona,
  type WireguardStatus,
  type Tecnico,
} from 'src/lib/zonas';
import { listMufas, createMufa, updateMufa, deleteMufa, type Mufa, type TrazadoPunto } from 'src/lib/mufas';
import { listCajasDeMufa } from 'src/lib/mufas';
import { listCajasNap, createCajaNap, updateCajaNap, deleteCajaNap, type CajaNap } from 'src/lib/cajasnap';

const StatTile = ({ icon, label, value, bg, text }: { icon: string; label: string; value: number; bg: string; text: string }) => (
  <div className="flex items-center gap-3">
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${bg} ${text}`}>
      <Icon icon={icon} height={20} />
    </div>
    <div className="min-w-0">
      <p className="text-xl font-bold leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground truncate">{label}</p>
    </div>
  </div>
);

const ZonaDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [zona, setZona] = useState<Zona | null>(null);
  const [wg, setWg] = useState<WireguardStatus | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [todosTecnicos, setTodosTecnicos] = useState<Usuario[]>([]);
  const [seleccion, setSeleccion] = useState('');

  const [mufas, setMufas] = useState<Mufa[]>([]);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [modoColocar, setModoColocar] = useState<'servidor' | 'mufa' | 'caja' | null>(null);
  const [mufaContexto, setMufaContexto] = useState<Mufa | null>(null);
  const [nuevaMufaCoords, setNuevaMufaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mufaCodigo, setMufaCodigo] = useState('');
  const [mufaDescripcion, setMufaDescripcion] = useState('');
  const [mufaError, setMufaError] = useState<string | null>(null);
  const [borrandoTrazadoDe, setBorrandoTrazadoDe] = useState<Mufa | null>(null);
  const [borrandoMufa, setBorrandoMufa] = useState<Mufa | null>(null);
  const [borrandoCaja, setBorrandoCaja] = useState<CajaNap | null>(null);

  const [nuevaCajaCoords, setNuevaCajaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cajaCodigo, setCajaCodigo] = useState('');
  const [cajaCapacidad, setCajaCapacidad] = useState('8');
  const [cajaError, setCajaError] = useState<string | null>(null);

  const [dibujandoTrazadoMufa, setDibujandoTrazadoMufa] = useState<Mufa | null>(null);
  const [puntosTrazado, setPuntosTrazado] = useState<TrazadoPunto[]>([]);

  const [mufaVer, setMufaVer] = useState<Mufa | null>(null);
  const [cajasDeMufa, setCajasDeMufa] = useState<CajaNap[]>([]);

  const [editandoCaja, setEditandoCaja] = useState<CajaNap | null>(null);
  const [editCajaCodigo, setEditCajaCodigo] = useState('');
  const [editCajaError, setEditCajaError] = useState<string | null>(null);

  const [editandoZona, setEditandoZona] = useState(false);
  const [editZonaNombre, setEditZonaNombre] = useState('');
  const [editZonaDescripcion, setEditZonaDescripcion] = useState('');
  const [editZonaTiendas, setEditZonaTiendas] = useState('');
  const [editZonaIpLan, setEditZonaIpLan] = useState('');
  const [editZonaUsuarioMikrotik, setEditZonaUsuarioMikrotik] = useState('');
  const [editZonaPasswordMikrotik, setEditZonaPasswordMikrotik] = useState('');
  const [editZonaRouterMikrotik, setEditZonaRouterMikrotik] = useState('');
  const [editZonaIpRouter, setEditZonaIpRouter] = useState('');
  const [editZonaError, setEditZonaError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    const z = await getZona(Number(id));
    setZona(z);
    setTecnicos(await listTecnicosZona(Number(id)));
    setMufas(await listMufas(Number(id)));
    setCajas(await listCajasNap(Number(id)));
    wireguardStatus(Number(id))
      .then(setWg)
      .catch(() => setWg(null));
  }

  useEffect(() => {
    reload();
    listUsuarios().then((all) => setTodosTecnicos(all.filter((u) => u.rol === 'tecnico')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAsignar() {
    if (!id || !seleccion) return;
    try {
      await asignarTecnicoZona(Number(id), Number(seleccion));
      setSeleccion('');
      reload();
      toast.success('Técnico asignado a la zona');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo asignar el técnico');
    }
  }

  async function handleQuitar(tecnicoId: number) {
    if (!id) return;
    try {
      await quitarTecnicoZona(Number(id), tecnicoId);
      reload();
      toast.success('Técnico quitado de la zona');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo quitar el técnico');
    }
  }

  function handleAbrirEditarZona() {
    if (!zona) return;
    setEditZonaNombre(zona.nombre);
    setEditZonaDescripcion(zona.descripcion ?? '');
    setEditZonaTiendas(zona.tiendas_pago ?? '');
    setEditZonaIpLan(zona.ip_lan ?? '');
    setEditZonaUsuarioMikrotik(zona.usuario_mikrotik ?? '');
    setEditZonaPasswordMikrotik('');
    setEditZonaRouterMikrotik(zona.router_mikrotik ?? '');
    setEditZonaIpRouter(zona.ip_router ?? '');
    setEditZonaError(null);
    setEditandoZona(true);
  }

  async function handleGuardarEdicionZona() {
    if (!id) return;
    setEditZonaError(null);
    if (!editZonaNombre.trim()) {
      setEditZonaError('El nombre es obligatorio.');
      return;
    }
    try {
      await updateZonaDatos(Number(id), {
        nombre: editZonaNombre.trim(),
        descripcion: editZonaDescripcion.trim() || undefined,
        tiendas_pago: editZonaTiendas.trim() || undefined,
        ip_lan: editZonaIpLan.trim() || undefined,
        usuario_mikrotik: editZonaUsuarioMikrotik.trim() || undefined,
        password_mikrotik: editZonaPasswordMikrotik.trim() || undefined,
        router_mikrotik: editZonaRouterMikrotik.trim() || undefined,
        ip_router: editZonaIpRouter.trim() || undefined,
      });
      setEditandoZona(false);
      reload();
      toast.success('Zona actualizada');
    } catch (err: any) {
      setEditZonaError(err?.response?.data?.detail ?? 'No se pudo editar la zona');
    }
  }

  async function handleColocarPin(lat: number, lng: number) {
    if (!id) return;
    if (modoColocar === 'servidor') {
      await updateZonaDatos(Number(id), { lat, lng });
      setModoColocar(null);
      reload();
    } else if (modoColocar === 'mufa') {
      setNuevaMufaCoords({ lat, lng });
      setModoColocar(null);
    } else if (modoColocar === 'caja') {
      setNuevaCajaCoords({ lat, lng });
      setModoColocar(null);
    }
  }

  async function handleCrearMufa() {
    if (!id || !nuevaMufaCoords) return;
    setMufaError(null);
    if (!mufaCodigo.trim()) {
      setMufaError('El código es obligatorio.');
      return;
    }
    try {
      await createMufa({
        codigo: mufaCodigo.trim(),
        zona_id: Number(id),
        lat: nuevaMufaCoords.lat,
        lng: nuevaMufaCoords.lng,
        descripcion: mufaDescripcion.trim() || undefined,
      });
      setNuevaMufaCoords(null);
      setMufaCodigo('');
      setMufaDescripcion('');
      reload();
      toast.success('Mufa creada');
    } catch (err: any) {
      setMufaError(err?.response?.data?.detail ?? 'No se pudo crear la mufa');
    }
  }

  async function handleVerMufa(mufa: Mufa) {
    setMufaVer(mufa);
    setCajasDeMufa(await listCajasDeMufa(mufa.id));
  }

  function handleAgregarCajaEnMapa() {
    if (!mufaVer) return;
    setMufaContexto(mufaVer);
    setMufaVer(null);
    setModoColocar('caja');
  }

  function handleDibujarTrazado() {
    if (!mufaVer) return;
    setDibujandoTrazadoMufa(mufaVer);
    setPuntosTrazado(mufaVer.trazado ?? []);
    setMufaVer(null);
  }

  function handleAgregarPuntoTrazado(lat: number, lng: number) {
    setPuntosTrazado((prev) => [...prev, { lat, lng }]);
  }

  function handleDeshacerPuntoTrazado() {
    setPuntosTrazado((prev) => prev.slice(0, -1));
  }

  async function handleGuardarTrazado() {
    if (!dibujandoTrazadoMufa) return;
    try {
      await updateMufa(dibujandoTrazadoMufa.id, { trazado: puntosTrazado });
      setDibujandoTrazadoMufa(null);
      setPuntosTrazado([]);
      reload();
      toast.success('Trazado guardado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo guardar el trazado');
    }
  }

  function handleCancelarTrazado() {
    setDibujandoTrazadoMufa(null);
    setPuntosTrazado([]);
  }

  async function handleEliminarTrazado() {
    if (!borrandoTrazadoDe) return;
    try {
      await updateMufa(borrandoTrazadoDe.id, { trazado: null });
      setMufaVer(null);
      reload();
      toast.success('Trazado eliminado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar el trazado');
    }
  }

  async function handleEliminarMufa() {
    if (!borrandoMufa) return;
    try {
      await deleteMufa(borrandoMufa.id);
      setMufaVer(null);
      reload();
      toast.success('Mufa eliminada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la mufa');
    }
  }

  async function handleCrearCaja() {
    if (!id || !nuevaCajaCoords || !mufaContexto) return;
    setCajaError(null);
    if (!cajaCodigo.trim()) {
      setCajaError('El código es obligatorio.');
      return;
    }
    try {
      await createCajaNap({
        codigo: cajaCodigo.trim(),
        zona_id: Number(id),
        mufa_id: mufaContexto.id,
        lat: nuevaCajaCoords.lat,
        lng: nuevaCajaCoords.lng,
        capacidad_bornes: Number(cajaCapacidad) || 8,
      });
      setNuevaCajaCoords(null);
      setCajaCodigo('');
      setCajaCapacidad('8');
      setMufaContexto(null);
      reload();
      toast.success('Caja NAP creada');
    } catch (err: any) {
      setCajaError(err?.response?.data?.detail ?? 'No se pudo crear la caja NAP');
    }
  }

  function handleEditarCaja(caja: CajaNap) {
    setEditandoCaja(caja);
    setEditCajaCodigo(caja.codigo);
    setEditCajaError(null);
  }

  async function handleGuardarEdicionCaja() {
    if (!editandoCaja) return;
    setEditCajaError(null);
    if (!editCajaCodigo.trim()) {
      setEditCajaError('El código es obligatorio.');
      return;
    }
    try {
      await updateCajaNap(editandoCaja.id, { codigo: editCajaCodigo.trim() });
      setEditandoCaja(null);
      if (mufaVer) setCajasDeMufa(await listCajasDeMufa(mufaVer.id));
      reload();
      toast.success('Caja NAP actualizada');
    } catch (err: any) {
      setEditCajaError(err?.response?.data?.detail ?? 'No se pudo editar la caja NAP');
    }
  }

  async function handleEliminarCaja() {
    if (!borrandoCaja) return;
    try {
      await deleteCajaNap(borrandoCaja.id);
      if (mufaVer) setCajasDeMufa(await listCajasDeMufa(mufaVer.id));
      reload();
      toast.success('Caja NAP eliminada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la caja NAP');
    }
  }

  if (!zona) return <CardBox>Cargando…</CardBox>;

  const disponibles = todosTecnicos.filter((t) => !tecnicos.some((tz) => tz.id === t.id));

  const totalMufas = mufas.length;
  const totalCajas = cajas.length;
  const todosLosBornes = cajas.flatMap((c) => c.bornes);
  const bornesLibres = todosLosBornes.filter((b) => b.estado === 'libre').length;
  const bornesOcupados = todosLosBornes.filter((b) => b.estado === 'ocupado').length;
  const bornesDanados = todosLosBornes.filter((b) => b.estado === 'danado').length;
  const pctOcupacion = todosLosBornes.length > 0 ? Math.round((bornesOcupados / todosLosBornes.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/zonas')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <h1 className="text-2xl flex-1">{zona.nombre}</h1>
        <Button variant="lightprimary" size="sm" onClick={handleAbrirEditarZona}>
          <Icon icon="tabler:pencil" height={16} className="mr-1" />
          Editar zona
        </Button>
      </div>

      <CardBox className="p-6">
        <h3 className="text-sm font-semibold mb-5 flex items-center gap-2">
          <Icon icon="tabler:topology-star-3" height={18} className="text-primary" />
          Resumen de infraestructura
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {todosLosBornes.length > 0 && (
            <div className="flex flex-col items-center gap-2 shrink-0">
              <RingProgress pct={pctOcupacion} tone={toneForPct(pctOcupacion)} size="lg" />
              <p className="text-xs text-muted-foreground text-center leading-tight">Ocupación<br />de bornes</p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-5 w-full">
            <StatTile icon="tabler:git-merge" label="Mufas" value={totalMufas} bg="bg-info/10" text="text-info" />
            <StatTile icon="tabler:box" label="Cajas NAP" value={totalCajas} bg="bg-primary/10" text="text-primary" />
            <StatTile icon="tabler:circle-check" label="Bornes libres" value={bornesLibres} bg="bg-success/10" text="text-success" />
            <StatTile icon="tabler:plug-connected" label="Ocupados" value={bornesOcupados} bg="bg-warning/10" text="text-warning" />
            <StatTile icon="tabler:alert-triangle" label="Dañados" value={bornesDanados} bg="bg-error/10" text="text-error" />
          </div>
        </div>
      </CardBox>

      <CardBox>
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-semibold">Mapa de Infraestructura</h3>
          {dibujandoTrazadoMufa ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">Dibujando trazado — {dibujandoTrazadoMufa.codigo}</span>
              <Button variant="outline" size="sm" onClick={handleDeshacerPuntoTrazado} disabled={puntosTrazado.length === 0}>
                <Icon icon="tabler:arrow-back-up" height={16} className="mr-1" />
                Deshacer
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancelarTrazado}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleGuardarTrazado} disabled={puntosTrazado.length < 2}>
                <Icon icon="tabler:check" height={16} className="mr-1" />
                Guardar trazado
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant={modoColocar === 'servidor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoColocar(modoColocar === 'servidor' ? null : 'servidor')}
              >
                <Icon icon="tabler:server-2" height={16} className="mr-1" />
                {zona.lat != null ? 'Reubicar servidor' : 'Marcar servidor'}
              </Button>
              <Button
                variant={modoColocar === 'mufa' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoColocar(modoColocar === 'mufa' ? null : 'mufa')}
              >
                <Icon icon="tabler:plus" height={16} className="mr-1" />
                Agregar mufa
              </Button>
            </div>
          )}
        </div>

        <MapaZona
          serverLat={zona.lat}
          serverLng={zona.lng}
          mufas={mufas}
          cajas={cajas}
          onMufaClick={handleVerMufa}
          modoColocar={modoColocar}
          onColocarPin={handleColocarPin}
          dibujandoTrazadoMufa={dibujandoTrazadoMufa}
          puntosTrazado={puntosTrazado}
          onAgregarPuntoTrazado={handleAgregarPuntoTrazado}
        />

        <div className="mt-5">
          {mufas.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin mufas registradas — usa "Agregar mufa" y toca el mapa donde está el empalme.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mufas.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleVerMufa(m)}
                className="flex items-center gap-3 rounded-lg border border-ld bg-muted/20 p-3.5 text-left hover:shadow-md hover:-translate-y-0.5 hover:border-info/40 transition-all"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-info font-bold text-sm">
                  M
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{m.codigo}</p>
                  <p className="text-xs text-muted-foreground">{m.total_cajas} caja{m.total_cajas === 1 ? '' : 's'} NAP</p>
                </div>
                <Icon icon="tabler:chevron-right" height={16} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </CardBox>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <CardBox className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tabler:shield-lock" height={18} className="text-primary" />
            Estado WireGuard
          </h3>
          {wg ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Estado</p>
                <Badge className={`${wg.online ? 'bg-lightsuccess text-success' : 'bg-lighterror text-error'} mt-1`}>
                  {wg.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">IP</p>
                <p className="text-sm mt-1">{wg.ip}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Peer WG</p>
                <p className="text-sm mt-1">{wg.wg_peer_online ? 'En línea' : 'Sin handshake reciente'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Último handshake</p>
                <p className="text-sm mt-1">{wg.last_handshake}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo consultar el estado (¿el backend tiene acceso a WireGuard?).</p>
          )}
        </CardBox>

        <CardBox className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tabler:users" height={18} className="text-primary" />
            Técnicos asignados
          </h3>
          <div className="flex flex-col gap-1.5 mb-4">
            {tecnicos.length === 0 && <p className="text-sm text-muted-foreground">Sin técnicos asignados todavía.</p>}
            {tecnicos.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-ld bg-muted/20 px-3 py-2">
                <span className="text-sm truncate">{t.nombre} <span className="text-xs text-muted-foreground">— {t.email}</span></span>
                <Button variant="ghost" size="icon" onClick={() => handleQuitar(t.id)} className="shrink-0 h-7 w-7">
                  <Icon icon="tabler:x" height={14} className="text-error" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Select value={seleccion} onValueChange={setSeleccion}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un técnico" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAsignar} disabled={!seleccion}>
              Asignar
            </Button>
          </div>
        </CardBox>
      </div>

      {/* Diálogo: crear mufa tras hacer click en el mapa */}
      <Dialog open={!!nuevaMufaCoords} onOpenChange={(o) => !o && setNuevaMufaCoords(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva mufa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Ubicación: {nuevaMufaCoords?.lat.toFixed(6)}, {nuevaMufaCoords?.lng.toFixed(6)}
            </p>
            <div>
              <Label htmlFor="mufaCodigo">Código</Label>
              <Input id="mufaCodigo" className="mt-2" placeholder="Z01-MUFA-01" value={mufaCodigo} onChange={(e) => setMufaCodigo(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="mufaDescripcion">Descripción (opcional)</Label>
              <Input id="mufaDescripcion" className="mt-2" placeholder="Poste frente al parque" value={mufaDescripcion} onChange={(e) => setMufaDescripcion(e.target.value)} />
            </div>
            {mufaError && <p className="text-sm text-error">{mufaError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevaMufaCoords(null)}>
              Cancelar
            </Button>
            <Button onClick={handleCrearMufa}>Guardar mufa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: cajas NAP de una mufa */}
      <Dialog open={!!mufaVer} onOpenChange={(o) => !o && setMufaVer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{mufaVer?.codigo} — Cajas NAP</DialogTitle>
          </DialogHeader>

          {/* Acciones de la mufa (trazado) — separadas de las cajas individuales */}
          <div className="flex flex-wrap gap-2 items-center pb-3 border-b border-ld">
            <Button variant="outline" size="sm" onClick={handleDibujarTrazado}>
              <Icon icon="tabler:route" height={16} className="mr-1" />
              {mufaVer?.trazado && mufaVer.trazado.length > 0 ? 'Editar trazado' : 'Dibujar trazado'}
            </Button>
            {mufaVer && mufaVer.trazado && mufaVer.trazado.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => mufaVer && setBorrandoTrazadoDe(mufaVer)}>
                <Icon icon="tabler:route-off" height={16} className="mr-1" />
                Eliminar trazado
              </Button>
            )}
            {cajasDeMufa.length === 0 ? (
              <Button variant="destructive" size="sm" onClick={() => mufaVer && setBorrandoMufa(mufaVer)}>
                <Icon icon="tabler:trash" height={16} className="mr-1" />
                Eliminar mufa
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                No se puede eliminar la mufa: tiene {cajasDeMufa.length} caja(s) — bórralas primero.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {cajasDeMufa.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Esta mufa todavía no tiene cajas NAP.
              </p>
            )}
            {cajasDeMufa.map((c) => (
              <div key={c.id} className="border border-ld rounded-lg p-3">
                <div className="flex justify-between items-center mb-2 gap-2">
                  <div>
                    <span className="font-medium text-sm">{c.codigo}</span>
                    <span className="text-xs text-muted-foreground ml-2">{c.bornes.filter((b) => b.estado === 'libre').length} libres</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleEditarCaja(c)} title="Editar">
                      <Icon icon="tabler:pencil" height={16} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setBorrandoCaja(c)} title="Eliminar">
                      <Icon icon="tabler:trash" height={16} className="text-error" />
                    </Button>
                  </div>
                </div>
                <BorneDots bornes={c.bornes} size="sm" />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMufaVer(null)}>
              Cerrar
            </Button>
            <Button size="sm" onClick={handleAgregarCajaEnMapa}>
              <Icon icon="tabler:map-pin-plus" height={16} className="mr-1" />
              Agregar caja aquí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar caja NAP */}
      <Dialog open={!!editandoCaja} onOpenChange={(o) => !o && setEditandoCaja(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar caja NAP</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="editCajaCodigo">Código</Label>
              <Input id="editCajaCodigo" className="mt-2" value={editCajaCodigo} onChange={(e) => setEditCajaCodigo(e.target.value)} required />
            </div>
            {editCajaError && <p className="text-sm text-error">{editCajaError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoCaja(null)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicionCaja}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: crear caja NAP tras hacer click en el mapa (dentro de una mufa) */}
      <Dialog open={!!nuevaCajaCoords} onOpenChange={(o) => !o && setNuevaCajaCoords(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva caja NAP — mufa {mufaContexto?.codigo}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Ubicación: {nuevaCajaCoords?.lat.toFixed(6)}, {nuevaCajaCoords?.lng.toFixed(6)}
            </p>
            <div>
              <Label htmlFor="cajaCodigo">Código</Label>
              <Input id="cajaCodigo" className="mt-2" value={cajaCodigo} onChange={(e) => setCajaCodigo(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="cajaCapacidad">Capacidad de bornes</Label>
              <Input id="cajaCapacidad" type="number" className="mt-2" value={cajaCapacidad} onChange={(e) => setCajaCapacidad(e.target.value)} />
            </div>
            {cajaError && <p className="text-sm text-error">{cajaError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevaCajaCoords(null)}>
              Cancelar
            </Button>
            <Button onClick={handleCrearCaja}>Guardar caja NAP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar datos básicos de la zona */}
      <Dialog open={editandoZona} onOpenChange={setEditandoZona}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar zona</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="editZonaNombre">Nombre</Label>
              <Input id="editZonaNombre" className="mt-2" value={editZonaNombre} onChange={(e) => setEditZonaNombre(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="editZonaDescripcion">Descripción</Label>
              <Textarea id="editZonaDescripcion" className="mt-2" value={editZonaDescripcion} onChange={(e) => setEditZonaDescripcion(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editZonaTiendas">Tiendas de pago</Label>
              <Textarea id="editZonaTiendas" className="mt-2" placeholder="Una por línea" value={editZonaTiendas} onChange={(e) => setEditZonaTiendas(e.target.value)} />
            </div>

            <div className="border-t border-ld pt-4">
              <p className="text-sm font-medium mb-1">Credenciales del MikroTik</p>
              <p className="text-xs text-muted-foreground mb-3">El router de esta zona — el túnel WireGuard que lo conecta al servidor central no se edita aquí.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editZonaIpLan">IP LAN</Label>
                  <Input id="editZonaIpLan" className="mt-2" value={editZonaIpLan} onChange={(e) => setEditZonaIpLan(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="editZonaIpRouter">IP del router</Label>
                  <Input id="editZonaIpRouter" className="mt-2" value={editZonaIpRouter} onChange={(e) => setEditZonaIpRouter(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="editZonaUsuarioMikrotik">Usuario</Label>
                  <Input id="editZonaUsuarioMikrotik" className="mt-2" value={editZonaUsuarioMikrotik} onChange={(e) => setEditZonaUsuarioMikrotik(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="editZonaPasswordMikrotik">Contraseña</Label>
                  <Input id="editZonaPasswordMikrotik" type="password" className="mt-2" placeholder="Dejar vacío para no cambiarla" value={editZonaPasswordMikrotik} onChange={(e) => setEditZonaPasswordMikrotik(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="editZonaRouterMikrotik">Modelo / nombre del router</Label>
                  <Input id="editZonaRouterMikrotik" className="mt-2" value={editZonaRouterMikrotik} onChange={(e) => setEditZonaRouterMikrotik(e.target.value)} />
                </div>
              </div>
            </div>

            {editZonaError && <p className="text-sm text-error">{editZonaError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoZona(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicionZona}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!borrandoTrazadoDe}
        onOpenChange={(v) => !v && setBorrandoTrazadoDe(null)}
        title="Eliminar trazado"
        description={borrandoTrazadoDe ? `¿Eliminar el trazado de ${borrandoTrazadoDe.codigo}?` : undefined}
        onConfirm={handleEliminarTrazado}
      />
      <ConfirmDialog
        open={!!borrandoMufa}
        onOpenChange={(v) => !v && setBorrandoMufa(null)}
        title="Eliminar mufa"
        description={borrandoMufa ? `¿Eliminar la mufa ${borrandoMufa.codigo}? Esta acción no se puede deshacer.` : undefined}
        onConfirm={handleEliminarMufa}
      />
      <ConfirmDialog
        open={!!borrandoCaja}
        onOpenChange={(v) => !v && setBorrandoCaja(null)}
        title="Eliminar caja NAP"
        description={borrandoCaja ? `¿Eliminar la caja NAP ${borrandoCaja.codigo}? Esta acción no se puede deshacer.` : undefined}
        onConfirm={handleEliminarCaja}
      />
    </div>
  );
};

export default ZonaDetail;
