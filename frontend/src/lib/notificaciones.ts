import { api } from './api';

export type Notificacion = {
  tipo: 'pendiente_aprobacion' | 'instalado' | 'no_instalado' | 'averia_demorada' | 'jornada_iniciada' | 'whatsapp_desconectado';
  titulo: string;
  detalle: string;
  url: string;
  fecha: string;
};

export async function listNotificaciones(): Promise<Notificacion[]> {
  const { data } = await api.get<Notificacion[]>('/clientes/notificaciones');
  return data;
}
