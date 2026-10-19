import { api } from './api';
import type { Usuario } from './api';

export type WhatsappStatus = {
  connected: boolean;
  status: string;
  phone: string | null;
  has_qr?: boolean;
  error?: string;
};

export async function getWhatsappStatus(): Promise<WhatsappStatus> {
  const { data } = await api.get('/whatsapp/status');
  return data;
}

export async function getWhatsappQr(): Promise<{ qr: string | null }> {
  const { data } = await api.get('/whatsapp/qr');
  return data;
}

// ── Mensajes masivos ──────────────────────────────────────────────────────────

export type EstadoMensajeMasivo = 'en_progreso' | 'completado' | 'cancelado';

export type MensajeMasivo = {
  id: number;
  mensaje: string;
  plantilla_nombre: string | null;
  zona_ids: number[] | null; // null = todas las zonas
  estados_incluidos: string[];
  total_destinatarios: number;
  enviados: number;
  fallidos: number;
  estado: EstadoMensajeMasivo;
  creado_por: Usuario | null;
  creado_en: string;
  finalizado_en: string | null;
};

export async function contarDestinatariosMasivo(params: { zonaIds?: number[]; estados: string[] }): Promise<number> {
  const { data } = await api.get('/whatsapp/masivos/destinatarios-count', {
    params: {
      zona_ids: params.zonaIds && params.zonaIds.length ? params.zonaIds.join(',') : undefined,
      estados: params.estados.join(','),
    },
  });
  return data.count;
}

export async function crearMensajeMasivo(input: {
  zona_ids?: number[];
  estados: string[];
  mensaje: string;
  plantilla_nombre?: string;
}): Promise<MensajeMasivo> {
  const { data } = await api.post('/whatsapp/masivos', input);
  return data;
}

export async function listMensajesMasivos(): Promise<MensajeMasivo[]> {
  const { data } = await api.get('/whatsapp/masivos');
  return data;
}

export async function getMensajeMasivo(id: number): Promise<MensajeMasivo> {
  const { data } = await api.get(`/whatsapp/masivos/${id}`);
  return data;
}

export async function enviarAvisoCobro(clienteId: number): Promise<{ ok: boolean }> {
  const { data } = await api.post(`/whatsapp/aviso-cobro/${clienteId}`);
  return data;
}

export async function cancelarMensajeMasivo(id: number): Promise<MensajeMasivo> {
  const { data } = await api.post(`/whatsapp/masivos/${id}/cancelar`);
  return data;
}

/** Recordatorio de pago a todos los clientes activos que no pagaron el mes
 * indicado (o el actual si no se indica) — usa el mismo motor con pausa
 * aleatoria entre envíos que el mensaje masivo por zona. */
export async function crearRecordatorioCobros(mes?: string): Promise<MensajeMasivo> {
  const { data } = await api.post('/whatsapp/broadcast-cobros', null, { params: mes ? { mes } : undefined });
  return data;
}
