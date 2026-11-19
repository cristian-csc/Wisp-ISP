import { api } from './api';

/** Cómo se compra un material: «Bobina 1000 m», «Bolsa de 10». */
export type Presentacion = {
  id: number;
  nombre: string;
  /** Cuántas unidades base trae. Una bolsa de tensadores, 10. */
  equivale_a: number;
  activo: boolean;
};

export type Material = {
  id: number;
  clave: string;
  nombre: string;
  unidad: 'metro' | 'unidad';
  /** Si vuelve al retirar a un cliente: la roseta y el patch cord sí; el
   *  cable tendido y los tensadores se quedan en el poste. */
  se_recupera: boolean;
  /** Lo que se gasta en una instalación normal, cuando siempre es igual. */
  consumo_estandar: number | null;
  activo: boolean;
  /** No es una columna: el servidor lo calcula sumando movimientos. */
  en_almacen: number;
  presentaciones: Presentacion[];
};

export type TipoMovimiento = 'entrada' | 'entrega' | 'devolucion' | 'ajuste';

export type Movimiento = {
  id: number;
  material_id: number;
  material_nombre: string | null;
  unidad: string | null;
  tipo: TipoMovimiento | 'consumo';
  cantidad: number;
  tecnico_id: number | null;
  tecnico_nombre: string | null;
  cliente_id: number | null;
  presentacion: string | null;
  motivo: string | null;
  registrado_por: string | null;
  creado_en: string | null;
};

export type SaldoTecnico = {
  tecnico_id: number;
  tecnico_nombre: string;
  material_id: number;
  material_nombre: string;
  unidad: string;
  cantidad: number;
};

export type MovimientoInput = {
  material_id: number;
  tipo: TipoMovimiento;
  /** En la presentación elegida si va `presentacion_id`; si no, en la unidad
   *  del material. La traducción la hace el servidor, no la pantalla. */
  cantidad: number;
  presentacion_id?: number | null;
  tecnico_id?: number | null;
  motivo?: string | null;
};

export async function listMateriales(): Promise<Material[]> {
  const { data } = await api.get('/materiales');
  return data;
}

export async function listMovimientos(material_id?: number): Promise<Movimiento[]> {
  const { data } = await api.get('/materiales/movimientos', {
    params: material_id ? { material_id } : undefined,
  });
  return data;
}

export async function listSaldosTecnico(): Promise<SaldoTecnico[]> {
  const { data } = await api.get('/materiales/por-tecnico');
  return data;
}

export async function registrarMovimiento(input: MovimientoInput): Promise<Movimiento> {
  const { data } = await api.post('/materiales/movimientos', input);
  return data;
}

/** Cantidades sin decimales inútiles: 1800 y no 1800,00; 45,5 y no 45,50. */
export function cantidad(valor: number, unidad?: string | null): string {
  const n = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(valor);
  if (!unidad) return n;
  return unidad === 'metro' ? `${n} m` : n;
}

export type MaterialInput = {
  nombre: string;
  unidad: 'metro' | 'unidad';
  se_recupera: boolean;
  consumo_estandar?: number | null;
  presentaciones?: { nombre: string; equivale_a: number }[];
};

/** La unidad no viaja: una vez hay movimientos contados en ella, cambiarla
 *  convertiría 1.800 metros en 1.800 rosetas. */
export type MaterialPatch = {
  nombre?: string;
  se_recupera?: boolean;
  consumo_estandar?: number | null;
  activo?: boolean;
};

export async function crearMaterial(input: MaterialInput): Promise<Material> {
  const { data } = await api.post('/materiales', input);
  return data;
}

export async function editarMaterial(id: number, input: MaterialPatch): Promise<Material> {
  const { data } = await api.put(`/materiales/${id}`, input);
  return data;
}

export async function agregarPresentacion(
  materialId: number,
  input: { nombre: string; equivale_a: number },
): Promise<Presentacion> {
  const { data } = await api.post(`/materiales/${materialId}/presentaciones`, input);
  return data;
}

export async function quitarPresentacion(presentacionId: number): Promise<{ desactivada: boolean; detalle?: string }> {
  const { data } = await api.delete(`/materiales/presentaciones/${presentacionId}`);
  return data;
}
