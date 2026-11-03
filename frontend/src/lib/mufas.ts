import { api } from './api';
import type { CajaNap } from './cajasnap';

export type TrazadoPunto = { lat: number; lng: number };

export type Mufa = {
  id: number;
  codigo: string;
  zona_id: number;
  lat: number | null;
  lng: number | null;
  descripcion: string | null;
  trazado: TrazadoPunto[] | null;
  activo: boolean;
  creado_en: string;
  total_cajas: number;
};

export type MufaCreateInput = {
  codigo: string;
  zona_id: number;
  lat?: number;
  lng?: number;
  descripcion?: string;
};

export async function listMufas(zonaId?: number): Promise<Mufa[]> {
  const { data } = await api.get('/mufas', { params: zonaId ? { zona_id: zonaId } : undefined });
  return data;
}

export async function getMufa(id: number): Promise<Mufa> {
  const { data } = await api.get(`/mufas/${id}`);
  return data;
}

export async function createMufa(input: MufaCreateInput): Promise<Mufa> {
  const { data } = await api.post('/mufas', input);
  return data;
}

export async function updateMufa(id: number, data: { lat?: number; lng?: number; descripcion?: string; trazado?: TrazadoPunto[] | null }): Promise<Mufa> {
  const res = await api.put(`/mufas/${id}`, data);
  return res.data;
}

export async function deleteMufa(id: number): Promise<void> {
  await api.delete(`/mufas/${id}`);
}

export async function listCajasDeMufa(mufaId: number): Promise<CajaNap[]> {
  const { data } = await api.get(`/mufas/${mufaId}/cajas-nap`);
  return data;
}
