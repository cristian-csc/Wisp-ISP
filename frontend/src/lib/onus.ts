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
  tecnico: { id: number; nombre: string } | null;
  fecha_asignacion_tecnico: string | null;
  fecha_instalacion: string | null;
  creado_en: string | null;
};

export type TipoMovimientoOnu =
  | 'alta'
  | 'asignacion'
  | 'traspaso'
  | 'devolucion'
  | 'instalacion'
  | 'retiro'
  | 'danada'
  | 'perdida'
  | 'recuperada'
  | 'correccion';

export type MovimientoOnu = {
  id: number;
  tipo: TipoMovimientoOnu;
  estado_anterior: EstadoOnu | null;
  estado_nuevo: EstadoOnu;
  persona: { id: number; nombre: string } | null;
  cliente: { id: number; nombre: string } | null;
  nota: string | null;
  registrado_por: { id: number; nombre: string } | null;
  creado_en: string;
};

export type ValidacionOnu = {
  numero_serie?: string;
  mac?: string;
  marca?: string | null;
  errores: { numero_serie?: string; mac?: string };
};

/** Los cuatro primeros caracteres de la serie GPON son el fabricante. Se
 *  completa la marca sola en cuanto se escanea; el servidor tiene la misma
 *  lista y es quien decide. */
const FABRICANTES: Record<string, string> = {
  ASKY: 'Askey',
  MSTC: 'Mitrastar',
  HWTC: 'Huawei',
  ZTEG: 'ZTE',
  FHTT: 'FiberHome',
  TPLG: 'TP-Link',
  ALCL: 'Nokia',
  VSOL: 'V-SOL',
  GPON: 'Genérica',
  SCOM: 'Sercomm',
  CDTC: 'C-Data',
  UBNT: 'Ubiquiti',
};

export function detectarMarca(numeroSerie: string): string | null {
  return FABRICANTES[numeroSerie.trim().toUpperCase().slice(0, 4)] ?? null;
}

/** "a4b1c23d4e5f" o "A4-B1-…" → "A4:B1:C2:3D:4E:5F" mientras se escribe. */
export function formatearMac(texto: string): string {
  const hex = texto.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
  return hex.match(/.{1,2}/g)?.join(':') ?? '';
}

/** ¿La MAC guardada es válida? Para señalar datos viejos mal cargados. */
export function macValida(mac: string | null): boolean {
  return !mac || /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac);
}

/** El mensaje que vino del servidor, sea un 400 con texto o un 422 de validación. */
export function mensajeDeError(err: any, porDefecto: string): string {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, '');
  return porDefecto;
}

export async function listOnus(params?: { estado?: EstadoOnu; tecnico_id?: number; cliente_id?: number }): Promise<Onu[]> {
  const { data } = await api.get('/onus', { params });
  return data;
}

export async function validarOnu(params: { numero_serie?: string; mac?: string }): Promise<ValidacionOnu> {
  const { data } = await api.get<ValidacionOnu>('/onus/validar', { params });
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

export async function historialOnu(id: number): Promise<MovimientoOnu[]> {
  const { data } = await api.get<MovimientoOnu[]>(`/onus/${id}/historial`);
  return data;
}

export async function asignarOnu(id: number, tecnicoId: number, nota?: string): Promise<Onu> {
  const { data } = await api.post(`/onus/${id}/asignar`, { tecnico_id: tecnicoId, nota: nota || undefined });
  return data;
}

export async function editarOnu(
  id: number,
  data: { mac?: string | null; marca?: string | null; wifi_version?: 'wifi5' | 'wifi6' | null; nota?: string },
): Promise<Onu> {
  const { data: out } = await api.put<Onu>(`/onus/${id}`, data);
  return out;
}

export async function marcarOnu(id: number, estado: EstadoOnu, nota?: string): Promise<Onu> {
  const { data } = await api.post(`/onus/${id}/marcar`, { estado, nota: nota || undefined });
  return data;
}

export async function deleteOnu(id: number): Promise<void> {
  await api.delete(`/onus/${id}`);
}
