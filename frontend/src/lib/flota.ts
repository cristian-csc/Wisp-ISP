import { api } from './api';

// ── Unidades vehiculares ──────────────────────────────────────────────────────

export type Unidad = {
  id: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  activo: boolean;
  tiene_foto: boolean;
  creado_en: string;
};

export type UnidadInput = {
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  activo?: boolean;
};

export async function listUnidades(soloActivas = false): Promise<Unidad[]> {
  const { data } = await api.get('/unidades', { params: { solo_activas: soloActivas } });
  return data;
}

export async function crearUnidad(input: UnidadInput): Promise<Unidad> {
  const { data } = await api.post('/unidades', input);
  return data;
}

export async function actualizarUnidad(id: number, input: Partial<UnidadInput>): Promise<Unidad> {
  const { data } = await api.put(`/unidades/${id}`, input);
  return data;
}

export async function eliminarUnidad(id: number): Promise<void> {
  await api.delete(`/unidades/${id}`);
}

export async function subirFotoUnidad(id: number, archivo: File): Promise<Unidad> {
  const fd = new FormData();
  fd.append('archivo', archivo);
  const { data } = await api.post(`/unidades/${id}/foto`, fd);
  return data;
}

export async function getUnidadFotoBlobUrl(id: number): Promise<string> {
  const { data } = await api.get(`/unidades/${id}/foto`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

// ── Recargas de combustible ───────────────────────────────────────────────────

export type Recarga = {
  id: number;
  unidad_id: number;
  monto: number;
  fecha: string;
  nota: string | null;
  tiene_foto_surtidor: boolean;
  tiene_foto_boleta: boolean;
  registrado_por: number | null;
  creado_en: string;
  unidad_placa: string | null;
  registrado_por_nombre: string | null;
};

export type RecargasPage = {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: Recarga[];
};

export async function listRecargas(params?: {
  page?: number;
  per_page?: number;
  mes?: string;
  unidad_id?: number;
}): Promise<RecargasPage> {
  const { data } = await api.get('/combustible', { params });
  return data;
}

export async function eliminarRecarga(id: number): Promise<void> {
  await api.delete(`/combustible/${id}`);
}

export async function getRecargaFotoBlobUrl(id: number, cual: 'surtidor' | 'boleta'): Promise<string> {
  const { data } = await api.get(`/combustible/${id}/foto-${cual}`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export type ReporteUnidad = {
  unidad_id: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  total: number;
  recargas: number;
};

export async function getReporteCombustible(mes: string): Promise<ReporteUnidad[]> {
  const { data } = await api.get('/combustible/reporte', { params: { mes } });
  return data;
}

// ── Foto del equipo en el inventario (ONUs) ───────────────────────────────────

export async function subirFotoOnu(onuId: number, archivo: File): Promise<{ id: number; tiene_foto: boolean }> {
  const fd = new FormData();
  fd.append('archivo', archivo);
  const { data } = await api.post(`/onus/${onuId}/foto`, fd);
  return data;
}

export async function getOnuFotoBlobUrl(onuId: number): Promise<string> {
  const { data } = await api.get(`/onus/${onuId}/foto`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}
