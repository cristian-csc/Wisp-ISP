import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wisp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Sesión expirada o token inválido: se limpia y se pide entrar de nuevo.
    // Se excluye el propio login, porque ahí un 401 significa "credenciales
    // incorrectas" y debe mostrarlo el formulario, no provocar una recarga.
    const esLogin = String(err.config?.url ?? '').includes('/auth/login');
    if (err.response?.status === 401 && !esLogin) {
      localStorage.removeItem('wisp_token');
      if (!window.location.pathname.endsWith('/login')) {
        window.location.assign('/app/login');
      }
    }
    return Promise.reject(err);
  }
);

export type LoginResponse = { access_token: string; token_type: string };

export async function login(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const { data } = await api.post<LoginResponse>('/auth/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  localStorage.setItem('wisp_token', data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem('wisp_token');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('wisp_token');
}

export type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: 'super_admin' | 'admin' | 'subadmin' | 'tecnico' | 'vendedor_campo' | 'vendedor_tienda';
  activo: boolean;
  telefono: string | null;
  dni: string | null;
  direccion: string | null;
  fecha_ingreso: string | null;
};

export async function getMe(): Promise<Usuario> {
  const { data } = await api.get<Usuario>('/auth/me');
  return data;
}

/** Autoservicio — cualquier usuario puede actualizar su propio teléfono y
 * dirección. Nombre, DNI, fecha de ingreso, rol y activo los controla solo
 * el administrador desde "Usuarios". */
export async function updateMiPerfil(data: { telefono?: string; direccion?: string }): Promise<Usuario> {
  const { data: out } = await api.put<Usuario>('/auth/me', data);
  return out;
}

export async function cambiarPassword(passwordActual: string, passwordNueva: string): Promise<void> {
  await api.put('/auth/password', { password_actual: passwordActual, password_nueva: passwordNueva });
}

export type DashboardStats = {
  total_clientes: number;
  clientes_activos: number;
  clientes_suspendidos: number;
  ingresos_mes_actual: number;
  ingresos_mes_anterior: number;
  gastos_mes_actual: number;
  total_zonas: number;
  pagos_pendientes: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<DashboardStats>('/dashboard/stats');
  return data;
}

export type MesFinanzas = {
  mes: string;
  nombre_mes: string;
  ingresos: number;
  gastos: number;
};

export async function getIngresosMensual(anio?: number): Promise<MesFinanzas[]> {
  const { data } = await api.get<MesFinanzas[]>('/dashboard/ingresos-mensual', {
    params: anio ? { anio } : undefined,
  });
  return data;
}

export type Movimiento = {
  id: number;
  tipo: string;
  descripcion: string;
  cliente_nombre: string;
  creado_en: string;
};

export async function getUltimasActivaciones(limit = 8): Promise<Movimiento[]> {
  const { data } = await api.get<Movimiento[]>('/dashboard/ultimas-activaciones', { params: { limit } });
  return data;
}

/** Cuenta clientes por estado sin traer la lista: el endpoint pagina y devuelve `total`. */
export async function contarClientesPorEstado(estado: string): Promise<number> {
  const { data } = await api.get<{ total: number }>('/clientes', { params: { estado, per_page: 1 } });
  return data.total;
}

/** Averías sin resolver. El endpoint sólo filtra por un estado a la vez, así que
 * se descartan las resueltas aquí: cualquier estado nuevo cuenta como abierto. */
export async function contarAveriasAbiertas(): Promise<number> {
  const { data } = await api.get<{ estado: string }[]>('/averias');
  return data.filter((a) => a.estado !== 'resuelta').length;
}

export async function contarRetirosPendientes(): Promise<number> {
  const { data } = await api.get<unknown[]>('/ordenes-retiro', { params: { estado: 'pendiente' } });
  return data.length;
}
