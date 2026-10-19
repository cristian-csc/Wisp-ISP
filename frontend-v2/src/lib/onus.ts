import { api } from './api';

export type EstadoOnu = 'en_almacen' | 'asignado_tecnico' | 'instalado' | 'danado' | 'perdido';

export type Onu = {
  id: number;
  numero_serie: string;
  mac: string | null;
  marca: string | null;
  wifi_version: 'wifi5' | 'wifi6' | null;
  estado: EstadoOnu;
  tecnico_id: number | null;
  cliente_id: number | null;
  cliente: { id: number; nombre: string; zona: { id: number; nombre: string } | null } | null;
  fecha_asignacion_tecnico: string | null;
  fecha_instalacion: string | null;
};

/** El N° de serie GPON trae de fábrica el prefijo del fabricante: ASKY = Askey,
 * MSTC = Mitrastar. Permite llenar la marca sola en cuanto se escanea. */
export function detectarMarca(numeroSerie: string): string | null {
  const s = numeroSerie.trim().toUpperCase();
  if (s.startsWith('ASKY')) return 'Askey';
  if (s.startsWith('MSTC')) return 'Mitrastar';
  return null;
}

export async function listOnus(params?: { estado?: EstadoOnu; tecnico_id?: number; cliente_id?: number }): Promise<Onu[]> {
  const { data } = await api.get('/onus', { params });
  return data;
}

export async function createOnu(input: {
  numero_serie: string;
  mac?: string;
  marca?: string;
  wifi_version?: 'wifi5' | 'wifi6';
}): Promise<Onu> {
  const { data } = await api.post('/onus', input);
  return data;
}

export async function asignarOnu(id: number, tecnicoId: number): Promise<Onu> {
  const { data } = await api.post(`/onus/${id}/asignar`, { tecnico_id: tecnicoId });
  return data;
}

export async function marcarOnu(id: number, estado: EstadoOnu): Promise<Onu> {
  const { data } = await api.post(`/onus/${id}/marcar`, { estado });
  return data;
}

export async function deleteOnu(id: number): Promise<void> {
  await api.delete(`/onus/${id}`);
}
