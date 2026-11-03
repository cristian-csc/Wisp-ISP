import { api } from './api';

export type Evidencia = {
  id: number;
  averia_id: number | null;
  orden_retiro_id: number | null;
  cliente_id: number | null;
  tipo: 'instalacion' | 'averia' | 'retiro' | 'otro';
  ruta_archivo: string;
  descripcion: string | null;
  creado_en: string;
};

export async function listEvidenciasCliente(clienteId: number): Promise<Evidencia[]> {
  const { data } = await api.get('/evidencias', { params: { cliente_id: clienteId } });
  return data;
}

export async function listEvidenciasAveria(averiaId: number): Promise<Evidencia[]> {
  const { data } = await api.get('/evidencias', { params: { averia_id: averiaId } });
  return data;
}

export async function listEvidenciasOrdenRetiro(ordenRetiroId: number): Promise<Evidencia[]> {
  const { data } = await api.get('/evidencias', { params: { orden_retiro_id: ordenRetiroId } });
  return data;
}

/** Las fotos requieren el token de auth para descargarse (no son públicas) —
 * no se puede usar un <img src="..."> directo, hay que traerlas autenticadas
 * y convertirlas a un blob URL para mostrarlas. Llamar URL.revokeObjectURL()
 * con el resultado cuando el componente se desmonte, para no filtrar memoria. */
export async function getEvidenciaBlobUrl(evidenciaId: number): Promise<string> {
  const { data } = await api.get(`/evidencias/${evidenciaId}/archivo`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export async function eliminarEvidencia(evidenciaId: number): Promise<void> {
  await api.delete(`/evidencias/${evidenciaId}`);
}
