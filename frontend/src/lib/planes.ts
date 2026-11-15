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

/** Estado de un plan en un router concreto.
 *
 *  Un plan es global, no de una zona, asi que "el router no tiene ese perfil"
 *  solo es un problema si hay clientes de esa zona usando el plan:
 *   - `falta`     hay clientes y el perfil no esta -> no conectan;
 *   - `no_usado`  no hay clientes -> ese plan no se ofrece ahi, no hay nada
 *                 que arreglar;
 *   - `difiere`   el perfil esta pero con otra velocidad;
 *   - `ok`        coinciden.
 */
export type EstadoPlanEnZona = {
  codigo: string;
  nombre: string;
  estado: 'ok' | 'falta' | 'difiere' | 'no_usado';
  detalle: string;
  /** Clientes de esa zona con ese plan, sin contar anulados ni rechazados. */
  clientes: number;
};

export type VerificacionZona = {
  zona: string;
  sin_contacto: boolean;
  detalle: string;
  perfiles_del_router?: string[];
  /** Cuantos planes hay que arreglar en esta zona (falta + difiere). */
  problemas: number;
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

/** Un perfil PPPoE tal y como esta en el router. */
export type PerfilDeRouter = {
  nombre: string;
  /** "subidaM/bajadaM", o cadena vacia si el perfil no limita velocidad. */
  rate_limit: string;
};

/** Los perfiles PPPoE que tiene el router de esa zona, tal cual.
 *  Sirve para elegir el codigo de un plan de una lista real en vez de
 *  escribirlo de memoria: una errata ahi deja al cliente sin conectar. */
export async function perfilesDeZona(zonaId: number): Promise<{
  zona: string;
  perfiles: PerfilDeRouter[];
}> {
  const { data } = await api.get(`/planes/perfiles-de-zona/${zonaId}`);
  return data;
}

/** Saca las dos velocidades de un rate-limit de RouterOS ("10M/50M").
 *  Devuelve null si no se entiende, que es lo que hay que asumir cuando el
 *  perfil usa rafagas u otras unidades. */
export function velocidadesDeRateLimit(
  rate: string,
): { subida: number; bajada: number } | null {
  const m = /^([0-9]+)M\/([0-9]+)M$/.exec((rate || '').trim());
  if (!m) return null;
  return { subida: Number(m[1]), bajada: Number(m[2]) };
}
