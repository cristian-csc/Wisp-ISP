import { api } from './api';
import type { ClienteListItem } from './clientes';

export type EstadoPago = 'pagado' | 'pendiente' | 'vencido' | 'corte_temporal';

export type Pago = {
  id: number;
  cliente_id: number;
  monto: number;
  mes_pagado: string;
  fecha_pago: string;
  metodo_pago: string;
  numero_operacion: string | null;
  estado: EstadoPago;
  ruta_comprobante: string | null;
  creado_en: string;
  cliente: { id: number; nombre: string } | null;
  registrador: { id: number; nombre: string; rol: string } | null;
};

export type PagosPage = { total: number; page: number; per_page: number; pages: number; items: Pago[] };

export async function listPagos(params?: {
  page?: number;
  cliente_id?: number;
  mes?: string;
  estado?: EstadoPago;
  search?: string;
}): Promise<PagosPage> {
  const { data } = await api.get('/pagos', { params });
  return data;
}

export async function createPago(input: {
  cliente_id: number;
  monto: number;
  mes_pagado: string;
  fecha_pago: string;
  metodo_pago?: string;
  numero_operacion?: string;
}): Promise<Pago> {
  const { data } = await api.post('/pagos', input);
  return data;
}

export async function getPago(id: number): Promise<Pago> {
  const { data } = await api.get(`/pagos/${id}`);
  return data;
}

export async function deletePago(id: number): Promise<void> {
  await api.delete(`/pagos/${id}`);
}

export async function subirComprobantePago(pagoId: number, archivo: File): Promise<Pago> {
  const form = new FormData();
  form.append('archivo', archivo);
  const { data } = await api.post(`/pagos/${pagoId}/comprobante`, form);
  return data;
}

export async function getComprobanteBlobUrl(pagoId: number): Promise<string> {
  const { data } = await api.get(`/pagos/${pagoId}/comprobante`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export type ResumenMes = { mes: string; ingresos: number; gastos: number };

export async function getResumenMensual(anio?: number): Promise<ResumenMes[]> {
  const { data } = await api.get('/pagos/resumen-mensual', { params: anio ? { anio } : undefined });
  return data;
}

export type ClienteMoroso = ClienteListItem & { mes_que_debe: string; dias_atraso: number };

export async function getClientesSinPago(): Promise<ClienteMoroso[]> {
  const { data } = await api.get('/pagos/clientes-sin-pago');
  return data;
}

export type ClienteCortado = ClienteListItem & { cortado_en: string | null };

export async function getClientesCortados(): Promise<ClienteCortado[]> {
  const { data } = await api.get('/pagos/clientes-cortados');
  return data;
}

export async function reenviarConfirmacionWhatsapp(pagoId: number): Promise<{ ok: boolean; telefono: string }> {
  const { data } = await api.post(`/pagos/${pagoId}/reenviar-whatsapp`);
  return data;
}

export async function getPausasPorVencer(): Promise<ClienteListItem[]> {
  const { data } = await api.get('/pagos/pausas-por-vencer');
  return data;
}

export type ReporteCajaPago = {
  id: number;
  cliente_id: number;
  cliente_nombre: string | null;
  zona_nombre: string | null;
  monto: number;
  metodo_pago: string;
  registrado_por: string | null;
  hora: string | null;
};

export type ReporteCaja = {
  fecha: string;
  total: number;
  cantidad_pagos: number;
  por_metodo: { metodo: string; total: number; cantidad: number }[];
  por_usuario: { usuario_id: number | null; nombre: string; rol: string | null; total: number; cantidad: number }[];
  pagos: ReporteCajaPago[];
};

export async function getReporteCaja(fecha: string, zonaId?: number): Promise<ReporteCaja> {
  const { data } = await api.get('/pagos/reporte-caja', { params: { fecha, zona_id: zonaId } });
  return data;
}

export type ReporteZona = { zona_id: number; zona_nombre: string; total: number; cantidad_pagos: number; clientes_distintos: number };

export async function getReporteMensualZonas(mes: string): Promise<ReporteZona[]> {
  const { data } = await api.get('/pagos/reporte-mensual-zonas', { params: { mes } });
  return data;
}
