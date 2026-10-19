import { api, type Usuario } from './api';

export type EstadoCliente =
  | 'pendiente_aprobacion'
  | 'rechazado'
  | 'aprobado'
  | 'no_instalado'
  | 'activo'
  | 'anulado'
  | 'suspendido'
  | 'pausado';

export type TipoConexion = 'fibra_optica' | 'inalambrico' | 'satelital';

export type Zona = { id: number; nombre: string };
export type Plan = {
  id: number;
  codigo: string;
  nombre: string;
  bajada_mbps: number;
  subida_mbps: number;
  precio: number;
  incluye_tv: boolean;
  tv_incluidas: number;
  precio_tv_adicional: number | null;
  descripcion: string | null;
  activo: boolean;
  tipo_conexion: TipoConexion;
  costo_proveedor: number | null;
};

export type DetalleMontoItem = { concepto: string; monto: number };

export type EstadoEquipo = 'prestado' | 'comprado' | 'sin_equipo';

export type ClienteListItem = {
  id: number;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  usuario_pppoe: string;
  ip_estatica: string | null;
  estado: EstadoCliente;
  tipo_conexion: TipoConexion | null;
  cantidad_tv: number;
  zona: Zona | null;
  plan: Plan | null;
  fecha_instalacion: string | null;
  fecha_vencimiento: string | null;
  pausa_hasta: string | null;
  compromiso_pago_hasta: string | null;
  monto_mensual: number | null;
  monto_mensual_detalle: DetalleMontoItem[] | null;
  cuenta_starlink_email: string | null;
};

export type ClienteOut = ClienteListItem & {
  telefono_whatsapp: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  password_pppoe: string;
  zona_id: number;
  plan_id: number;
  motivo_rechazo: string | null;
  motivo_no_instalado: string | null;
  vendedor_id: number | null;
  aprobado_por_id: number | null;
  tecnico_instalador_id: number | null;
  vendedor: Usuario | null;
  aprobado_por: Usuario | null;
  tecnico_instalador: Usuario | null;
  borne: {
    numero: number;
    codigo_precinto: string | null;
    potencia_optica_dbm: number | null;
    caja_nap: { id: number; codigo: string } | null;
  } | null;
  fecha_aprobacion: string | null;
  metros_cable: number | null;
  notas: string | null;
  creado_en: string;
  estado_equipo: EstadoEquipo | null;
  equipo_marca: string | null;
  equipo_modelo: string | null;
  equipo_serial: string | null;
  equipo_valor: number | null;
  equipo_fecha_entrega: string | null;
};

export type ClientesPage = {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: ClienteListItem[];
};

export async function listClientes(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  zona_id?: number;
  estado?: EstadoCliente;
  tipo_conexion?: string;
}): Promise<ClientesPage> {
  const { data } = await api.get<ClientesPage>('/clientes', { params });
  return data;
}

export async function getCliente(id: number): Promise<ClienteOut> {
  const { data } = await api.get<ClienteOut>(`/clientes/${id}`);
  return data;
}

export async function updateCliente(id: number, data: {
  nombre?: string;
  telefono?: string | null;
  telefono_whatsapp?: string | null;
  direccion?: string | null;
  zona_id?: number;
  plan_id?: number;
  cantidad_tv?: number;
  tipo_conexion?: TipoConexion;
  notas?: string | null;
  cuenta_starlink_email?: string | null;
  estado_equipo?: EstadoEquipo;
  equipo_marca?: string;
  equipo_modelo?: string;
  equipo_serial?: string;
  equipo_valor?: number;
  equipo_fecha_entrega?: string;
}): Promise<ClienteOut> {
  const { data: out } = await api.put<ClienteOut>(`/clientes/${id}`, data);
  return out;
}

export type ClienteCreateInput = {
  nombre: string;
  dni: string;
  telefono?: string;
  telefono_whatsapp?: string;
  direccion?: string;
  lat?: number;
  lng?: number;
  zona_id: number;
  plan_id: number;
  cantidad_tv?: number;
  tipo_conexion?: TipoConexion;
  notas?: string;
};

export async function createCliente(data: ClienteCreateInput) {
  const res = await api.post<{ cliente: ClienteOut }>('/clientes', data);
  return res.data.cliente;
}

export async function activarSatelital(id: number, data: {
  cuenta_starlink_email?: string;
  estado_equipo?: EstadoEquipo;
  equipo_marca?: string;
  equipo_modelo?: string;
  equipo_serial?: string;
  equipo_valor?: number;
  equipo_fecha_entrega?: string;
}): Promise<ClienteOut> {
  const { data: out } = await api.post<ClienteOut>(`/clientes/${id}/activar-satelital`, data);
  return out;
}

export async function aprobarCliente(id: number) {
  const { data } = await api.post(`/clientes/${id}/aprobar`);
  return data as { ok: boolean; estado: string; mikrotik_ok: boolean; mikrotik_ya_existia: boolean; mikrotik_msg: string };
}

export async function rechazarCliente(id: number, motivo: string) {
  const { data } = await api.post(`/clientes/${id}/rechazar`, { motivo });
  return data;
}

export async function noInstalarCliente(id: number, motivo: string) {
  const { data } = await api.post(`/clientes/${id}/no-instalar`, { motivo });
  return data;
}

export async function cortarCliente(id: number) {
  const { data } = await api.post(`/clientes/${id}/cortar`);
  return data;
}

export async function reactivarCliente(id: number) {
  const { data } = await api.post(`/clientes/${id}/reactivar`);
  return data;
}

export async function pausarCliente(id: number, meses: number) {
  const { data } = await api.post(`/clientes/${id}/pausar`, { meses });
  return data as { ok: boolean; estado: string; pausa_hasta: string; mikrotik_ok: boolean };
}

export async function darCompromisoPago(id: number, fechaLimite: string) {
  const { data } = await api.post(`/clientes/${id}/compromiso-pago`, { fecha_limite: fechaLimite });
  return data as { ok: boolean; estado: string; compromiso_pago_hasta: string; mikrotik_ok: boolean };
}

export type MesPago = { mes: string; estado: 'pagado' | 'vencido' | 'pendiente' | 'no_aplica' | 'futuro' };

export async function getCalendarioPagos(clienteId: number, anio?: number): Promise<MesPago[]> {
  const { data } = await api.get(`/clientes/${clienteId}/calendario-pagos`, { params: anio ? { anio } : undefined });
  return data;
}

export type PppoeStatus = {
  conectado: boolean;
  uptime: string | null;
  ip_remota: string | null;
  error: string | null;
};

export async function getPppoeStatus(clienteId: number): Promise<PppoeStatus> {
  const { data } = await api.get(`/clientes/${clienteId}/pppoe-status`);
  return data;
}

export async function listZonas(): Promise<Zona[]> {
  const { data } = await api.get('/zonas');
  return data;
}

export async function listPlanes(params?: { tipo_conexion?: TipoConexion }): Promise<Plan[]> {
  const { data } = await api.get('/planes', { params });
  return data;
}
