import * as SecureStore from 'expo-secure-store';

/** En desarrollo apunta al backend local (mobile/.env, EXPO_PUBLIC_API_URL) —
 * necesita ser la IP LAN de la PC, no localhost, para que el celular lo alcance
 * por WiFi. Sin esa variable, cae a producción (usado en builds reales). */
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://dominiowisp.com/api';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de red' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type LoginAdminResponse = { access_token: string; token_type: string };
export type LoginClienteResponse = {
  access_token: string;
  token_type: string;
  role: string;
  cliente_id: number;
  nombre: string;
};

export async function loginAdmin(
  email: string,
  password: string,
): Promise<LoginAdminResponse> {
  const body = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Credenciales incorrectas' }));
    throw new Error(err.detail ?? 'Credenciales incorrectas');
  }
  return res.json();
}

export type RolStaff = 'super_admin' | 'admin' | 'subadmin' | 'tecnico' | 'vendedor_campo' | 'vendedor_tienda';
export type UsuarioMe = { id: number; nombre: string; email: string; rol: RolStaff; activo: boolean };

/** Trae el usuario autenticado — se usa justo después de loginAdmin para saber
 * su rol real y a qué sección del app enrutarlo (login no lo devuelve).
 * Recibe el token directamente porque se llama antes de que signIn() lo
 * persista en el storage de la sesión. */
export async function getMeWithToken(token: string): Promise<UsuarioMe> {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'No se pudo obtener el usuario' }));
    throw new Error(err.detail ?? 'No se pudo obtener el usuario');
  }
  return res.json();
}

export async function loginCliente(
  usuario: string,
  pin: string,
): Promise<LoginClienteResponse> {
  return request('/auth/cliente/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, pin }),
  });
}

// ── Cliente (app móvil) ───────────────────────────────────────────────────────

export type MiCuenta = {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  estado: 'activo' | 'suspendido' | 'anulado';
  plan: { nombre: string; bajada_mbps: number; subida_mbps: number; precio: number } | null;
  fecha_vencimiento: string | null;
  fecha_instalacion: string | null;
};

export async function getMiCuenta(): Promise<MiCuenta> {
  return request('/cliente/me');
}

export async function cambiarPin(pinActual: string, pinNuevo: string): Promise<void> {
  return request('/cliente/cambiar-pin', {
    method: 'POST',
    body: JSON.stringify({ pin_actual: pinActual, pin_nuevo: pinNuevo }),
  });
}

export type Pago = {
  id: number;
  mes_pagado: string;
  fecha_pago: string;
  monto: number;
  metodo_pago: string;
  numero_operacion: string | null;
};

export async function getMisPagos(page = 1): Promise<{ items: Pago[]; total: number; pages: number }> {
  return request(`/cliente/mis-pagos?page=${page}&per_page=12`);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export type DashboardStats = {
  total_clientes: number;
  clientes_activos: number;
  clientes_suspendidos: number;
  ingresos_mes_actual: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  return request('/dashboard/stats');
}

// ── Admin: Clientes ───────────────────────────────────────────────────────────

export type MesPago = { mes: string; estado: 'pagado' | 'vencido' | 'pendiente' | 'no_aplica' };

export type EstadoCliente =
  | 'pendiente_aprobacion'
  | 'aprobado'
  | 'rechazado'
  | 'activo'
  | 'no_instalado'
  | 'suspendido'
  | 'anulado';

export type ClienteListItem = {
  id: number;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  usuario_pppoe: string;
  ip_estatica: string | null;
  lat: number | null;
  lng: number | null;
  estado: EstadoCliente;
  tipo_conexion: 'fibra_optica' | 'inalambrico' | null;
  cantidad_tv: number;
  plan: { id: number; nombre: string; precio: number } | null;
  zona: { id: number; nombre: string } | null;
  fecha_instalacion: string | null;
  fecha_vencimiento: string | null;
  monto_mensual: number | null;
  meses_pago?: MesPago[];
};

export async function getClientes(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  estado?: string;
  zona_id?: number;
}): Promise<{ items: ClienteListItem[]; total: number; pages: number }> {
  const q = new URLSearchParams({
    page: String(params?.page ?? 1),
    per_page: String(params?.per_page ?? 50),
    ...(params?.search ? { search: params.search } : {}),
    ...(params?.estado ? { estado: params.estado } : {}),
    ...(params?.zona_id ? { zona_id: String(params.zona_id) } : {}),
  });
  return request(`/clientes?${q}`);
}

export type ClienteDetalle = ClienteListItem & {
  direccion: string | null;
  password_pppoe: string;
  pin_app: string | null;
  motivo_rechazo?: string | null;
  motivo_no_instalado?: string | null;
};

export async function getCliente(id: number): Promise<ClienteDetalle> {
  return request(`/clientes/${id}`);
}

/** Registro de captación (vendedor/técnico en campo). El usuario/clave PPPoE
 * se derivan del DNI en el backend — acá no se envían. Queda `pendiente_aprobacion`. */
export type ClienteRegistroInput = {
  nombre: string;
  dni: string;
  telefono?: string | null;
  telefono_whatsapp?: string | null;
  direccion?: string | null;
  lat?: number | null;
  lng?: number | null;
  zona_id: number;
  plan_id: number;
  cantidad_tv?: number;
  tipo_conexion?: 'fibra_optica' | 'inalambrico';
  notas?: string | null;
};

export async function crearCliente(data: ClienteRegistroInput): Promise<{ cliente: ClienteDetalle }> {
  return request('/clientes', { method: 'POST', body: JSON.stringify(data) });
}

export async function aprobarCliente(id: number): Promise<{ ok: boolean; mikrotik_ok: boolean; mikrotik_msg: string }> {
  return request(`/clientes/${id}/aprobar`, { method: 'POST' });
}

export async function rechazarCliente(id: number, motivo: string): Promise<void> {
  return request(`/clientes/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });
}

export type InstalarClienteInput = {
  caja_nap_id: number;
  numero_borne: number;
  onu_id: number;
  metros_cable?: number;
  potencia_optica_dbm?: number;
  codigo_precinto?: string;
};

export async function instalarCliente(id: number, data: InstalarClienteInput): Promise<void> {
  return request(`/clientes/${id}/instalar`, { method: 'POST', body: JSON.stringify(data) });
}

export async function noInstalarCliente(id: number, motivo: string): Promise<void> {
  return request(`/clientes/${id}/no-instalar`, { method: 'POST', body: JSON.stringify({ motivo }) });
}

export async function suspenderCliente(id: number): Promise<void> {
  return request(`/clientes/${id}/cortar`, { method: 'POST' });
}

export async function activarCliente(id: number): Promise<void> {
  return request(`/clientes/${id}/reactivar`, { method: 'POST' });
}

export async function registrarPago(data: {
  cliente_id: number;
  monto: number;
  mes_pagado: string;
  fecha_pago: string;
  metodo_pago: string;
  numero_operacion?: string;
}): Promise<void> {
  return request('/pagos', { method: 'POST', body: JSON.stringify(data) });
}

export async function getZonas(): Promise<{ id: number; nombre: string }[]> {
  const data: { items: { id: number; nombre: string }[] } = await request('/zonas?per_page=100');
  return data.items ?? data;
}

export async function getPlanes(): Promise<{ id: number; nombre: string; precio: number }[]> {
  return request('/planes?activo=true');
}

// ── ONUs (inventario) ────────────────────────────────────────────────────────

export type EstadoOnu = 'en_almacen' | 'asignado_tecnico' | 'instalado' | 'danado' | 'perdido';

export type Onu = {
  id: number;
  numero_serie: string;
  mac: string | null;
  marca: string | null;
  wifi_version: string | null;
  estado: EstadoOnu;
  tecnico_id: number | null;
  cliente_id: number | null;
  fecha_asignacion_tecnico: string | null;
  fecha_instalacion: string | null;
};

/** Sin filtro de técnico: el backend ya limita a "mis ONUs" cuando el
 * usuario autenticado tiene rol técnico. */
export async function getOnus(params?: { estado?: EstadoOnu }): Promise<Onu[]> {
  const q = new URLSearchParams();
  if (params?.estado) q.set('estado', params.estado);
  const qs = q.toString();
  return request(`/onus${qs ? `?${qs}` : ''}`);
}

export async function marcarOnu(id: number, estado: 'danado' | 'perdido' | 'en_almacen'): Promise<Onu> {
  return request(`/onus/${id}/marcar`, { method: 'POST', body: JSON.stringify({ estado }) });
}

export type WifiVersion = 'wifi5' | 'wifi6';

/** El N° de serie GPON trae de fábrica el prefijo del fabricante: ASKY = Askey,
 * MSTC = Mitrastar. Permite llenar la marca sola en cuanto se escanea. */
export function detectarMarcaOnu(numeroSerie: string): string | null {
  const s = numeroSerie.trim().toUpperCase();
  if (s.startsWith('ASKY')) return 'Askey';
  if (s.startsWith('MSTC')) return 'Mitrastar';
  return null;
}

/** El técnico registra en el sistema un equipo que el almacén le dio sin
 * pasar antes por el sistema (escaneado en campo) — queda asignado a él
 * directamente, sin pasar por el stock general del admin. */
export async function registrarOnuPropio(data: {
  numero_serie: string;
  mac?: string;
  marca?: string;
  wifi_version?: WifiVersion;
}): Promise<Onu> {
  return request('/onus/registrar-propio', { method: 'POST', body: JSON.stringify(data) });
}

// ── Cajas NAP / Bornes ────────────────────────────────────────────────────────

export type Borne = {
  id: number;
  numero: number;
  estado: 'libre' | 'ocupado' | 'danado';
  cliente_id: number | null;
  codigo_precinto: string | null;
  cliente: { id: number; nombre: string } | null;
};

export async function setCodigoPrecinto(borneId: number, codigoPrecinto: string | null): Promise<Borne> {
  return request(`/cajas-nap/bornes/${borneId}/precinto`, {
    method: 'PUT',
    body: JSON.stringify({ codigo_precinto: codigoPrecinto }),
  });
}

export type CajaNap = {
  id: number;
  codigo: string;
  zona_id: number;
  mufa_id: number | null;
  lat: number | null;
  lng: number | null;
  capacidad_bornes: number;
  descripcion: string | null;
  activo: boolean;
  bornes: Borne[];
};

/** Sin filtro de zona: el backend ya limita a las zonas asignadas cuando el
 * usuario autenticado es técnico. */
export async function getCajasNap(zonaId?: number): Promise<CajaNap[]> {
  return request(`/cajas-nap${zonaId ? `?zona_id=${zonaId}` : ''}`);
}

export async function getCajaNap(id: number): Promise<CajaNap> {
  return request(`/cajas-nap/${id}`);
}

// ── Mufas ─────────────────────────────────────────────────────────────────────

export type Mufa = {
  id: number;
  codigo: string;
  zona_id: number;
  lat: number | null;
  lng: number | null;
  descripcion: string | null;
  activo: boolean;
  total_cajas: number;
};

/** Sin filtro de zona: el backend ya limita a las zonas asignadas cuando el
 * usuario autenticado es técnico. */
export async function getMufas(zonaId?: number): Promise<Mufa[]> {
  return request(`/mufas${zonaId ? `?zona_id=${zonaId}` : ''}`);
}

// ── Averías ───────────────────────────────────────────────────────────────────

export type EstadoAveria = 'pendiente' | 'asignada' | 'en_proceso' | 'resuelta';

export type Averia = {
  id: number;
  cliente_id: number | null;
  caja_nap_id: number | null;
  borne_id: number | null;
  motivo_reportado: string;
  diagnostico_solucion: string | null;
  estado: EstadoAveria;
  tecnico_asignado_id: number | null;
  onu_reemplazada_id: number | null;
  onu_nueva_id: number | null;
  potencia_optica_dbm: number | null;
  fecha_reporte: string;
  fecha_atencion: string | null;
  cliente: { id: number; nombre: string; dni: string | null; zona: { id: number; nombre: string } | null } | null;
  caja_nap: { id: number; codigo: string; zona: { id: number; nombre: string } | null } | null;
};

export async function getAveria(id: number): Promise<Averia> {
  return request(`/averias/${id}`);
}

export async function getAverias(params?: { estado?: EstadoAveria; cliente_id?: number }): Promise<Averia[]> {
  const q = new URLSearchParams();
  if (params?.estado) q.set('estado', params.estado);
  if (params?.cliente_id) q.set('cliente_id', String(params.cliente_id));
  const qs = q.toString();
  return request(`/averias${qs ? `?${qs}` : ''}`);
}

export async function crearAveria(data: {
  cliente_id?: number;
  caja_nap_id?: number;
  borne_id?: number;
  motivo_reportado: string;
}): Promise<Averia> {
  return request('/averias', { method: 'POST', body: JSON.stringify(data) });
}

export async function iniciarAveria(id: number): Promise<Averia> {
  return request(`/averias/${id}/iniciar`, { method: 'POST' });
}

export async function resolverAveria(id: number, data: {
  diagnostico_solucion: string;
  onu_reemplazada_id?: number;
  onu_nueva_id?: number;
  potencia_optica_dbm?: number;
}): Promise<Averia> {
  return request(`/averias/${id}/resolver`, { method: 'POST', body: JSON.stringify(data) });
}

// ── Evidencias (fotos) ───────────────────────────────────────────────────────

/** Sube la foto de la fachada tomada al registrar un cliente. Se llama después
 * de crearCliente() porque el backend exige un cliente_id ya existente. */
export async function subirFotoFachada(clienteId: number, fotoUri: string, descripcion = 'Fachada de la vivienda (registro)'): Promise<void> {
  const token = await getToken();
  const form = new FormData();
  form.append('tipo', 'otro');
  form.append('cliente_id', String(clienteId));
  form.append('descripcion', descripcion);
  form.append('archivo', {
    uri: fotoUri,
    name: 'fachada.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await fetch(`${BASE_URL}/evidencias`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'No se pudo subir la foto' }));
    throw new Error(err.detail ?? 'No se pudo subir la foto');
  }
}

export type Evidencia = {
  id: number;
  averia_id: number | null;
  cliente_id: number | null;
  tipo: 'instalacion' | 'averia' | 'otro';
  ruta_archivo: string;
  descripcion: string | null;
  creado_en: string;
};

export async function getEvidenciasCliente(clienteId: number): Promise<Evidencia[]> {
  return request(`/evidencias?cliente_id=${clienteId}`);
}

export async function getEvidenciasAveria(averiaId: number): Promise<Evidencia[]> {
  return request(`/evidencias?averia_id=${averiaId}`);
}

export async function getEvidenciasOrdenRetiro(ordenRetiroId: number): Promise<Evidencia[]> {
  return request(`/evidencias?orden_retiro_id=${ordenRetiroId}`);
}

/** Las fotos de evidencia requieren el token de auth para descargarse — no
 * son públicas. <Image> de React Native sí soporta headers en el source,
 * a diferencia de un <img> de web (que necesita blob URL). */
export async function getEvidenciaImageSource(evidenciaId: number): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await getToken();
  return {
    uri: `${BASE_URL}/evidencias/${evidenciaId}/archivo`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/** Sube una foto de evidencia para una avería — tanto del problema (al
 * reportarla) como de la solución (al resolverla), distinguidas por
 * `descripcion`, no por un campo nuevo. */
export async function subirEvidenciaAveria(averiaId: number, fotoUri: string, descripcion: string): Promise<void> {
  const token = await getToken();
  const form = new FormData();
  form.append('tipo', 'averia');
  form.append('averia_id', String(averiaId));
  form.append('descripcion', descripcion);
  form.append('archivo', {
    uri: fotoUri,
    name: 'evidencia.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await fetch(`${BASE_URL}/evidencias`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'No se pudo subir la foto' }));
    throw new Error(err.detail ?? 'No se pudo subir la foto');
  }
}

// ── Órdenes de retiro ─────────────────────────────────────────────────────────

/** Recojo de equipo cuando un cliente da de baja el servicio — roseta,
 * patchcord y router/ONU. El cable drop nunca se recoge, queda en la vivienda. */
export type EstadoOrdenRetiro = 'pendiente' | 'completado';

export type OrdenRetiro = {
  id: number;
  cliente_id: number;
  tecnico_asignado_id: number | null;
  motivo: string;
  estado: EstadoOrdenRetiro;
  fecha_solicitud: string;
  fecha_retiro: string | null;
  onu_retirada_id: number | null;
  retiro_roseta: boolean;
  retiro_patchcord: boolean;
  observaciones: string | null;
  cliente: {
    id: number;
    nombre: string;
    dni: string | null;
    telefono: string | null;
    telefono_whatsapp: string | null;
    direccion: string | null;
    estado: string;
    zona: { id: number; nombre: string } | null;
  } | null;
  tecnico_asignado: UsuarioMe | null;
  // La ONU/router hoy instalado en el cliente — el backend la calcula para
  // que el técnico sepa cuál recoger sin tener que adivinar el ID.
  onu_actual: Onu | null;
};

export async function getOrdenesRetiro(estado?: EstadoOrdenRetiro): Promise<OrdenRetiro[]> {
  return request(`/ordenes-retiro${estado ? `?estado=${estado}` : ''}`);
}

export async function getOrdenRetiro(id: number): Promise<OrdenRetiro> {
  return request(`/ordenes-retiro/${id}`);
}

export async function completarOrdenRetiro(id: number, data: {
  onu_retirada_id?: number;
  retiro_roseta: boolean;
  retiro_patchcord: boolean;
  observaciones?: string;
}): Promise<OrdenRetiro> {
  return request(`/ordenes-retiro/${id}/completar`, { method: 'POST', body: JSON.stringify(data) });
}

/** Sube una foto de evidencia del equipo retirado — mismo mecanismo que las
 * fotos de averías, distinguida por `orden_retiro_id` en vez de `averia_id`. */
export async function subirEvidenciaRetiro(ordenId: number, fotoUri: string, descripcion: string): Promise<void> {
  const token = await getToken();
  const form = new FormData();
  form.append('tipo', 'retiro');
  form.append('orden_retiro_id', String(ordenId));
  form.append('descripcion', descripcion);
  form.append('archivo', {
    uri: fotoUri,
    name: 'retiro.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await fetch(`${BASE_URL}/evidencias`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'No se pudo subir la foto' }));
    throw new Error(err.detail ?? 'No se pudo subir la foto');
  }
}
