import { api } from './api';
import type { CajaNap } from './cajasnap';

export type TrazadoPunto = { lat: number; lng: number };

/** Un tendido que sale de la mufa y une varias cajas NAP. El ingeniero las
 *  numera, les pone su metraje y le da a cada una un color para poder
 *  distinguirlas cuando se cruzan en el plano. */
export type Corrida = {
  id: number;
  mufa_id: number;
  nombre: string;
  /** Hexadecimal, #rrggbb */
  color: string;
  /** Metros de cable. Se calculan del trazado, pero se pueden corregir. */
  metros: number | null;
  trazado: TrazadoPunto[] | null;
};

/** Los colores que se ofrecen, pensados para distinguirse entre ellos y para
 *  verse igual de bien sobre la foto satelital que sobre el mapa de calles. */
export const COLORES_CORRIDA = [
  { valor: '#8754ec', nombre: 'Morado' },
  { valor: '#5d87ff', nombre: 'Azul' },
  { valor: '#13deb9', nombre: 'Verde' },
  { valor: '#ffae1f', nombre: 'Ámbar' },
  { valor: '#fa896b', nombre: 'Rojo' },
  { valor: '#ff4dd2', nombre: 'Rosa' },
] as const;

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
  corridas: Corrida[];
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

export type CorridaInput = {
  nombre: string;
  color?: string;
  metros?: number;
  trazado: TrazadoPunto[];
};

export async function crearCorrida(mufaId: number, input: CorridaInput): Promise<Corrida> {
  const { data } = await api.post(`/mufas/${mufaId}/corridas`, input);
  return data;
}

export async function actualizarCorrida(
  mufaId: number,
  corridaId: number,
  cambios: Partial<CorridaInput>,
): Promise<Corrida> {
  const { data } = await api.put(`/mufas/${mufaId}/corridas/${corridaId}`, cambios);
  return data;
}

export async function borrarCorrida(mufaId: number, corridaId: number): Promise<void> {
  await api.delete(`/mufas/${mufaId}/corridas/${corridaId}`);
}
