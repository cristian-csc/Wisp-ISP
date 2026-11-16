/** Entender una ubicación escrita a mano o pegada de Google Earth / Maps.
 *  Está aparte de la pantalla a propósito: es lógica pura y se puede probar
 *  sin montar nada. */

export type Coordenadas = { lat: number; lng: number };

/** Grados, minutos y segundos a grados decimales. */
function aDecimal(grados: number, minutos: number, segundos: number, hemisferio: string): number {
  const valor = grados + minutos / 60 + segundos / 3600;
  return /[SWsw]/.test(hemisferio) ? -valor : valor;
}

const RE_DMS =
  /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?\s*([NSEWnsew])/g;
const RE_DECIMAL = /-?\d+(?:\.\d+)?/g;

function validar(c: Coordenadas): Coordenadas | null {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return null;
  return c;
}

/**
 * Entiende una ubicación escrita o pegada de cualquiera de las formas en que
 * la dan Google Earth y Google Maps:
 *
 *   -15.491500, -70.129000                        (Maps: "copiar coordenadas")
 *   15°29'29.4"S 70°07'44.1"W                     (Earth, grados y minutos)
 *   <coordinates>-70.129,-15.4915,0</coordinates> (Earth: copiar el sitio)
 *
 * Devuelve null si no logra sacar un par válido, en vez de inventarse un
 * número: un cero colado acá manda la caja al golfo de Guinea.
 */
export function parsearCoordenadas(texto: string): Coordenadas | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  // KML pegado de Google Earth. Ojo: ahí el orden es longitud, latitud.
  const kml = limpio.match(/<coordinates>([^<]+)<\/coordinates>/i);
  if (kml) {
    const partes = kml[1].trim().split(/[\s,]+/).map(Number);
    if (partes.length >= 2 && partes.slice(0, 2).every((n) => Number.isFinite(n))) {
      return validar({ lat: partes[1], lng: partes[0] });
    }
    return null;
  }

  // Grados, minutos y segundos: tienen que ser exactamente dos (lat y lng).
  const dms = [...limpio.matchAll(RE_DMS)];
  if (dms.length === 2) {
    const valores = dms.map((m) =>
      aDecimal(Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4]),
    );
    // Si vienen al revés (primero la longitud), el hemisferio lo delata.
    const esLng = /[EWew]/.test(dms[0][4]);
    return validar(
      esLng ? { lat: valores[1], lng: valores[0] } : { lat: valores[0], lng: valores[1] },
    );
  }

  // Par decimal suelto.
  const numeros = (limpio.match(RE_DECIMAL) ?? []).map(Number);
  if (numeros.length === 2) {
    let [lat, lng] = numeros;
    // "15.4915 S, 70.1290 W" — sin el símbolo de grados pero con hemisferio.
    if (/[Ss]/.test(limpio) && lat > 0) lat = -lat;
    if (/[Ww]/.test(limpio) && lng > 0) lng = -lng;
    return validar({ lat, lng });
  }

  return null;
}

export function formatearCoordenadas(c: Coordenadas | null): string {
  return c ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : '';
}

/**
 * Largo de un trazado en metros, sumando tramo a tramo (fórmula del
 * semiverseno). Es la distancia en línea recta entre los puntos dibujados,
 * no la del cable real, que da más vueltas: sirve para proponer el metraje
 * en vez de dejar que se mida a ojo.
 *
 * El backend calcula lo mismo cuando no se le manda el número; acá se hace
 * para poder proponerlo antes de guardar.
 */
export function metrosDeTrazado(puntos: Coordenadas[]): number | null {
  if (!puntos || puntos.length < 2) return null;
  const R = 6371000; // radio de la Tierra, en metros
  const rad = (g: number) => (g * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return Math.round(total * 10) / 10;
}

/** Metros en algo legible: 480 m, 1.5 km. */
export function metrosEnTexto(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(metros < 10000 ? 1 : 0)} km`;
}
