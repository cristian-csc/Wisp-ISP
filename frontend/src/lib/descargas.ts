import { api } from './api';

/** Formatos en los que se puede bajar un reporte. */
export type FormatoReporte = 'excel' | 'pdf';

/** Saca el nombre del archivo de la cabecera Content-Disposition.
 *  Si el backend no lo manda, se usa el nombre de reserva. */
function nombreDeCabecera(cabecera: unknown, reserva: string): string {
  if (typeof cabecera !== 'string') return reserva;
  // filename*=UTF-8''... tiene prioridad sobre filename="..."
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      /* cabecera mal formada: seguimos con filename= */
    }
  }
  const simple = /filename="?([^";]+)"?/i.exec(cabecera);
  return simple ? simple[1].trim() : reserva;
}

/** Dispara la descarga de un blob en el navegador. */
export function guardarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después de que el navegador tomó el archivo.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Pide un archivo al backend y lo descarga con el nombre que éste indique. */
export async function descargarDeApi(
  ruta: string,
  params: Record<string, unknown>,
  nombreDeReserva: string,
) {
  const respuesta = await api.get(ruta, { params, responseType: 'blob' });
  const nombre = nombreDeCabecera(
    respuesta.headers?.['content-disposition'],
    nombreDeReserva,
  );
  guardarBlob(respuesta.data as Blob, nombre);
}
