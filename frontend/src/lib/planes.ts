import { api } from './api';

export type TipoConexion = 'fibra_optica' | 'inalambrico' | 'satelital';

export type Plan = {
  id: number;
  codigo: string;
  nombre: string;
  bajada_mbps: number;
  subida_mbps: number;
  precio: number;
  incluye_tv: boolean;
  tv_incluidas: number;
  precio_tv_adicional: number | null;
  descripcion: string | null;
  activo: boolean;
  tipo_conexion: TipoConexion;
  costo_proveedor: number | null;
};

export type PlanInput = {
  codigo: string;
  nombre: string;
  bajada_mbps: number;
  subida_mbps: number;
  precio: number;
  incluye_tv?: boolean;
  tv_incluidas?: number;
  precio_tv_adicional?: number;
  descripcion?: string;
  tipo_conexion?: TipoConexion;
  costo_proveedor?: number;
};

export async function listPlanes(params?: { tipo_conexion?: TipoConexion }): Promise<Plan[]> {
  const { data } = await api.get('/planes', { params });
  return data;
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  const { data } = await api.post('/planes', input);
  return data;
}

export async function updatePlan(id: number, input: PlanInput): Promise<Plan> {
  const { data } = await api.put(`/planes/${id}`, input);
  return data;
}

export async function deletePlan(id: number): Promise<void> {
  await api.delete(`/planes/${id}`);
}
