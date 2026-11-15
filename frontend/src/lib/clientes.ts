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
  /** Razón social cuando el cliente es una empresa */
  nombre: string;
  tipo_documento: TipoDocumento;
  dni: string | null;
  ruc: string | null;
  responsable_nombre: string | null;
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
  zona_id: number | null;
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

export type TipoDocumento = 'dni' | 'ruc';

export type ClienteCreateInput = {
  /** Razón social cuando el cliente es una empresa */
  nombre: string;
  tipo_documento?: TipoDocumento;
  /** DNI del que salen las credenciales PPPoE: del titular si es persona,
   *  del responsable si es empresa. Nunca el RUC, que es público. */
  dni: string;
  ruc?: string;
  responsable_nombre?: string;
  telefono?: string;
  telefono_whatsapp?: string;
  direccion?: string;
  lat?: number;
  lng?: number;
  /** Obligatoria salvo para satelitales, que no pertenecen a ninguna zona */
  zona_id?: number;
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

export type IpsDisponibles = {
  zona: string;
  pool: string | null;
  total_pool: number;
  ocupadas: number;
  total_libres: number;
  /** La que ya tiene apuntada el panel, si la tiene. */
  ip_actual: string | null;
  /** La primera libre: la que se propone por defecto. */
  sugerida: string | null;
  /** Recortada a 200 por el servidor; con eso hay de sobra para elegir. */
  disponibles: string[];
};

/** Las IP del pool PPPoE que estan libres en el router de la zona.
 *  Habla con el router, asi que tarda unos segundos. */
export async function ipsDisponibles(id: number): Promise<IpsDisponibles> {
  const { data } = await api.get(`/clientes/${id}/ips-disponibles`);
  return data;
}

/** Aprueba la instalacion. La IP fija es opcional: sin ella el router le da
 *  una del pool, pero entonces el corte por IP no es fiable. */
export async function aprobarCliente(id: number, ipEstatica?: string | null) {
  const { data } = await api.post(
    `/clientes/${id}/aprobar`,
    ipEstatica ? { ip_estatica: ipEstatica } : {},
  );
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


export type ConsultaDocumento = {
  encontrado: boolean;
  nombre: string | null;
  /** 'sistema' = ya es cliente · 'proveedor' = se consultó · lo demás, el motivo */
  origen: 'sistema' | 'proveedor' | 'formato' | 'sin_token' | 'sin_cuota' | 'no_existe' | 'sin_respuesta' | 'error_proveedor';
  motivo: string | null;
  cliente_id?: number;
  estado?: string | null;
  condicion?: string | null;
  direccion?: string | null;
  uso: { usadas: number; limite: number; restantes: number; aviso: boolean; agotado: boolean };
};

/** Busca el nombre de un DNI o la razón social de un RUC. La consulta la hace
 *  el backend (el token del proveedor no sale de ahí) y nunca lanza error:
 *  si algo falla devuelve el motivo y el nombre se escribe a mano. */
export async function consultarDocumento(tipo: 'dni' | 'ruc', numero: string) {
  const res = await api.get<ConsultaDocumento>('/consultas/documento', {
    params: { tipo, numero },
  });
  return res.data;
}

/** Cuantos clientes hay en cada estado. Una sola consulta al servidor: antes
 *  la pantalla pedia una lista entera por tarjeta solo para leer su total. */
export type ResumenEstados = {
  total: number;
  /** Todos los estados vienen siempre, aunque esten a cero. */
  por_estado: Record<EstadoCliente, number>;
};

export async function resumenEstados(params?: {
  tipo_conexion?: string;
  zona_id?: number;
}): Promise<ResumenEstados> {
  const { data } = await api.get('/clientes/resumen-estados', { params });
  return data;
}

/** Como se llama cada estado en pantalla, y de que color va. En un solo sitio
 *  para que el filtro, las tarjetas y la tabla no se contradigan. */
export const ESTADOS_CLIENTE: {
  valor: EstadoCliente;
  etiqueta: string;
  tono: 'success' | 'warning' | 'error' | 'primary' | 'muted';
}[] = [
  { valor: 'activo', etiqueta: 'Activos', tono: 'success' },
  { valor: 'pendiente_aprobacion', etiqueta: 'Pendientes de aprobacion', tono: 'warning' },
  { valor: 'aprobado', etiqueta: 'Aprobados, sin instalar', tono: 'primary' },
  { valor: 'no_instalado', etiqueta: 'No instalados', tono: 'error' },
  { valor: 'suspendido', etiqueta: 'Suspendidos', tono: 'error' },
  { valor: 'pausado', etiqueta: 'Pausados', tono: 'warning' },
  { valor: 'rechazado', etiqueta: 'Rechazados', tono: 'muted' },
  { valor: 'anulado', etiqueta: 'Anulados', tono: 'muted' },
];
