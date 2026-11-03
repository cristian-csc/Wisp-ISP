import { api } from './api';
import type { Usuario } from './api';

export type UsuarioCreateInput = {
  nombre: string;
  email: string;
  password: string;
  rol: Usuario['rol'];
  telefono?: string;
  dni?: string;
  direccion?: string;
  fecha_ingreso?: string;
};

export async function listUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get('/auth/usuarios');
  return data;
}

export async function createUsuario(input: UsuarioCreateInput): Promise<Usuario> {
  const { data } = await api.post('/auth/usuarios', input);
  return data;
}

export async function updateUsuario(id: number, patch: Partial<Pick<Usuario, 'nombre' | 'rol' | 'activo' | 'telefono' | 'dni' | 'direccion' | 'fecha_ingreso'>>): Promise<Usuario> {
  const { data } = await api.put(`/auth/usuarios/${id}`, patch);
  return data;
}

/** Solo deja borrar usuarios sin historial real (sin clientes, pagos,
 * averías, etc. a su nombre) — el backend lo valida y devuelve el detalle
 * de qué tiene asociado si bloquea el borrado. */
export async function eliminarUsuario(id: number): Promise<void> {
  await api.delete(`/auth/usuarios/${id}`);
}
