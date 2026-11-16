import { api } from './api';

export type Zona = {
  id: number;
  nombre: string;
  ip_wireguard: string;
  ip_lan: string | null;
  usuario_mikrotik: string | null;
  wg_public_key: string | null;
  router_mikrotik: string | null;
  ip_router: string | null;
  /** Pool de direcciones del MikroTik del que salen las IP de los clientes. */
  pool_pppoe: string | null;
  /** Lista del firewall donde el router mete a los cortados. */
  lista_corte: string | null;
  lat: number | null;
  lng: number | null;
  descripcion: string | null;
  tiendas_pago: string | null;
  activo: boolean;
  total_clientes: number;
  clientes_activos: number;
};

export type ZonaCreateInput = {
  nombre: string;
  /** Opcional: la zona se registra antes de que el router esté en sitio. */
  ip_wireguard?: string;
  ip_lan?: string;
  usuario_mikrotik?: string;
  password_mikrotik?: string;
  router_mikrotik?: string;
  ip_router?: string;
  descripcion?: string;
  tiendas_pago?: string;
};

export async function listZonas(): Promise<Zona[]> {
  const { data } = await api.get('/zonas');
  return data;
}

export async function getZona(id: number): Promise<Zona> {
  const { data } = await api.get(`/zonas/${id}`);
  return data;
}

export async function createZona(data: ZonaCreateInput) {
  const res = await api.post('/zonas', data);
  return res.data;
}

/** Borra una zona. El servidor se niega si tiene clientes asignados y
 *  devuelve cuántos son, así que el error se le puede mostrar tal cual a
 *  quien lo intentó. Borrar una zona se lleva por delante sus mufas y cajas
 *  NAP: no hay deshacer. */
export async function deleteZona(id: number): Promise<void> {
  await api.delete(`/zonas/${id}`);
}

export async function updateZonaDatos(id: number, data: {
  nombre?: string;
  lat?: number;
  lng?: number;
  descripcion?: string;
  tiendas_pago?: string;
  ip_lan?: string;
  usuario_mikrotik?: string;
  password_mikrotik?: string;
  router_mikrotik?: string;
  ip_router?: string;
  /** Pool de direcciones del MikroTik del que salen las IP de los clientes. */
  pool_pppoe?: string;
  lista_corte?: string;
  /** Se completa cuando el túnel ya está levantado, no al crear la zona. */
  ip_wireguard?: string;
}): Promise<Zona> {
  const res = await api.put(`/zonas/${id}/datos`, data);
  return res.data;
}

export type WireguardStatus = {
  zona: string;
  ip: string;
  online: boolean;
  status: string;
  wg_peer_online: boolean;
  last_handshake: string;
  vps_pubkey: string;
  vps_endpoint: string;
};

/** `forzar` se salta la memoria corta del servidor (2 min) y vuelve a
 *  preguntarle a la VPS. Solo para cuando alguien lo pide a propósito. */
/**
 * Lo último que se leyó del estado de la red, para que al volver a Zonas
 * desde otro módulo la pantalla se pinte **al instante** con lo que ya se
 * sabía, en vez de quedarse en "comprobando" unos segundos.
 *
 * Son 2 minutos, los mismos que guarda el servidor: el handshake de WireGuard
 * se renueva a ese ritmo, así que un dato más fresco no existe. Y de paso se
 * ahorran los ping a cada router, que son los que de verdad tardan y esos el
 * servidor no los guarda.
 *
 * Vive en el módulo a propósito: sobrevive a cambiar de pantalla (que es el
 * caso que molesta) y se olvida al recargar la página, que es cuando uno
 * quiere ver el estado de cero.
 */
const RECIENTE_MS = 120_000;

let estadoRedUltimo: { ts: number; filas: EstadoRedZona[] } | null = null;
const wgUltimo = new Map<number, { ts: number; dato: WireguardStatus }>();

/** El estado de todas las zonas si se leyó hace poco; null si toca preguntar. */
export function estadoRedReciente(): EstadoRedZona[] | null {
  if (!estadoRedUltimo) return null;
  if (Date.now() - estadoRedUltimo.ts > RECIENTE_MS) return null;
  return estadoRedUltimo.filas;
}

/** Lo mismo para una zona sola. */
export function wireguardReciente(zonaId: number): WireguardStatus | null {
  const g = wgUltimo.get(zonaId);
  if (!g) return null;
  if (Date.now() - g.ts > RECIENTE_MS) return null;
  return g.dato;
}

export async function wireguardStatus(
  zonaId: number,
  forzar = false,
): Promise<WireguardStatus> {
  const { data } = await api.get(`/zonas/${zonaId}/wireguard-status`, {
    params: forzar ? { forzar: true } : undefined,
  });
  wgUltimo.set(zonaId, { ts: Date.now(), dato: data });
  return data;
}

export type Tecnico = { id: number; nombre: string; email: string };

export async function listTecnicosZona(zonaId: number): Promise<Tecnico[]> {
  const { data } = await api.get(`/zonas/${zonaId}/tecnicos`);
  return data;
}

export async function asignarTecnicoZona(zonaId: number, tecnicoId: number) {
  const { data } = await api.post(`/zonas/${zonaId}/tecnicos/${tecnicoId}`);
  return data;
}

export async function quitarTecnicoZona(zonaId: number, tecnicoId: number) {
  const { data } = await api.delete(`/zonas/${zonaId}/tecnicos/${tecnicoId}`);
  return data;
}

/** Cómo está el enlace con el router de una zona.
 *  - conectado:         el router contesta
 *  - tunel_sin_router:  hay handshake de WireGuard pero el router no responde
 *  - sin_respuesta:     ni handshake ni ping
 *  - sin_tunel:         la zona existe pero todavía no tiene túnel configurado */
export type EstadoRed = 'conectado' | 'tunel_sin_router' | 'sin_respuesta' | 'sin_tunel';

export type EstadoRedZona = {
  zona_id: number;
  estado: EstadoRed;
  ping_ok: boolean;
  ssh_ok: boolean;
  wg_online: boolean;
  /** Epoch en segundos. 0 = nunca hubo handshake. */
  last_handshake_ts: number;
};

/** El estado del router de todas las zonas en una sola llamada. Hace ping a
 *  cada router y lee el handshake en la VPS, así que tarda unos segundos. */
export async function estadoRedZonas(): Promise<EstadoRedZona[]> {
  const { data } = await api.get('/zonas/estado-red');
  estadoRedUltimo = { ts: Date.now(), filas: data };
  return data;
}


/** Lo que el MikroTik de la zona cuenta de sí mismo. Todo puede venir vacío:
 *  depende de lo que ese router tenga configurado. */
export type DatosDelRouter = {
  identidad: string | null;
  modelo: string | null;
  version: string | null;
  /** Modelo y nombre juntos, como se guardan en la zona. */
  router_mikrotik: string | null;
  pools: string[];
  /** El pool al que ya apuntan sus perfiles PPPoE, si hay uno claro. */
  pool_sugerido: string | null;
  listas: string[];
  lista_sugerida: string | null;
  direcciones: { address: string; interface: string | null }[];
  perfiles: { nombre: string; pool: string | null }[];
};

/** Pregunta al router de la zona su modelo, nombre, pools, listas del
 *  firewall y direcciones. Necesita el túnel levantado: es por donde va. */
export async function datosDelRouter(zonaId: number): Promise<DatosDelRouter> {
  const { data } = await api.get(`/zonas/${zonaId}/datos-del-router`);
  return data;
}
