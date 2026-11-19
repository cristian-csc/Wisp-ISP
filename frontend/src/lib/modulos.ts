import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

export type MiModulo = {
  clave: string;
  nombre: string;
  grupo: string;
  grupo_id: number;
  grupo_icono: string | null;
  plataforma: 'panel' | 'movil';
  ruta: string | null;
  icono: string | null;
  es_central: boolean;
};

export type RolConfigurable = {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  es_superadmin: boolean;
  es_sistema: boolean;
  perfil_base: string | null;
  cuentas_activas: number | null;
  total_modulos: number;
};

export type AsignacionModulo = { rol_id: number; orden: number; es_central: boolean };

export type ModuloConfigurable = {
  id: number;
  clave: string;
  nombre: string;
  grupo: string;
  modulo_padre_id: number;
  plataforma: 'panel' | 'movil';
  audiencia: 'personal' | 'cliente';
  ruta: string | null;
  icono: string | null;
  orden: number;
  asignaciones: AsignacionModulo[];
  roles_disponibles: number[];
  roles_fijos: number[];
};

export type ModuloPadre = {
  id: number;
  nombre: string;
  icono: string | null;
  plataforma: 'panel' | 'movil';
  orden: number;
  modulos: { id: number; clave: string; nombre: string; icono: string | null }[];
};

export async function listModulosPadre(): Promise<ModuloPadre[]> {
  const { data } = await api.get('/permisos/modulos-padre');
  return data;
}

export async function crearModuloPadre(input: { nombre: string; icono: string }): Promise<void> {
  await api.post('/permisos/modulos-padre', input);
}

export async function editarModuloPadre(id: number, input: { nombre: string; icono: string }): Promise<void> {
  await api.put(`/permisos/modulos-padre/${id}`, input);
}

export async function eliminarModuloPadre(id: number): Promise<void> {
  await api.delete(`/permisos/modulos-padre/${id}`);
}

export async function ordenarModulosPadre(padreIds: number[]): Promise<void> {
  await api.put('/permisos/modulos-padre/orden', { plataforma: 'panel', padre_ids: padreIds });
}

export async function moverModuloAPadre(moduloId: number, padreId: number): Promise<void> {
  await api.put(`/permisos/modulos/${moduloId}/padre`, { modulo_padre_id: padreId });
}

export async function listRolesConfigurables(): Promise<RolConfigurable[]> {
  const { data } = await api.get('/permisos/roles');
  return data;
}

export async function listModulosConfigurables(): Promise<ModuloConfigurable[]> {
  const { data } = await api.get('/permisos/modulos');
  return data;
}

export type PerfilBase = 'atencion_cliente' | 'tecnico' | 'vendedor_campo';

export async function crearRol(input: { nombre: string; descripcion?: string; perfil_base: PerfilBase }): Promise<RolConfigurable> {
  const { data } = await api.post('/permisos/roles', input);
  return data;
}

export async function editarRol(id: number, input: { nombre?: string; descripcion?: string }): Promise<RolConfigurable> {
  const { data } = await api.put(`/permisos/roles/${id}`, input);
  return data;
}

export async function eliminarRol(id: number): Promise<void> {
  await api.delete(`/permisos/roles/${id}`);
}

export async function cambiarModuloDeRol(rolId: number, moduloId: number, activo: boolean): Promise<void> {
  await api.put(`/permisos/roles/${rolId}/modulos/${moduloId}`, { activo });
}

export async function ordenarModulosDeRol(rolId: number, moduloIds: number[]): Promise<void> {
  await api.put(`/permisos/roles/${rolId}/orden`, { plataforma: 'panel', modulo_ids: moduloIds });
}

// ── Los módulos de quien tiene la sesión abierta ─────────────────────────────
// Se piden una sola vez y los comparten el menú, el buscador y la protección
// de rutas. Van atados al token para no mostrar el menú de la cuenta anterior.

type EstadoModulos = { modulos: MiModulo[]; cargando: boolean; fallo: boolean };

let estado: EstadoModulos = { modulos: [], cargando: true, fallo: false };
let tokenCargado: string | null = null;
let ultimoPedido = 0;
const oyentes = new Set<() => void>();

const tokenActual = () => localStorage.getItem('wisp_token');

function publicar(nuevo: EstadoModulos) {
  estado = nuevo;
  oyentes.forEach((avisar) => avisar());
}

export async function refrescarMisModulos(): Promise<void> {
  const pedido = ++ultimoPedido;
  tokenCargado = tokenActual();
  try {
    const { data } = await api.get<{ modulos: MiModulo[] }>('/permisos/mis-modulos', {
      params: { plataforma: 'panel' },
    });
    if (pedido === ultimoPedido) publicar({ modulos: data.modulos, cargando: false, fallo: false });
  } catch {
    if (pedido === ultimoPedido) publicar({ modulos: [], cargando: false, fallo: true });
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function useMisModulos(): EstadoModulos {
  const actual = useSyncExternalStore(suscribir, () => estado);
  const desactualizado = tokenActual() !== tokenCargado;

  useEffect(() => {
    if (tokenActual() !== tokenCargado) {
      publicar({ modulos: [], cargando: true, fallo: false });
      refrescarMisModulos();
    }
  }, []);

  return desactualizado ? { modulos: [], cargando: true, fallo: false } : actual;
}

/** Las direcciones que esta sesión tiene permitidas, o null mientras no se
 *  sepa: en ese caso manda la lista escrita en sidebaritems.ts. */
export function rutasDeMisModulos(): Set<string> | null {
  if (estado.cargando || estado.fallo || tokenActual() !== tokenCargado) return null;
  return new Set(estado.modulos.flatMap((m) => (m.ruta ? [m.ruta] : [])));
}
