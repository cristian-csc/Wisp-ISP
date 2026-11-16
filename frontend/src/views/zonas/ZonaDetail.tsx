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
import CampoCoordenadas from 'src/components/shared/mapa/CampoCoordenadas';
import { listUsuarios } from 'src/lib/usuarios';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeAccion } from 'src/lib/permisos';
import type { Usuario } from 'src/lib/api';
import {
  getZona,
  wireguardStatus,
  wireguardReciente,
  listTecnicosZona,
  asignarTecnicoZona,
  quitarTecnicoZona,
  updateZonaDatos,
  datosDelRouter,
  type DatosDelRouter,
  type Zona,
  type WireguardStatus,
  type Tecnico,
} from 'src/lib/zonas';
import {
  listMufas,
  createMufa,
  updateMufa,
  deleteMufa,
  crearCorrida,
  actualizarCorrida,
  borrarCorrida,
  COLORES_CORRIDA,
  type Corrida,
  type Mufa,
  type TrazadoPunto,
} from 'src/lib/mufas';
import { metrosDeTrazado, metrosEnTexto } from 'src/lib/coordenadas';
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


/** Lo que el router contestó para ese campo, como botones.
 *
 *  Es la diferencia entre escribir "CORTE MOROSOS" y elegir "CORTE MOROSO":
 *  lo primero no da ningún error, el cortado entra en una lista que ninguna
 *  regla del firewall consulta, y sigue navegando sin pagar hasta que alguien
 *  mire el dinero. Mientras no se haya leído el router no se pinta nada.
 */
function OpcionesDelRouter({
  opciones,
  valor,
  onElegir,
  vacio,
}: {
  opciones?: string[];
  valor: string;
  onElegir: (v: string) => void;
  vacio: string;
}) {
  if (!opciones) return null;
  if (opciones.length === 0) {
    return <p className="mt-1.5 text-[11px] text-warning-text">{vacio}</p>;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">En el router:</span>
      {opciones.map((o) => {
        const elegido = valor === o || valor === o.split(' ')[0];
        return (
          <button
            key={o}
            type="button"
            onClick={() => onElegir(o)}
            aria-pressed={elegido}
            className={`transition-ui rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              elegido
                ? 'border-primary bg-lightprimary text-primary-text'
                : 'border-ld text-muted-foreground hover:border-primary/50 hover:text-primary-text'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

const ZonaDetail = () => {
  const { id } = useParams();
  const [zona, setZona] = useState<Zona | null>(null);
  /** Igual que en la lista: si se leyo hace poco, la ficha abre con el estado
   *  puesto en vez de parpadear "no se pudo consultar" mientras llega. */
  const [wg, setWg] = useState<WireguardStatus | null>(
    () => (id ? wireguardReciente(Number(id)) : null),
  );
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
  const [borrandoCorrida, setBorrandoCorrida] = useState<{ mufa: Mufa; corrida: Corrida } | null>(null);
  const [borrandoMufa, setBorrandoMufa] = useState<Mufa | null>(null);
  const [borrandoCaja, setBorrandoCaja] = useState<CajaNap | null>(null);

  const [nuevaCajaCoords, setNuevaCajaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cajaCodigo, setCajaCodigo] = useState('');
  const [cajaCapacidad, setCajaCapacidad] = useState('8');
  const [cajaError, setCajaError] = useState<string | null>(null);

  const [dibujandoTrazadoMufa, setDibujandoTrazadoMufa] = useState<Mufa | null>(null);
  const [puntosTrazado, setPuntosTrazado] = useState<TrazadoPunto[]>([]);
  /** Si no es null, lo que se dibuja reemplaza a esa corrida en vez de crear una. */
  const [corridaEditando, setCorridaEditando] = useState<Corrida | null>(null);
  const [guardandoCorrida, setGuardandoCorrida] = useState(false);
  const [corridaNombre, setCorridaNombre] = useState('');
  const [corridaColor, setCorridaColor] = useState<string>(COLORES_CORRIDA[0].valor);
  const [corridaMetros, setCorridaMetros] = useState('');
  const [corridaError, setCorridaError] = useState<string | null>(null);

  /** Los metros escritos, dichos tambien en kilometros: el ingeniero habla
   *  de corridas de 500 m y de 1.5 km, y asi no hay que dividir de cabeza. */
  const corridaEnKm =
    corridaMetros.trim() !== '' && Number.isFinite(Number(corridaMetros)) && Number(corridaMetros) >= 1000
      ? metrosEnTexto(Number(corridaMetros))
      : null;

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
  const [editZonaPool, setEditZonaPool] = useState('');
  const [editZonaListaCorte, setEditZonaListaCorte] = useState('');
  const [editZonaError, setEditZonaError] = useState<string | null>(null);
  /** Lo que contestó el router la última vez que se le preguntó. */
  const [datosRouter, setDatosRouter] = useState<DatosDelRouter | null>(null);
  const [leyendoRouter, setLeyendoRouter] = useState(false);

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
      // Lo leído hace poco se pinta y punto: evita el parpadeo al entrar y
      // salir de la zona, y no repite el ping ni la consulta a la VPS.
      const guardado = wireguardReciente(Number(id));
      if (guardado) setWg(guardado);
      else wireguardStatus(Number(id)).then(setWg).catch(() => setWg(null));
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
    setEditZonaPool(zona.pool_pppoe ?? '');
    setEditZonaListaCorte(zona.lista_corte ?? '');
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
        pool_pppoe: editZonaPool.trim() || undefined,
        lista_corte: editZonaListaCorte.trim() || undefined,
      });
      setEditandoZona(false);
      reload();
      toast.success('Zona actualizada');
    } catch (err: any) {
      setEditZonaError(err?.response?.data?.detail ?? 'No se pudo editar la zona');
    }
  }

  /** Le pregunta al MikroTik lo que hoy se escribe a mano.
   *
   *  Rellena solo lo que esté vacío o lo que el router diga sin ambigüedad: si
   *  hay varios pools o varias listas, se dejan como botones para elegir. Un
   *  pool o una lista de corte mal puestos no dan error —el cliente se queda
   *  sin IP, o sigue navegando sin pagar— y por eso nada se adivina. */
  async function handleLeerDelRouter() {
    if (!id) return;
    setLeyendoRouter(true);
    setEditZonaError(null);
    try {
      const d = await datosDelRouter(Number(id));
      setDatosRouter(d);

      const puestos: string[] = [];
      if (d.router_mikrotik) {
        setEditZonaRouterMikrotik(d.router_mikrotik);
        puestos.push('modelo y nombre');
      }
      if (d.pool_sugerido) {
        setEditZonaPool(d.pool_sugerido);
        puestos.push(`pool ${d.pool_sugerido}`);
      }
      if (d.lista_sugerida) {
        setEditZonaListaCorte(d.lista_sugerida);
        puestos.push(`lista ${d.lista_sugerida}`);
      }
      // La IP LAN solo si no hay duda: la del túnel no cuenta, y con varias
      // interfaces no hay forma de saber cuál es la de los clientes.
      const candidatas = d.direcciones.filter(
        (x) => x.address !== `${zona?.ip_wireguard ?? ''}/32` && !x.address.startsWith('127.'),
      );
      if (!editZonaIpLan.trim() && candidatas.length === 1) {
        setEditZonaIpLan(candidatas[0].address);
        puestos.push('IP LAN');
      }

      if (puestos.length > 0) {
        toast.success(`Leído del router: ${puestos.join(', ')}.`);
      } else {
        toast.info('El router contestó, pero no había nada claro que rellenar. Elige abajo.');
      }
    } catch (err: any) {
      setEditZonaError(err?.response?.data?.detail ?? 'No se pudo leer el router');
    } finally {
      setLeyendoRouter(false);
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

  /** Corregir el sitio de algo que ya estaba puesto, arrastrandolo en el mapa.
   *  Antes habia que borrarlo y volver a crearlo, y con una caja NAP eso se
   *  lleva por delante sus bornes y lo que estuviera anotado en ellos. */
  async function handleMoverServidor(lat: number, lng: number) {
    if (!id) return;
    try {
      await updateZonaDatos(Number(id), { lat, lng });
      reload();
      toast.success('Servidor movido');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo mover el servidor');
    }
  }

  async function handleMoverMufa(mufa: Mufa, lat: number, lng: number) {
    try {
      await updateMufa(mufa.id, { lat, lng });
      reload();
      toast.success(`Mufa ${mufa.codigo} movida`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo mover la mufa');
    }
  }

  async function handleMoverCaja(caja: CajaNap, lat: number, lng: number) {
    try {
      await updateCajaNap(caja.id, { lat, lng });
      reload();
      toast.success(`Caja ${caja.codigo} movida`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo mover la caja');
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

  /** Colgar una caja NAP de esa mufa: nace en el centro del mapa y se abre
   *  el formulario corto. Se llega aca desde el panel de mufas del mapa o
   *  desde la ficha de la mufa, que hacen lo mismo. */
  function handleAgregarCajaAMufa(mufa: Mufa) {
    setMufaContexto(mufa);
    setMufaVer(null);
    setModoColocar('caja');
  }

  function handleAgregarCajaEnMapa() {
    if (!mufaVer) return;
    handleAgregarCajaAMufa(mufaVer);
  }

  /** Empieza a dibujar una corrida de esa mufa. Sin corrida, es una nueva;
   *  con una, se redibuja esa. */
  function handleDibujarCorridaDeMufa(mufa: Mufa, corrida?: Corrida) {
    setCorridaEditando(corrida ?? null);
    setDibujandoTrazadoMufa(mufa);
    setPuntosTrazado(corrida?.trazado ?? []);
    setMufaVer(null);
  }

  /** Lo mismo, desde la ficha de la mufa que esta abierta. */
  function handleDibujarCorrida(corrida?: Corrida) {
    if (!mufaVer) return;
    handleDibujarCorridaDeMufa(mufaVer, corrida);
  }

  /** La mufa recién leída del servidor, no la copia que se guardó al abrir el
   *  diálogo: las corridas de esa copia pueden estar viejas. */
  function mufaAlDia(id: number): Mufa | undefined {
    return mufas.find((m) => m.id === id);
  }

  /** Al terminar de dibujar no se guarda directo: primero se le pone nombre,
   *  color y metraje, que es lo que distingue una corrida de un garabato. */
  function handleTerminarDibujo() {
    if (!dibujandoTrazadoMufa) return;
    const mufa = mufaAlDia(dibujandoTrazadoMufa.id);
    const yaHay = mufa?.corridas?.length ?? 0;
    const usados = new Set((mufa?.corridas ?? []).map((c) => c.color));
    const libre = COLORES_CORRIDA.find((c) => !usados.has(c.valor));

    setCorridaNombre(corridaEditando?.nombre ?? `Corrida ${yaHay + 1}`);
    setCorridaColor(corridaEditando?.color ?? libre?.valor ?? COLORES_CORRIDA[0].valor);
    const medidos = metrosDeTrazado(puntosTrazado);
    setCorridaMetros(medidos != null ? String(Math.round(medidos)) : '');
    setCorridaError(null);
    setGuardandoCorrida(true);
  }

  async function handleConfirmarCorrida() {
    if (!dibujandoTrazadoMufa) return;
    // El nombre ya no se escribe a mano (se numera solo al terminar de
    // dibujar), asi que aca solo se cubre el caso de que llegara vacio.
    const nombre = corridaNombre.trim() || `Corrida ${(mufaAlDia(dibujandoTrazadoMufa.id)?.corridas?.length ?? 0) + 1}`;
    const metros = corridaMetros.trim() === '' ? undefined : Number(corridaMetros);
    if (metros !== undefined && (!Number.isFinite(metros) || metros < 0)) {
      setCorridaError('Los metros tienen que ser un número.');
      return;
    }
    try {
      const datos = {
        nombre,
        color: corridaColor,
        metros,
        trazado: puntosTrazado,
      };
      if (corridaEditando) {
        await actualizarCorrida(dibujandoTrazadoMufa.id, corridaEditando.id, datos);
      } else {
        await crearCorrida(dibujandoTrazadoMufa.id, datos);
      }
      setGuardandoCorrida(false);
      setDibujandoTrazadoMufa(null);
      setCorridaEditando(null);
      setPuntosTrazado([]);
      reload();
      toast.success(corridaEditando ? 'Corrida actualizada' : 'Corrida guardada');
    } catch (err: any) {
      setCorridaError(err?.response?.data?.detail ?? 'No se pudo guardar la corrida');
    }
  }

  async function handleEliminarCorrida() {
    if (!borrandoCorrida) return;
    try {
      await borrarCorrida(borrandoCorrida.mufa.id, borrandoCorrida.corrida.id);
      setBorrandoCorrida(null);
      setMufaVer(null);
      reload();
      toast.success('Corrida eliminada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la corrida');
      setBorrandoCorrida(null);
    }
  }

  function handleAgregarPuntoTrazado(lat: number, lng: number) {
    setPuntosTrazado((prev) => [...prev, { lat, lng }]);
  }

  function handleDeshacerPuntoTrazado() {
    setPuntosTrazado((prev) => prev.slice(0, -1));
  }


  function handleCancelarTrazado() {
    setDibujandoTrazadoMufa(null);
    setCorridaEditando(null);
    setPuntosTrazado([]);
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
                <span className="text-xs text-muted-foreground">
                  {corridaEditando ? `Redibujando ${corridaEditando.nombre}` : 'Dibujando corrida'} — mufa{' '}
                  {dibujandoTrazadoMufa.codigo}
                </span>
                <Button variant="outline" size="sm" onClick={handleDeshacerPuntoTrazado} disabled={puntosTrazado.length === 0}>
                  <Icon icon="tabler:arrow-back-up" height={16} className="mr-1" />
                  Deshacer
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelarTrazado}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleTerminarDibujo} disabled={puntosTrazado.length < 2}>
                  <Icon icon="tabler:check" height={16} className="mr-1" />
                  Terminar
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
          onMoverServidor={handleMoverServidor}
          onMoverMufa={handleMoverMufa}
          onMoverCaja={handleMoverCaja}
          onAgregarCajaAMufa={handleAgregarCajaAMufa}
          onDibujarCorridaMufa={(m) => handleDibujarCorridaDeMufa(m)}
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
          <CampoCoordenadas valor={nuevaMufaCoords} onChange={setNuevaMufaCoords} />
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
        subtitle="Corridas y cajas colgadas de esta mufa"
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

        {/* Las corridas de esta mufa: cada una con su color, su metraje y la
            posibilidad de redibujarla sin perder las demás. */}
        <div className="flex flex-col gap-2 pb-3 border-b border-ld">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Corridas</span>
            <Button variant="outline" size="sm" onClick={() => handleDibujarCorrida()}>
              <Icon icon="tabler:route" height={16} className="mr-1" />
              Dibujar corrida
            </Button>
          </div>

          {(mufaVer?.corridas?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todavía no hay corridas. Dibuja una tocando las cajas en el orden en que las une el
              cable.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(mufaVer?.corridas ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-ld bg-surface-2 px-2.5 py-1.5"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium">{c.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.metros != null ? metrosEnTexto(c.metros) : 'sin metraje'}
                    {c.trazado ? ` · ${c.trazado.length} puntos` : ''}
                  </span>
                  <div className="ml-auto flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Redibujar"
                      onClick={() => handleDibujarCorrida(c)}
                    >
                      <Icon icon="tabler:pencil" height={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Eliminar corrida"
                      onClick={() => mufaVer && setBorrandoCorrida({ mufa: mufaVer, corrida: c })}
                    >
                      <Icon icon="tabler:trash" height={16} className="text-error" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cajasDeMufa.length === 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-fit"
              onClick={() => mufaVer && setBorrandoMufa(mufaVer)}
            >
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
        subtitle="Queda puesta en el centro del mapa; después se arrastra a su sitio."
        icon="tabler:box"
        size="sm"
        footer={
          <FormActions
            onCancel={() => setNuevaCajaCoords(null)}
            submitLabel="Guardar caja NAP"
            onSubmit={handleCrearCaja}
          />
        }
      >
        {/* Solo el nombre y los bornes: lo demás de la caja (sus bornes uno a
            uno, quién está colgado de cada uno) se ve y se edita abajo, en
            "Mufas de la zona". El mapa es para ubicarla, no para llenarla. */}
        <FormGrid className="md:grid-cols-1">
          <FormField label="Código" icon="tabler:hash" htmlFor="cajaCodigo" required>
            <FieldIcon icon="tabler:hash">
              <Input
                id="cajaCodigo"
                placeholder="CAJA-01"
                value={cajaCodigo}
                onChange={(e) => setCajaCodigo(e.target.value)}
                required
              />
            </FieldIcon>
          </FormField>
          <FormField label="Capacidad de bornes" icon="tabler:plug" htmlFor="cajaCapacidad">
            <FieldIcon icon="tabler:plug">
              <Input
                id="cajaCapacidad"
                type="number"
                min={1}
                value={cajaCapacidad}
                onChange={(e) => setCajaCapacidad(e.target.value)}
              />
            </FieldIcon>
          </FormField>
          {cajaError && <FormCallout tone="error">{cajaError}</FormCallout>}
        </FormGrid>
      </FormDialog>

      {/* Diálogo: el metraje y el color de la corrida recién dibujada */}
      <FormDialog
        open={guardandoCorrida}
        onOpenChange={(o) => !o && setGuardandoCorrida(false)}
        title={corridaEditando ? `Editar ${corridaEditando.nombre}` : corridaNombre || 'Nueva corrida'}
        subtitle={`${puntosTrazado.length} puntos dibujados — mufa ${dibujandoTrazadoMufa?.codigo ?? ''}`}
        icon="tabler:route"
        tone="primary"
        size="sm"
        footer={
          <FormActions
            onCancel={() => setGuardandoCorrida(false)}
            cancelLabel="Seguir dibujando"
            submitLabel="Guardar corrida"
            onSubmit={handleConfirmarCorrida}
          />
        }
      >
        {/* Dos cosas y nada más: cuánto mide y de qué color va en el plano.
            El nombre se pone solo ("Corrida 1", "Corrida 2") al terminar de
            dibujar, que es como las numera el ingeniero. */}
        <FormGrid className="md:grid-cols-1">
          <FormField
            label="Metros de cable"
            icon="tabler:ruler-measure"
            htmlFor="corridaMetros"
            hint={
              corridaEnKm
                ? `${corridaEnKm} — medido del dibujo en línea recta; si sabes el real, corrígelo.`
                : 'Sale medido del dibujo, en línea recta. Si sabes el real, corrígelo.'
            }
          >
            <FieldIcon icon="tabler:ruler-measure">
              <Input
                id="corridaMetros"
                type="number"
                min={0}
                value={corridaMetros}
                onChange={(e) => setCorridaMetros(e.target.value)}
              />
            </FieldIcon>
          </FormField>
          <FormField label="Color" icon="tabler:palette">
            <div className="flex flex-wrap gap-2">
              {COLORES_CORRIDA.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCorridaColor(c.valor)}
                  aria-label={c.nombre}
                  aria-pressed={corridaColor === c.valor}
                  title={c.nombre}
                  className={`h-8 w-8 rounded-full border-2 transition-ui ${
                    corridaColor === c.valor
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: c.valor }}
                />
              ))}
            </div>
          </FormField>
          {corridaError && (
            <div className="md:col-span-2">
              <FormCallout tone="error">{corridaError}</FormCallout>
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
            {/* Con el túnel levantado no hace falta escribir nada de esto a
                mano: el router lo sabe y lo dice. */}
            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLeerDelRouter}
                disabled={leyendoRouter || !zona?.ip_wireguard}
                title={
                  zona?.ip_wireguard
                    ? 'Preguntarle al MikroTik su modelo, pools y listas'
                    : 'Hace falta el túnel: es el camino hasta el router'
                }
                className="gap-1.5"
              >
                <Icon
                  icon={leyendoRouter ? 'tabler:loader-2' : 'tabler:download'}
                  height={16}
                  className={leyendoRouter ? 'animate-spin' : undefined}
                />
                {leyendoRouter ? 'Preguntando al router…' : 'Leer del router'}
              </Button>
              {datosRouter?.version && (
                <span className="text-xs text-muted-foreground">
                  RouterOS {datosRouter.version}
                </span>
              )}
              {!zona?.ip_wireguard && (
                <span className="text-xs text-muted-foreground">
                  Primero el túnel: es por donde el sistema llega al router.
                </span>
              )}
            </div>
            <FormField
              label="IP de WireGuard"
              htmlFor="editZonaIpWireguard"
              wide
              aviso={
                <>
                  <b>Déjala vacía mientras la zona no esté conectada.</b> Es la IP
                  del túnel con el servidor central, y en cuanto la pongas el
                  sistema dará por hecho que puede llegar al router por ahí.
                </>
              }
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
            <FormField
              label="Pool PPPoE"
              htmlFor="editZonaPool"
              wide
              aviso={
                <>
                  Es el pool del MikroTik del que salen las IP de los clientes.
                  <b> Si falta o no coincide, el cliente entra y se queda sin
                  IP:</b> el plan se crea, el usuario se autentica, y no navega.
                </>
              }
              hint='Eligelo con "Leer del router" y no lo escribas de memoria.'
            >
              <FieldIcon icon="tabler:list-numbers">
                <Input
                  id="editZonaPool"
                  placeholder="pool-pppoe"
                  value={editZonaPool}
                  onChange={(e) => setEditZonaPool(e.target.value)}
                />
              </FieldIcon>
              <OpcionesDelRouter
                opciones={datosRouter?.pools}
                valor={editZonaPool}
                onElegir={setEditZonaPool}
                vacio="Este router no tiene ningún pool de direcciones."
              />
            </FormField>

            <FormField
              label="Lista de corte"
              htmlFor="editZonaListaCorte"
              wide
              aviso={
                <>
                  Tiene que ser el nombre <b>exacto</b> de la lista del firewall
                  del router — con sus espacios y sus mayúsculas.
                  <b> Si no coincide, el corte no corta:</b> la IP entra en una
                  lista que ninguna regla consulta y el cliente sigue navegando
                  sin pagar, sin que salte ningún error.
                </>
              }
              hint="Vacío se usa CORTE MOROSO, la de los routers de la empresa."
            >
              <FieldIcon icon="tabler:ban">
                <Input
                  id="editZonaListaCorte"
                  placeholder="CORTE MOROSO"
                  value={editZonaListaCorte}
                  onChange={(e) => setEditZonaListaCorte(e.target.value)}
                />
              </FieldIcon>
              <OpcionesDelRouter
                opciones={datosRouter?.listas}
                valor={editZonaListaCorte}
                onElegir={setEditZonaListaCorte}
                vacio="Este router no tiene ninguna lista en el firewall."
              />
            </FormField>

            <FormField label="IP LAN" htmlFor="editZonaIpLan">
              <FieldIcon icon="tabler:network">
                <Input
                  id="editZonaIpLan"
                  value={editZonaIpLan}
                  onChange={(e) => setEditZonaIpLan(e.target.value)}
                />
              </FieldIcon>
              <OpcionesDelRouter
                opciones={datosRouter?.direcciones.map((d) =>
                  d.interface ? `${d.address} (${d.interface})` : d.address,
                )}
                valor={editZonaIpLan}
                onElegir={(v) => setEditZonaIpLan(v.split(' ')[0])}
                vacio="El router no devolvió direcciones."
              />
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
        open={!!borrandoCorrida}
        onOpenChange={(v) => !v && setBorrandoCorrida(null)}
        title="Eliminar corrida"
        description={
          borrandoCorrida
            ? `¿Eliminar "${borrandoCorrida.corrida.nombre}" de la mufa ${borrandoCorrida.mufa.codigo}? Las demás corridas y las cajas no se tocan.`
            : undefined
        }
        onConfirm={handleEliminarCorrida}
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
