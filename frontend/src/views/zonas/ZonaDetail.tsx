import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
  FormSection,
} from 'src/components/shared/form';
import BorneDots from 'src/components/apps/cajasnap/BorneDots';
import { toneForPct } from 'src/components/apps/cajasnap/RingProgress';
import MapaZona from 'src/components/apps/zonas/MapaZona';
import { listUsuarios } from 'src/lib/usuarios';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeAccion } from 'src/lib/permisos';
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


/** Iniciales para el avatar del técnico. */
function inicialesNombre(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const ZonaDetail = () => {
  const { id } = useParams();
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
  const [editZonaIpWireguard, setEditZonaIpWireguard] = useState('');
  const [editZonaError, setEditZonaError] = useState<string | null>(null);

  const { user } = useCurrentUser();
  /** Atención al cliente entra a consultar cobertura: ve el mapa, las mufas y
   *  las cajas, pero no toca infraestructura ni ve la red por dentro. */
  const puedeGestionar = puedeAccion('zonas.gestionar', user?.rol);
  const veRed = puedeAccion('zonas.verRed', user?.rol);
  const puedeAsignarTecnicos = puedeAccion('zonas.asignarTecnicos', user?.rol);

  async function reload() {
    if (!id) return;
    const z = await getZona(Number(id));
    setZona(z);
    // Los técnicos y el estado del túnel son datos de administración: a
    // quien no puede verlos, ni se le piden (el backend respondería 403).
    setTecnicos(veRed ? await listTecnicosZona(Number(id)).catch(() => []) : []);
    setMufas(await listMufas(Number(id)));
    setCajas(await listCajasNap(Number(id)));
    if (veRed) {
      wireguardStatus(Number(id))
        .then(setWg)
        .catch(() => setWg(null));
    }
  }

  useEffect(() => {
    if (user === null) return;   // esperar a saber el rol antes de pedir datos
    reload();
    if (puedeAsignarTecnicos) {
      listUsuarios()
        .then((all) => setTodosTecnicos(all.filter((u) => u.rol === 'tecnico')))
        .catch(() => setTodosTecnicos([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.rol]);

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
    setEditZonaIpWireguard(zona.ip_wireguard ?? '');
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
        ip_wireguard: editZonaIpWireguard.trim() || undefined,
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
    <div>
      <PageHeader
        titulo={zona.nombre}
        descripcion={
          veRed
            ? 'Infraestructura de la zona: servidor, mufas, cajas NAP y técnicos.'
            : 'Cobertura de la zona: mufas y cajas NAP sobre el mapa.'
        }
        icono="tabler:map-pin"
        volver={{ a: '/zonas', texto: 'Volver a zonas' }}
        acciones={
          puedeGestionar ? (
            <Button variant="lightprimary" size="sm" onClick={handleAbrirEditarZona} className="gap-1.5">
              <Icon icon="tabler:pencil" height={16} />
              Editar zona
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            icono="tabler:chart-donut"
            etiqueta="Ocupación"
            valor={`${pctOcupacion}%`}
            nota={`${bornesOcupados} de ${todosLosBornes.length} bornes`}
            tono={toneForPct(pctOcupacion)}
          />
          <StatCard icono="tabler:git-merge" etiqueta="Mufas" valor={totalMufas} tono="info" />
          <StatCard icono="tabler:box" etiqueta="Cajas NAP" valor={totalCajas} tono="primary" />
          <StatCard icono="tabler:circle-check" etiqueta="Bornes libres" valor={bornesLibres} tono="success" />
          <StatCard icono="tabler:plug-connected" etiqueta="Ocupados" valor={bornesOcupados} tono="warning" />
          <StatCard icono="tabler:alert-triangle" etiqueta="Dañados" valor={bornesDanados} tono="error" />
        </div>

        <SectionCard
          titulo="Mapa de infraestructura"
          icono="tabler:map-2"
          descripcion="Servidor, mufas y cajas NAP ubicadas en el terreno."
          extra={
            dibujandoTrazadoMufa && (
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
            )
          }
        >

        {/* Los botones de "Reubicar servidor" / "Agregar mufa" viven dentro
            del propio mapa (junto al selector Calle/Satélite), no acá arriba:
            así siguen alcanzables cuando el mapa entra en pantalla completa. */}
        <MapaZona
          serverLat={zona.lat}
          serverLng={zona.lng}
          mufas={mufas}
          cajas={cajas}
          onMufaClick={handleVerMufa}
          modoColocar={modoColocar}
          onColocarPin={handleColocarPin}
          onCambiarModo={setModoColocar}
          puedeGestionar={puedeGestionar}
          dibujandoTrazadoMufa={dibujandoTrazadoMufa}
          puntosTrazado={puntosTrazado}
          onAgregarPuntoTrazado={handleAgregarPuntoTrazado}
        />

        </SectionCard>

        <SectionCard
          titulo="Mufas de la zona"
          icono="tabler:git-merge"
          descripcion={`${totalMufas} mufa${totalMufas === 1 ? '' : 's'} · ${totalCajas} caja${totalCajas === 1 ? '' : 's'} NAP`}
        >
          {mufas.length === 0 ? (
            <EmptyState
              icono="tabler:git-merge"
              titulo="Sin mufas registradas"
              descripcion='Usa "Agregar mufa" y toca el mapa donde está el empalme.'
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mufas.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleVerMufa(m)}
                  className="transition-ui flex items-center gap-3 rounded-xl border border-ld bg-surface-2 p-3.5 text-left hover:border-info/45 hover:shadow-md"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lightinfo text-sm font-bold text-info-text">
                    M
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.codigo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.total_cajas} caja{m.total_cajas === 1 ? '' : 's'} NAP
                    </span>
                  </span>
                  <Icon icon="tabler:chevron-right" height={16} className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {veRed && (
          <SectionCard
            titulo="Estado WireGuard"
            icono="tabler:shield-lock"
            descripcion="Túnel entre el servidor central y el router de la zona."
            extra={
              wg && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    wg.online ? 'bg-lightsuccess text-success-text' : 'bg-lighterror text-error-text'
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${wg.online ? 'animate-pulse bg-success' : 'bg-error'}`}
                  />
                  {wg.status}
                </span>
              )
            }
          >
            {wg ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-ld bg-surface-2 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    IP del router
                  </p>
                  <p className="mt-0.5 font-mono text-sm">{wg.ip}</p>
                </div>
                <div className="rounded-xl border border-ld bg-surface-2 px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Peer WireGuard
                  </p>
                  <p
                    className={`mt-0.5 text-sm font-medium ${wg.wg_peer_online ? 'text-success-text' : 'text-muted-foreground'}`}
                  >
                    {wg.wg_peer_online ? 'En línea' : 'Sin handshake reciente'}
                  </p>
                </div>
                <div className="rounded-xl border border-ld bg-surface-2 px-3.5 py-2.5 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Último handshake
                  </p>
                  <p className="mt-0.5 text-sm">{wg.last_handshake}</p>
                </div>
              </div>
            ) : (
              <EmptyState
                icono="tabler:plug-connected-x"
                titulo="No se pudo consultar el estado"
                descripcion="¿El backend tiene acceso a WireGuard?"
              />
            )}
          </SectionCard>
          )}

          {/* La lista lleva el teléfono y el DNI del técnico: es dato
              personal del trabajador, solo para administración. */}
          {veRed && (
          <SectionCard
            titulo="Técnicos asignados"
            icono="tabler:users"
            descripcion={`${tecnicos.length} técnico${tecnicos.length === 1 ? '' : 's'} atendiendo esta zona`}
          >
            <div className="flex flex-col gap-2.5">
              {tecnicos.length === 0 ? (
                <EmptyState
                  icono="tabler:user-off"
                  titulo="Sin técnicos asignados"
                  descripcion="Elige uno abajo para que pueda atender instalaciones y averías de esta zona."
                />
              ) : (
                tecnicos.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ld bg-surface-2 px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lightprimary text-[11px] font-bold text-primary-text">
                        {inicialesNombre(t.nombre)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.email}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleQuitar(t.id)}
                      title="Quitar de la zona"
                      aria-label={`Quitar a ${t.nombre} de la zona`}
                      className="size-8 shrink-0"
                    >
                      <Icon icon="tabler:x" height={15} className="text-error" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Select value={seleccion} onValueChange={setSeleccion}>
                <SelectTrigger className="min-w-48 flex-1">
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
              <Button onClick={handleAsignar} disabled={!seleccion} className="gap-1.5">
                <Icon icon="tabler:user-plus" height={16} />
                Asignar
              </Button>
            </div>
          </SectionCard>
          )}
        </div>
      </div>

      {/* Diálogo: crear mufa tras hacer click en el mapa */}
      <FormDialog
        open={!!nuevaMufaCoords}
        onOpenChange={(o) => !o && setNuevaMufaCoords(null)}
        title="Nueva mufa"
        subtitle={
          nuevaMufaCoords
            ? `Ubicación: ${nuevaMufaCoords.lat.toFixed(6)}, ${nuevaMufaCoords.lng.toFixed(6)}`
            : undefined
        }
        icon="tabler:git-fork"
        size="md"
        footer={
          <FormActions
            onCancel={() => setNuevaMufaCoords(null)}
            submitLabel="Guardar mufa"
            onSubmit={handleCrearMufa}
          />
        }
      >
        <FormGrid>
          <FormField label="Código" icon="tabler:hash" htmlFor="mufaCodigo" required wide>
            <FieldIcon icon="tabler:hash">
              <Input
                id="mufaCodigo"
                placeholder="Z01-MUFA-01"
                value={mufaCodigo}
                onChange={(e) => setMufaCodigo(e.target.value)}
                required
              />
            </FieldIcon>
          </FormField>
          <FormField
            label="Descripción (opcional)"
            icon="tabler:file-description"
            htmlFor="mufaDescripcion"
            wide
          >
            <FieldIcon icon="tabler:file-description">
              <Input
                id="mufaDescripcion"
                placeholder="Poste frente al parque"
                value={mufaDescripcion}
                onChange={(e) => setMufaDescripcion(e.target.value)}
              />
            </FieldIcon>
          </FormField>
          {mufaError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{mufaError}</FormCallout>
            </div>
          )}
        </FormGrid>
      </FormDialog>

      {/* Diálogo: cajas NAP de una mufa */}
      <FormDialog
        open={!!mufaVer}
        onOpenChange={(o) => !o && setMufaVer(null)}
        title={`${mufaVer?.codigo ?? ''} — Cajas NAP`}
        subtitle="Trazado y cajas colgadas de esta mufa"
        icon="tabler:git-fork"
        tone="primary"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setMufaVer(null)} className="gap-2">
              <Icon icon="tabler:x" width={17} />
              Cerrar
            </Button>
            <Button onClick={handleAgregarCajaEnMapa} className="gap-2">
              <Icon icon="tabler:map-pin-plus" width={17} />
              Agregar caja aquí
            </Button>
          </>
        }
      >

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

      </FormDialog>

      {/* Diálogo: editar caja NAP */}
      <FormDialog
        open={!!editandoCaja}
        onOpenChange={(o) => !o && setEditandoCaja(null)}
        title="Editar caja NAP"
        subtitle={editandoCaja?.codigo}
        icon="tabler:edit"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setEditandoCaja(null)}
            submitLabel="Guardar"
            onSubmit={handleGuardarEdicionCaja}
          />
        }
      >
        <FormField label="Código" icon="tabler:hash" htmlFor="editCajaCodigo" required>
          <FieldIcon icon="tabler:hash">
            <Input
              id="editCajaCodigo"
              value={editCajaCodigo}
              onChange={(e) => setEditCajaCodigo(e.target.value)}
              required
            />
          </FieldIcon>
        </FormField>
        {editCajaError && (
          <div className="mt-4">
            <FormCallout tone="error">{editCajaError}</FormCallout>
          </div>
        )}
      </FormDialog>

      {/* Diálogo: crear caja NAP tras hacer click en el mapa (dentro de una mufa) */}
      <FormDialog
        open={!!nuevaCajaCoords}
        onOpenChange={(o) => !o && setNuevaCajaCoords(null)}
        title={`Nueva caja NAP — mufa ${mufaContexto?.codigo ?? ''}`}
        subtitle={
          nuevaCajaCoords
            ? `Ubicación: ${nuevaCajaCoords.lat.toFixed(6)}, ${nuevaCajaCoords.lng.toFixed(6)}`
            : undefined
        }
        icon="tabler:box"
        size="md"
        footer={
          <FormActions
            onCancel={() => setNuevaCajaCoords(null)}
            submitLabel="Guardar caja NAP"
            onSubmit={handleCrearCaja}
          />
        }
      >
        <FormGrid>
          <FormField label="Código" icon="tabler:hash" htmlFor="cajaCodigo" required>
            <FieldIcon icon="tabler:hash">
              <Input
                id="cajaCodigo"
                value={cajaCodigo}
                onChange={(e) => setCajaCodigo(e.target.value)}
                required
              />
            </FieldIcon>
          </FormField>
          <FormField label="Capacidad de bornes" icon="tabler:plug" htmlFor="cajaCapacidad">
            <Input
              id="cajaCapacidad"
              type="number"
              value={cajaCapacidad}
              onChange={(e) => setCajaCapacidad(e.target.value)}
            />
          </FormField>
          {cajaError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{cajaError}</FormCallout>
            </div>
          )}
        </FormGrid>
      </FormDialog>

      {/* Diálogo: editar datos básicos de la zona */}
      <FormDialog
        open={editandoZona}
        onOpenChange={setEditandoZona}
        title="Editar zona"
        subtitle="Datos de la zona y credenciales del router"
        icon="tabler:edit"
        tone="primary"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setEditandoZona(false)}
            submitLabel="Guardar"
            onSubmit={handleGuardarEdicionZona}
          />
        }
      >
        <FormGrid>
          <FormSection title="Datos de la zona" icon="tabler:map-pin">
            <FormField label="Nombre" htmlFor="editZonaNombre" required wide>
              <FieldIcon icon="tabler:map-pin">
                <Input
                  id="editZonaNombre"
                  value={editZonaNombre}
                  onChange={(e) => setEditZonaNombre(e.target.value)}
                  required
                />
              </FieldIcon>
            </FormField>
            <FormField label="Descripción" htmlFor="editZonaDescripcion" wide>
              <Textarea
                id="editZonaDescripcion"
                value={editZonaDescripcion}
                onChange={(e) => setEditZonaDescripcion(e.target.value)}
              />
            </FormField>
            <FormField label="Tiendas de pago" htmlFor="editZonaTiendas" wide hint="Una por línea.">
              <Textarea
                id="editZonaTiendas"
                placeholder="Una por línea"
                value={editZonaTiendas}
                onChange={(e) => setEditZonaTiendas(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Red de la zona"
            icon="tabler:router"
            hint="Se completa cuando el router ya está instalado"
          >
            <FormField
              label="IP de WireGuard"
              htmlFor="editZonaIpWireguard"
              wide
              hint="La del túnel con el servidor central. Déjala vacía mientras la zona no esté conectada."
            >
              <FieldIcon icon="tabler:shield-lock">
                <Input
                  id="editZonaIpWireguard"
                  placeholder="10.10.0.5"
                  value={editZonaIpWireguard}
                  onChange={(e) => setEditZonaIpWireguard(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="IP LAN" htmlFor="editZonaIpLan">
              <FieldIcon icon="tabler:network">
                <Input
                  id="editZonaIpLan"
                  value={editZonaIpLan}
                  onChange={(e) => setEditZonaIpLan(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="IP del router" htmlFor="editZonaIpRouter">
              <FieldIcon icon="tabler:router">
                <Input
                  id="editZonaIpRouter"
                  value={editZonaIpRouter}
                  onChange={(e) => setEditZonaIpRouter(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="Usuario" htmlFor="editZonaUsuarioMikrotik">
              <FieldIcon icon="tabler:user">
                <Input
                  id="editZonaUsuarioMikrotik"
                  value={editZonaUsuarioMikrotik}
                  onChange={(e) => setEditZonaUsuarioMikrotik(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="Contraseña" htmlFor="editZonaPasswordMikrotik">
              <FieldIcon icon="tabler:key">
                <Input
                  id="editZonaPasswordMikrotik"
                  type="password"
                  placeholder="Dejar vacío para no cambiarla"
                  value={editZonaPasswordMikrotik}
                  onChange={(e) => setEditZonaPasswordMikrotik(e.target.value)}
                />
              </FieldIcon>
            </FormField>
            <FormField label="Modelo / nombre del router" htmlFor="editZonaRouterMikrotik" wide>
              <FieldIcon icon="tabler:device-desktop">
                <Input
                  id="editZonaRouterMikrotik"
                  value={editZonaRouterMikrotik}
                  onChange={(e) => setEditZonaRouterMikrotik(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormSection>

          {editZonaError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{editZonaError}</FormCallout>
            </div>
          )}
        </FormGrid>
      </FormDialog>

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
