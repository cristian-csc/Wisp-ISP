import { api } from './api';

export type TipoMovimiento = 'entrada' | 'salida' | 'asignacion' | 'devolucion' | 'consumo' | 'ajuste';
export type EstadoStock = 'sin_stock' | 'bajo' | 'ok';
export type EstadoActivo = 'almacen' | 'asignado' | 'usado' | 'baja';

export type UnidadMedida = { id: number; nombre: string; plural: string; abreviatura: string; materiales: number };

/** Lo mínimo para nombrar una cantidad: "metro" / "metros". */
export type ConUnidad = { unidad: string; unidad_plural: string };

export type Categoria = { id: number; nombre: string; icono: string | null; orden: number };

export type Articulo = {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id: number;
  categoria: Categoria;
  marca: string | null;
  modelo: string | null;
  unidad_id: number;
  unidad: string;
  unidad_plural: string;
  controla_por_unidad: boolean;
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
  unidad_id: number;
  stock_minimo: number;
  costo_unitario?: number | null;
  ubicacion?: string | null;
  descripcion?: string | null;
  stock_inicial?: number;
  controla_por_unidad?: boolean;
  activo?: boolean;
};

export type PersonaBreve = { id: number; nombre: string; rol: string };

export type MovimientoInv = {
  id: number;
  articulo_id: number;
  articulo_nombre: string;
  articulo_codigo: string;
  unidad: string;
  unidad_plural: string;
  activo_id: number | null;
  activo_codigo: string | null;
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
  unidad: string;
  unidad_plural: string;
  cantidad: number;
  ultimo_movimiento: string | null;
  /** Códigos de las piezas con etiqueta que tiene. */
  piezas: string[];
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
  lineas: { articulo_id: number; cantidad?: number; activo_ids?: number[]; numeros_serie?: string[] }[];
  persona_id?: number | null;
  cliente_id?: number | null;
  motivo?: string;
  documento?: string;
};

export type PaginaMovimientos = { total: number; page: number; pages: number; items: MovimientoInv[] };

/** "metro" o "metros" según la cantidad. */
export function palabraUnidad(u: ConUnidad, n: number): string {
  return Math.abs(n) === 1 ? u.unidad : u.unidad_plural;
}

/** "3 metros", "1 rollo". */
export function cantidadConUnidad(n: number, u: ConUnidad): string {
  return `${n.toLocaleString('es-PE')} ${palabraUnidad(u, n)}`;
}

export type Activo = {
  id: number;
  codigo: string;
  articulo_id: number;
  articulo_nombre: string;
  articulo_codigo: string;
  numero_serie: string | null;
  estado: EstadoActivo;
  persona: PersonaBreve | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  notas: string | null;
  creado_en: string | null;
};

export const ESTADO_ACTIVO: Record<EstadoActivo, { texto: string; clase: string }> = {
  almacen: { texto: 'En almacén', clase: 'bg-muted text-foreground' },
  asignado: { texto: 'Entregada', clase: 'bg-lightwarning text-warning-text' },
  usado: { texto: 'Instalada', clase: 'bg-lightsuccess text-success-text' },
  baja: { texto: 'De baja', clase: 'bg-lighterror text-error-text' },
};

export type Escaneo =
  | { tipo: 'activo'; activo: Activo; articulo: Articulo }
  | { tipo: 'material'; articulo: Articulo };

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

export async function listUnidades(): Promise<UnidadMedida[]> {
  return (await api.get<UnidadMedida[]>('/inventario/unidades')).data;
}

export async function crearUnidad(data: Omit<UnidadMedida, 'id' | 'materiales'>): Promise<UnidadMedida> {
  return (await api.post<UnidadMedida>('/inventario/unidades', data)).data;
}

export async function editarUnidad(id: number, data: Omit<UnidadMedida, 'id' | 'materiales'>): Promise<UnidadMedida> {
  return (await api.put<UnidadMedida>(`/inventario/unidades/${id}`, data)).data;
}

export async function borrarUnidad(id: number): Promise<void> {
  await api.delete(`/inventario/unidades/${id}`);
}

export async function listActivos(articuloId: number): Promise<Activo[]> {
  return (await api.get<Activo[]>(`/inventario/articulos/${articuloId}/activos`)).data;
}

export async function activosPorId(ids: number[]): Promise<Activo[]> {
  return (await api.get<Activo[]>('/inventario/activos', { params: { ids: ids.join(',') } })).data;
}

export async function editarActivo(id: number, data: { numero_serie?: string | null; notas?: string | null }): Promise<Activo> {
  return (await api.put<Activo>(`/inventario/activos/${id}`, data)).data;
}

export async function etiquetarPorPieza(articuloId: number): Promise<Activo[]> {
  return (await api.post<Activo[]>(`/inventario/articulos/${articuloId}/etiquetar`)).data;
}

/** Lo que dice una etiqueta leída con el lector: una pieza o un material. */
export async function escanear(codigo: string): Promise<Escaneo> {
  return (await api.get<Escaneo>('/inventario/escanear', { params: { codigo } })).data;
}
