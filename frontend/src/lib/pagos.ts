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
  /** Mismo código en todos los meses que se cobraron juntos (adelanto) */
  grupo_adelanto: string | null;
  /** Rebaja del cobro completo, solo en el primer mes del grupo */
  descuento: number | null;
  /** Resumen del cobro adelantado — solo lo trae el detalle de un pago */
  adelanto?: {
    /** Número del recibo del grupo (el del primer mes cobrado) */
    numero: number;
    meses: number;
    desde: string;
    hasta: string;
    total: number;
    descuento: number | null;
  } | null;
  creado_en: string;
  cliente: { id: number; nombre: string } | null;
  registrador: { id: number; nombre: string; rol: string } | null;
};

export type PagosPage = { total: number; page: number; per_page: number; pages: number; items: Pago[] };

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** "2026-11" → "Noviembre 2026" */
export function etiquetaMes(mesPagado: string): string {
  const [anio, mes] = mesPagado.split('-').map(Number);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Los meses consecutivos que cubre un cobro, igual que los calcula el backend. */
export function mesesCubiertos(desde: string, cantidad: number): string[] {
  let [anio, mes] = desde.split('-').map(Number);
  const salida: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    salida.push(`${anio}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes === 13) {
      mes = 1;
      anio += 1;
    }
  }
  return salida;
}

/** "Noviembre 2026 a Enero 2027", o un solo mes cuando cantidad es 1. */
export function rangoMeses(desde: string, cantidad: number): string {
  const meses = mesesCubiertos(desde, cantidad);
  if (meses.length === 1) return etiquetaMes(meses[0]);
  return `${etiquetaMes(meses[0])} a ${etiquetaMes(meses[meses.length - 1])}`;
}

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
  /** Lo que se cobra EN TOTAL. Con meses > 1 el backend lo reparte entre los
   *  meses cubiertos, así cada mes queda con lo que le toca. */
  monto: number;
  /** Primer mes que cubre el cobro */
  mes_pagado: string;
  fecha_pago: string;
  metodo_pago?: string;
  numero_operacion?: string;
  /** Meses que paga de una vez (1 a 12) */
  meses?: number;
  /** Rebaja aplicada, solo para dejar constancia: `monto` ya viene con ella descontada */
  descuento?: number;
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

/** El recibo en PDF, tal cual se le manda al cliente por WhatsApp. */
export async function getReciboPdfBlobUrl(pagoId: number): Promise<string> {
  const { data } = await api.get(`/pagos/${pagoId}/recibo-pdf`, { responseType: 'blob' });
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
