import { api } from './api';
import type { Usuario } from './api';

export type UsuarioCreateInput = {
  nombre: string;
  email: string;
  password: string;
  rol: Usuario['rol'];
};

export async function listUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get('/auth/usuarios');
  return data;
}

export async function createUsuario(input: UsuarioCreateInput): Promise<Usuario> {
  const { data } = await api.post('/auth/usuarios', input);
  return data;
}

export async function updateUsuario(id: number, patch: Partial<Pick<Usuario, 'nombre' | 'rol' | 'activo'>>): Promise<Usuario> {
  const { data } = await api.put(`/auth/usuarios/${id}`, patch);
  return data;
}
