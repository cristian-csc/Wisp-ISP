import { api } from './api';

export type TipoMovimiento = 'entrada' | 'salida' | 'asignacion' | 'devolucion' | 'consumo' | 'ajuste';
export type EstadoStock = 'sin_stock' | 'bajo' | 'ok';
export type Unidad = 'unidad' | 'metro' | 'rollo' | 'caja' | 'par' | 'paquete';

export type Categoria = { id: number; nombre: string; icono: string | null; orden: number };

export type Articulo = {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id: number;
  categoria: Categoria;
  marca: string | null;
  modelo: string | null;
  unidad: Unidad;
  stock: number;
  stock_minimo: number;
  costo_unitario: number | null;
  ubicacion: string | null;
  descripcion: string | null;
  activo: boolean;
  en_personal: number;
  estado: EstadoStock;
};

export type ArticuloForm = {
  codigo: string;
  nombre: string;
  categoria_id: number;
  marca?: string | null;
  modelo?: string | null;
  unidad: Unidad;
  stock_minimo: number;
  costo_unitario?: number | null;
  ubicacion?: string | null;
  descripcion?: string | null;
  stock_inicial?: number;
  activo?: boolean;
};

export type PersonaBreve = { id: number; nombre: string; rol: string };

export type MovimientoInv = {
  id: number;
  articulo_id: number;
  articulo_nombre: string;
  articulo_codigo: string;
  unidad: Unidad;
  tipo: TipoMovimiento;
  cantidad: number;
  stock_resultante: number;
  persona: PersonaBreve | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  motivo: string | null;
  documento: string | null;
  lote: string | null;
  registrado_por: PersonaBreve;
  creado_en: string;
};

export type ResumenInventario = {
  articulos: number;
  sin_stock: number;
  bajo_minimo: number;
  valor_almacen: number;
  unidades_en_personal: number;
  personas_con_material: number;
  movimientos_hoy: number;
};

export type MaterialEnMano = {
  articulo_id: number;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  cantidad: number;
  ultimo_movimiento: string | null;
};

export type PersonaConMaterial = {
  persona: { id: number; nombre: string; rol: string; activo: boolean; telefono: string | null };
  unidades: number;
  articulos: number;
  ultimo_movimiento: string | null;
  material: MaterialEnMano[];
};

export type DetalleArticulo = {
  articulo: Articulo;
  en_manos: { persona: PersonaBreve; cantidad: number }[];
  movimientos: MovimientoInv[];
};

export type NuevoMovimiento = {
  tipo: Exclude<TipoMovimiento, 'ajuste'>;
  lineas: { articulo_id: number; cantidad: number }[];
  persona_id?: number | null;
  cliente_id?: number | null;
  motivo?: string;
  documento?: string;
};

export type PaginaMovimientos = { total: number; page: number; pages: number; items: MovimientoInv[] };

export const UNIDADES: { valor: Unidad; singular: string; plural: string }[] = [
  { valor: 'unidad', singular: 'unidad', plural: 'unidades' },
  { valor: 'metro', singular: 'metro', plural: 'metros' },
  { valor: 'rollo', singular: 'rollo', plural: 'rollos' },
  { valor: 'caja', singular: 'caja', plural: 'cajas' },
  { valor: 'par', singular: 'par', plural: 'pares' },
  { valor: 'paquete', singular: 'paquete', plural: 'paquetes' },
];

/** "metro" o "metros" según la cantidad. */
export function palabraUnidad(unidad: Unidad, n: number): string {
  const u = UNIDADES.find((x) => x.valor === unidad);
  return Math.abs(n) === 1 ? u?.singular ?? unidad : u?.plural ?? unidad;
}

/** "3 metros", "1 rollo". */
export function cantidadConUnidad(n: number, unidad: Unidad): string {
  return `${n.toLocaleString('es-PE')} ${palabraUnidad(unidad, n)}`;
}

/** Cómo se nombra cada movimiento y hacia dónde mueve el almacén. */
export const TIPO_MOVIMIENTO: Record<TipoMovimiento, { etiqueta: string; icono: string; signo: 1 | -1 | 0 }> = {
  entrada: { etiqueta: 'Entrada', icono: 'tabler:arrow-bar-to-down', signo: 1 },
  salida: { etiqueta: 'Salida', icono: 'tabler:arrow-bar-up', signo: -1 },
  asignacion: { etiqueta: 'Entrega', icono: 'tabler:user-share', signo: -1 },
  devolucion: { etiqueta: 'Devolución', icono: 'tabler:arrow-back-up', signo: 1 },
  consumo: { etiqueta: 'Consumo', icono: 'tabler:tool', signo: 0 },
  ajuste: { etiqueta: 'Ajuste', icono: 'tabler:adjustments', signo: 0 },
};

export async function getResumenInventario(): Promise<ResumenInventario> {
  return (await api.get<ResumenInventario>('/inventario/resumen')).data;
}

export async function listCategorias(): Promise<Categoria[]> {
  return (await api.get<Categoria[]>('/inventario/categorias')).data;
}

export async function listArticulos(params: { q?: string; categoria_id?: number; estado?: string; incluir_inactivos?: boolean } = {}): Promise<Articulo[]> {
  return (await api.get<Articulo[]>('/inventario/articulos', { params })).data;
}

export async function getArticulo(id: number): Promise<DetalleArticulo> {
  return (await api.get<DetalleArticulo>(`/inventario/articulos/${id}`)).data;
}

export async function crearArticulo(data: ArticuloForm): Promise<Articulo> {
  return (await api.post<Articulo>('/inventario/articulos', data)).data;
}

export async function editarArticulo(id: number, data: ArticuloForm): Promise<Articulo> {
  return (await api.put<Articulo>(`/inventario/articulos/${id}`, data)).data;
}

export async function ajustarStock(id: number, stock_contado: number, motivo: string): Promise<MovimientoInv> {
  return (await api.post<MovimientoInv>(`/inventario/articulos/${id}/ajuste`, { stock_contado, motivo })).data;
}

export async function registrarMovimientos(data: NuevoMovimiento): Promise<MovimientoInv[]> {
  return (await api.post<MovimientoInv[]>('/inventario/movimientos', data)).data;
}

export async function listMovimientos(params: {
  articulo_id?: number;
  persona_id?: number;
  tipo?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  per_page?: number;
}): Promise<PaginaMovimientos> {
  return (await api.get<PaginaMovimientos>('/inventario/movimientos', { params })).data;
}

export async function listPersonal(): Promise<PersonaConMaterial[]> {
  return (await api.get<PersonaConMaterial[]>('/inventario/personal')).data;
}

/** Qué puede hacer esta sesión en el inventario. El backend lo vuelve a
 *  comprobar: esto solo decide qué botones se ven. */
export function permisosInventario(modulos: { clave: string }[], rol?: string) {
  const admin = rol === 'admin';
  return {
    gestionar: admin || modulos.some((m) => m.clave === 'panel.inventario'),
    ajustar: admin,
  };
}
