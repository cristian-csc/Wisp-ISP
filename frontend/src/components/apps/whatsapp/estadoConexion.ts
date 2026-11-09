import type { WhatsappStatus } from 'src/lib/whatsapp';

/** Los cuatro estados que el sistema distingue de verdad.
 *
 *  Salen de lo que responde `/api/whatsapp/status`, que a su vez consulta al
 *  bot: no hay estados inventados.
 *   - conectado:    el bot dice que el número está vinculado.
 *   - desconectado: el bot responde, pero no hay número vinculado.
 *   - error:        el backend no pudo hablar con el servicio de WhatsApp,
 *                   o el panel no pudo hablar con el backend.
 *   - conectando:   todavía no llegó la primera respuesta.
 */
export type EstadoConexion = 'conectado' | 'desconectado' | 'conectando' | 'error';

export type DescripcionEstado = {
  estado: EstadoConexion;
  etiqueta: string;
  /** Clases del badge */
  clases: string;
  /** Color del puntito */
  punto: string;
  icono: string;
  /** Texto corto para la cabecera de la tarjeta de vinculación */
  titulo: string;
  detalle: string;
  /** Solo en estado de error: el motivo exacto que dio el servidor. Va en el
   *  aviso de abajo, no en la cabecera, para no repetir el mismo texto dos
   *  veces en la misma tarjeta. */
  mensajeError?: string;
};

export function describirEstado(
  status: WhatsappStatus | null,
  primeraCargaHecha: boolean,
): DescripcionEstado {
  if (!primeraCargaHecha) {
    return {
      estado: 'conectando',
      etiqueta: 'Conectando…',
      clases: 'bg-lightwarning text-warning-text',
      punto: 'bg-warning',
      icono: 'tabler:loader-2',
      titulo: 'Consultando el servicio',
      detalle: 'Un momento…',
    };
  }
  // status null tras la primera carga = la petición falló.
  if (!status || status.error) {
    return {
      estado: 'error',
      etiqueta: 'Error',
      clases: 'bg-lighterror text-error-text',
      punto: 'bg-error',
      icono: 'tabler:alert-triangle',
      titulo: 'Servicio de WhatsApp no disponible',
      detalle: 'Revisa el detalle más abajo',
      mensajeError: status?.error ?? 'El panel no obtuvo respuesta del servidor.',
    };
  }
  if (status.connected) {
    return {
      estado: 'conectado',
      etiqueta: 'Conectado',
      clases: 'bg-lightsuccess text-success-text',
      punto: 'bg-success',
      icono: 'tabler:circle-check',
      titulo: 'Número vinculado',
      detalle: status.phone ?? 'Vinculado',
    };
  }
  return {
    estado: 'desconectado',
    etiqueta: 'Desconectado',
    clases: 'bg-lighterror text-error-text',
    punto: 'bg-error',
    icono: 'tabler:plug-connected-x',
    titulo: 'Sin vincular',
    detalle: 'Escanea el código QR para conectar',
  };
}
