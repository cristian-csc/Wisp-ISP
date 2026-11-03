import { api } from './api';

export type EstadoAveria = 'pendiente' | 'asignada' | 'en_proceso' | 'resuelta';

export type Averia = {
  id: number;
  cliente_id: number | null;
  caja_nap_id: number | null;
  borne_id: number | null;
  motivo_reportado: string;
  diagnostico_solucion: string | null;
  estado: EstadoAveria;
  tecnico_asignado_id: number | null;
  onu_reemplazada_id: number | null;
  onu_nueva_id: number | null;
  potencia_optica_dbm: number | null;
  fecha_reporte: string;
  fecha_atencion: string | null;
  cliente: { id: number; nombre: string; dni: string | null; zona: { id: number; nombre: string } | null } | null;
  caja_nap: { id: number; codigo: string; zona: { id: number; nombre: string } | null } | null;
};

export async function listAverias(params?: { estado?: EstadoAveria; cliente_id?: number; zona_id?: number }): Promise<Averia[]> {
  const { data } = await api.get('/averias', { params });
  return data;
}

export async function createAveria(input: {
  cliente_id?: number;
  caja_nap_id?: number;
  borne_id?: number;
  motivo_reportado: string;
  tecnico_asignado_id?: number;
}): Promise<Averia> {
  const { data } = await api.post('/averias', input);
  return data;
}

export async function asignarAveria(id: number, tecnicoAsignadoId: number): Promise<Averia> {
  const { data } = await api.post(`/averias/${id}/asignar`, { tecnico_asignado_id: tecnicoAsignadoId });
  return data;
}

export async function iniciarAveria(id: number): Promise<Averia> {
  const { data } = await api.post(`/averias/${id}/iniciar`);
  return data;
}

export async function resolverAveria(
  id: number,
  input: { diagnostico_solucion: string; onu_reemplazada_id?: number; onu_nueva_id?: number; potencia_optica_dbm?: number },
): Promise<Averia> {
  const { data } = await api.post(`/averias/${id}/resolver`, input);
  return data;
}

export async function editarAveria(id: number, motivoReportado: string): Promise<Averia> {
  const { data } = await api.put(`/averias/${id}`, { motivo_reportado: motivoReportado });
  return data;
}

export async function eliminarAveria(id: number): Promise<void> {
  await api.delete(`/averias/${id}`);
}
