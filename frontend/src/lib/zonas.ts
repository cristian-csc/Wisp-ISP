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
  ip_wireguard: string;
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

export async function wireguardStatus(zonaId: number): Promise<WireguardStatus> {
  const { data } = await api.get(`/zonas/${zonaId}/wireguard-status`);
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
