import { api } from './api';

export type Gasto = {
  id: number;
  descripcion: string;
  monto: number;
  categoria: string;
  fecha: string;
  proveedor: string | null;
  numero_factura: string | null;
  comprobante: string | null;
  es_recurrente: boolean;
  notas: string | null;
  zona_id: number | null;
  creado_en: string;
};

export type GastosPage = { total: number; page: number; per_page: number; pages: number; items: Gasto[] };

export type GastoInput = {
  descripcion: string;
  monto: number;
  categoria?: string;
  fecha: string;
  proveedor?: string | null;
  numero_factura?: string | null;
  comprobante?: string | null;
  es_recurrente?: boolean;
  notas?: string | null;
  zona_id?: number | null;
};

export async function listGastos(params?: {
  page?: number;
  per_page?: number;
  mes?: string;
  categoria?: string;
  zona_id?: number;
}): Promise<GastosPage> {
  const { data } = await api.get('/gastos', { params });
  return data;
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  const { data } = await api.post('/gastos', input);
  return data;
}

export async function updateGasto(id: number, input: GastoInput): Promise<Gasto> {
  const { data } = await api.put(`/gastos/${id}`, input);
  return data;
}

export async function deleteGasto(id: number): Promise<void> {
  await api.delete(`/gastos/${id}`);
}

export async function getCategorias(): Promise<string[]> {
  const { data } = await api.get('/gastos/categorias');
  return data;
}

export type ResumenZonaGastos = {
  zona_id: number | null;
  fijo: number;
  variable: number;
  total_gastos: number;
  ingresos: number;
  margen: number;
};

export async function getResumenPorZona(mes: string): Promise<ResumenZonaGastos[]> {
  const { data } = await api.get('/gastos/resumen-por-zona', { params: { mes } });
  return data;
}
