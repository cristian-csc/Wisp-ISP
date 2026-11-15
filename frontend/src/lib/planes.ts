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

/** Estado de un plan en un router concreto. */
export type EstadoPlanEnZona = {
  codigo: string;
  nombre: string;
  estado: 'ok' | 'falta' | 'difiere';
  detalle: string;
};

export type VerificacionZona = {
  zona: string;
  sin_contacto: boolean;
  detalle: string;
  perfiles_del_router?: string[];
  planes: EstadoPlanEnZona[];
};

/** Compara los planes del panel con los perfiles reales de cada router.
 *  Habla con todos los MikroTik, así que tarda: va detrás de un botón. */
export async function verificarPlanes(): Promise<{
  zonas: VerificacionZona[];
  total_planes: number;
}> {
  const { data } = await api.get('/planes/verificacion');
  return data;
}
