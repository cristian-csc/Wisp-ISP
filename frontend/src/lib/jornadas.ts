import { api } from './api';

export type UbicacionVendedor = {
  lat: number;
  lng: number;
  registrado_en: string;
};

export type Jornada = {
  id: number;
  vendedor: { id: number; nombre: string } | null;
  zona: { id: number; nombre: string } | null;
  estado: 'activa' | 'finalizada';
  lat_inicio: number;
  lng_inicio: number;
  monto_pasaje: number | null;
  monto_reclamado: number | null;
  nota_reclamo: string | null;
  reclamo_reintegrado: boolean;
  lat_fin: number | null;
  lng_fin: number | null;
  iniciado_en: string;
  finalizado_en: string | null;
  ultima_ubicacion: UbicacionVendedor | null;
};

export type ResumenPasajeVendedor = {
  vendedor_id: number;
  nombre: string;
  total_jornadas: number;
  total_pasajes: number;
};

export type JornadaRecorrido = {
  jornada: Jornada;
  puntos: UbicacionVendedor[];
};

export async function listJornadasActivas(): Promise<Jornada[]> {
  const { data } = await api.get<Jornada[]>('/jornadas/activas');
  return data;
}

export async function listJornadas(params: {
  vendedor_id?: number;
  fecha?: string;
  page?: number;
  per_page?: number;
}): Promise<{ total: number; page: number; per_page: number; pages: number; items: Jornada[] }> {
  const { data } = await api.get('/jornadas', { params });
  return data;
}

export async function getRecorridoJornada(id: number): Promise<JornadaRecorrido> {
  const { data } = await api.get<JornadaRecorrido>(`/jornadas/${id}/recorrido`);
  return data;
}

export async function actualizarPasaje(id: number, montoPasaje: number | null): Promise<Jornada> {
  const { data } = await api.put<Jornada>(`/jornadas/${id}/pasaje`, { monto_pasaje: montoPasaje });
  return data;
}

export async function getResumenPasajes(mes?: string): Promise<ResumenPasajeVendedor[]> {
  const { data } = await api.get<ResumenPasajeVendedor[]>('/jornadas/resumen-pasajes', { params: mes ? { mes } : {} });
  return data;
}

export async function reintegrarReclamo(id: number): Promise<Jornada> {
  const { data } = await api.put<Jornada>(`/jornadas/${id}/reclamo-pasaje/reintegrar`);
  return data;
}
