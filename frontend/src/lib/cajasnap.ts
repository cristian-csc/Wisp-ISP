import { api } from './api';

export type EstadoBorne = 'libre' | 'ocupado' | 'danado';

export type Borne = {
  id: number;
  numero: number;
  estado: EstadoBorne;
  cliente_id: number | null;
  codigo_precinto: string | null;
  potencia_optica_dbm: number | null;
  cliente: {
    id: number;
    nombre: string;
    usuario_pppoe: string;
    metros_cable: number | null;
    fecha_instalacion: string | null;
    plan: { nombre: string } | null;
  } | null;
};

export type EstadoPppoeBorne = {
  borne_id: number;
  cliente_id: number;
  conectado: boolean;
  uptime: string | null;
  ip_remota: string | null;
  error: string | null;
};

export type CajaNap = {
  id: number;
  codigo: string;
  zona_id: number;
  mufa_id: number | null;
  /** El código de la mufa de la que cuelga. El id solo no identifica nada
   *  para quien lee: una zona puede tener varias mufas. */
  mufa_codigo: string | null;
  lat: number | null;
  lng: number | null;
  capacidad_bornes: number;
  descripcion: string | null;
  activo: boolean;
  bornes: Borne[];
};

export type CajaNapCreateInput = {
  codigo: string;
  zona_id: number;
  mufa_id: number;
  lat?: number;
  lng?: number;
  capacidad_bornes?: number;
  descripcion?: string;
};

export async function listCajasNap(zonaId?: number): Promise<CajaNap[]> {
  const { data } = await api.get('/cajas-nap', { params: zonaId ? { zona_id: zonaId } : undefined });
  return data;
}

export async function getCajaNap(id: number): Promise<CajaNap> {
  const { data } = await api.get(`/cajas-nap/${id}`);
  return data;
}

export async function createCajaNap(input: CajaNapCreateInput): Promise<CajaNap> {
  const { data } = await api.post('/cajas-nap', input);
  return data;
}

export async function updateCajaNap(id: number, data: { codigo?: string; descripcion?: string; lat?: number; lng?: number }): Promise<CajaNap> {
  const res = await api.put(`/cajas-nap/${id}`, data);
  return res.data;
}

export async function deleteCajaNap(id: number): Promise<void> {
  await api.delete(`/cajas-nap/${id}`);
}

export async function ampliarCajaNap(id: number, capacidadNueva: number): Promise<CajaNap> {
  const { data } = await api.post(`/cajas-nap/${id}/ampliar`, null, { params: { capacidad_nueva: capacidadNueva } });
  return data;
}

export async function marcarBorne(borneId: number, danado: boolean): Promise<Borne> {
  const { data } = await api.post(`/cajas-nap/bornes/${borneId}/marcar`, { danado });
  return data;
}

export async function setCodigoPrecinto(borneId: number, codigoPrecinto: string | null): Promise<Borne> {
  const { data } = await api.put(`/cajas-nap/bornes/${borneId}/precinto`, { codigo_precinto: codigoPrecinto });
  return data;
}

export async function getEstadoPppoeCaja(cajaId: number): Promise<EstadoPppoeBorne[]> {
  const { data } = await api.get(`/cajas-nap/${cajaId}/estado-pppoe`);
  return data;
}

/** Cuántos bornes hay en cada estado, para una caja o para varias. */
export type ResumenBornes = { total: number; libres: number; ocupados: number; danados: number; pct: number };

export function resumenBornes(cajas: CajaNap[]): ResumenBornes {
  let libres = 0;
  let ocupados = 0;
  let danados = 0;
  for (const c of cajas) {
    for (const b of c.bornes) {
      if (b.estado === 'libre') libres++;
      else if (b.estado === 'ocupado') ocupados++;
      else danados++;
    }
  }
  const total = libres + ocupados + danados;
  return { total, libres, ocupados, danados, pct: total ? Math.round((ocupados / total) * 100) : 0 };
}

/** Qué tan disponible está una caja, para filtrar y avisar. */
export type Disponibilidad = 'libre' | 'casi_llena' | 'llena';

export function disponibilidad(c: CajaNap): Disponibilidad {
  const r = resumenBornes([c]);
  if (r.libres === 0) return 'llena';
  if (r.libres <= 2 || r.pct >= 75) return 'casi_llena';
  return 'libre';
}
