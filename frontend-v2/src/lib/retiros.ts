import { api } from './api';
import type { Usuario } from './api';
import type { Onu } from './onus';

export type EstadoOrdenRetiro = 'pendiente' | 'completado';
export type EstadoClienteRetiro = 'activo' | 'suspendido' | 'pausado' | 'anulado' | string;

export type OrdenRetiroCliente = {
  id: number;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  direccion: string | null;
  estado: EstadoClienteRetiro;
  zona: { id: number; nombre: string } | null;
};

export type OrdenRetiro = {
  id: number;
  cliente_id: number;
  tecnico_asignado_id: number | null;
  motivo: string;
  estado: EstadoOrdenRetiro;
  fecha_solicitud: string;
  fecha_retiro: string | null;
  onu_retirada_id: number | null;
  retiro_roseta: boolean;
  retiro_patchcord: boolean;
  observaciones: string | null;
  cliente: OrdenRetiroCliente | null;
  tecnico_asignado: Usuario | null;
  onu_actual: Onu | null;
};

export async function listOrdenesRetiro(params?: { estado?: EstadoOrdenRetiro; zona_id?: number }): Promise<OrdenRetiro[]> {
  const { data } = await api.get('/ordenes-retiro', { params });
  return data;
}

export async function getOrdenRetiro(id: number): Promise<OrdenRetiro> {
  const { data } = await api.get(`/ordenes-retiro/${id}`);
  return data;
}

export async function createOrdenRetiro(input: { cliente_id: number; motivo: string; tecnico_asignado_id?: number }): Promise<OrdenRetiro> {
  const { data } = await api.post('/ordenes-retiro', input);
  return data;
}

export async function asignarOrdenRetiro(id: number, tecnicoAsignadoId: number): Promise<OrdenRetiro> {
  const { data } = await api.post(`/ordenes-retiro/${id}/asignar`, { tecnico_asignado_id: tecnicoAsignadoId });
  return data;
}

export async function completarOrdenRetiro(
  id: number,
  input: { onu_retirada_id?: number; retiro_roseta: boolean; retiro_patchcord: boolean; observaciones?: string },
): Promise<OrdenRetiro> {
  const { data } = await api.post(`/ordenes-retiro/${id}/completar`, input);
  return data;
}
