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
    if (err.response?.status === 401) {
      localStorage.removeItem('wisp_token');
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
};

export async function getMe(): Promise<Usuario> {
  const { data } = await api.get<Usuario>('/auth/me');
  return data;
}
