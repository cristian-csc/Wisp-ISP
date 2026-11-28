/**
 * Procesamiento del recorrido de una jornada ANTES de dibujarlo en el mapa.
 *
 * El backend guarda puntos GPS sueltos (lat, lng, hora). Unirlos todos en una
 * sola línea continua —como hacía Leaflet— dibuja rectas que atraviesan
 * manzanas cuando faltan datos, hay un salto imposible o pasó mucho rato entre
 * un punto y otro. Esas rectas mienten: dan a entender que la vendedora caminó
 * por donde nunca pasó.
 *
 * Aquí se ordenan, se limpian y se parten en SEGMENTOS continuos. Donde no hay
 * evidencia, se deja un hueco ("tramo sin datos") en vez de inventar una línea.
 * Es lógica pura, sin dependencias ni acceso a red: se puede probar sola.
 */

export type TipoPunto = 'inicio' | 'punto' | 'fin';

/** Un punto ya ubicado en el tiempo, listo para procesar. */
export type PuntoRecorrido = {
  lat: number;
  lng: number;
  /** Momento de captura en milisegundos (epoch). */
  t: number;
  tipo: TipoPunto;
  /** Índice del punto en la lista original, para claves estables de React. */
  i: number;
  /** Precisión del GPS en metros, si el aparato la reportó. */
  precision?: number | null;
};

/**
 * Umbrales de validación. Pensados para trabajo de campo a pie o en mototaxi.
 * El móvil hoy manda un punto cada ~2 min, así que un hueco mayor a 6 min son
 * al menos dos envíos perdidos: ahí no sabemos por dónde anduvo.
 */
export const UMBRAL = {
  /** Más de esto entre dos puntos = tramo sin datos (no se une con línea). */
  gapMs: 6 * 60 * 1000,
  /** Velocidad por encima de la cual el salto es físicamente improbable (m/s). 120 km/h. */
  velocidadMaxMS: (120 * 1000) / 3600,
  /** Dos puntos más juntos que esto, y casi a la misma hora, son el mismo: se funden. */
  dedupeDistM: 5,
  dedupeMs: 90 * 1000,
  /** Salto grande sin diferencia de tiempo (mismo timestamp) = dato corrupto. */
  saltoSinTiempoM: 50,
  /** Peor precisión aceptada (m). Un punto con precisión conocida peor que esto
   *  no entra al recorrido válido: el GPS no sabe bien dónde está. */
  precisionMaxM: 35,
} as const;

export type RazonCorte = 'tiempo' | 'salto';

/** Un hueco entre dos segmentos: dónde empieza, dónde sigue y por qué se cortó. */
export type Hueco = {
  desde: PuntoRecorrido;
  hasta: PuntoRecorrido;
  razon: RazonCorte;
  minutos: number;
  metros: number;
};

export type Segmento = PuntoRecorrido[];

export type RecorridoProcesado = {
  /** Tramos continuos con 2+ puntos, cada uno una polilínea dibujable. */
  segmentos: Segmento[];
  /** Todos los puntos que sobrevivieron la limpieza (para marcadores). */
  puntos: PuntoRecorrido[];
  /** Puntos aislados por un salto imposible a ambos lados: no son recorrido. */
  descartados: PuntoRecorrido[];
  /** Puntos fuera del recorrido por precisión GPS pobre (se guardan para diagnóstico). */
  imprecisos: PuntoRecorrido[];
  /** Cortes por falta de datos (tiempo). Se muestran como "tramo sin datos". */
  huecos: Hueco[];
  /** Metros sumados SOLO dentro de segmentos (nunca cruzando un corte). */
  metros: number;
  /** Cuántos tramos sin datos quedaron en medio del recorrido. */
  tramosSinDatos: number;
};

/** Distancia en metros entre dos coordenadas (fórmula del semiverseno). */
export function metrosEntre(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** La velocidad implícita entre dos puntos (m/s). Sin tiempo → Infinity. */
function velocidadMS(a: PuntoRecorrido, b: PuntoRecorrido): number {
  const dt = (b.t - a.t) / 1000;
  const d = metrosEntre(a, b);
  if (dt <= 0) return d > UMBRAL.saltoSinTiempoM ? Infinity : 0;
  return d / dt;
}

/** ¿El tramo entre dos puntos es un corte? Y de qué tipo. */
function clasificarCorte(a: PuntoRecorrido, b: PuntoRecorrido): RazonCorte | null {
  const dtMs = b.t - a.t;
  if (dtMs > UMBRAL.gapMs) return 'tiempo';
  if (velocidadMS(a, b) > UMBRAL.velocidadMaxMS) return 'salto';
  if (dtMs <= 0 && metrosEntre(a, b) > UMBRAL.saltoSinTiempoM) return 'salto';
  return null;
}

/**
 * Convierte la lista cruda de puntos en segmentos limpios.
 *
 * Nunca inventa coordenadas: si falta un tramo, queda como hueco. El inicio y
 * el fin de la jornada son anclas y no se descartan ni se funden aunque caigan
 * cerca de otro punto.
 */
export function procesarRecorrido(entrada: PuntoRecorrido[]): RecorridoProcesado {
  const vacio: RecorridoProcesado = {
    segmentos: [],
    puntos: [],
    descartados: [],
    imprecisos: [],
    huecos: [],
    metros: 0,
    tramosSinDatos: 0,
  };
  if (entrada.length === 0) return vacio;

  // 1. Orden cronológico (defensivo: el backend ya ordena, pero un punto
  //    sincronizado tarde tras perder señal podría llegar fuera de orden).
  const ordenados = [...entrada].sort((a, b) => a.t - b.t || a.i - b.i);

  // 1.5. Apartar puntos con precisión conocida y pobre: el GPS no sabe bien
  //      dónde estaba, así que no deben formar el trazo (sí se guardan para
  //      diagnóstico). Las anclas inicio/fin nunca se apartan.
  const imprecisos: PuntoRecorrido[] = [];
  const precisos: PuntoRecorrido[] = [];
  for (const p of ordenados) {
    if (p.tipo === 'punto' && p.precision != null && p.precision > UMBRAL.precisionMaxM) {
      imprecisos.push(p);
    } else {
      precisos.push(p);
    }
  }

  // 2. Fundir duplicados consecutivos (mismo lugar, casi la misma hora). Las
  //    anclas inicio/fin no se fusionan: marcan los extremos reales.
  const sinDuplicados: PuntoRecorrido[] = [];
  for (const p of precisos) {
    const ult = sinDuplicados[sinDuplicados.length - 1];
    const esAncla = p.tipo !== 'punto';
    const ultEsAncla = ult && ult.tipo !== 'punto';
    if (
      ult &&
      !esAncla &&
      !ultEsAncla &&
      metrosEntre(ult, p) < UMBRAL.dedupeDistM &&
      p.t - ult.t < UMBRAL.dedupeMs
    ) {
      continue; // es el mismo punto repetido
    }
    sinDuplicados.push(p);
  }

  // 3. Descartar outliers: un punto intermedio al que no se puede llegar ni
  //    salir sin teletransportarse (salto imposible a ambos lados) es ruido
  //    de GPS, no parte del recorrido. Se guarda aparte para diagnóstico.
  const descartados: PuntoRecorrido[] = [];
  const limpios: PuntoRecorrido[] = [];
  for (let k = 0; k < sinDuplicados.length; k++) {
    const p = sinDuplicados[k];
    const prev = sinDuplicados[k - 1];
    const next = sinDuplicados[k + 1];
    if (
      p.tipo === 'punto' &&
      prev &&
      next &&
      velocidadMS(prev, p) > UMBRAL.velocidadMaxMS &&
      velocidadMS(p, next) > UMBRAL.velocidadMaxMS
    ) {
      descartados.push(p);
      continue;
    }
    limpios.push(p);
  }

  // 4. Partir en segmentos y registrar los huecos por tiempo.
  const segmentos: Segmento[] = [];
  const huecos: Hueco[] = [];
  let metros = 0;
  let actual: Segmento = [];

  for (let k = 0; k < limpios.length; k++) {
    const p = limpios[k];
    if (k === 0) {
      actual = [p];
      continue;
    }
    const anterior = limpios[k - 1];
    const corte = clasificarCorte(anterior, p);
    if (corte) {
      if (actual.length) segmentos.push(actual);
      if (corte === 'tiempo') {
        huecos.push({
          desde: anterior,
          hasta: p,
          razon: 'tiempo',
          minutos: Math.round((p.t - anterior.t) / 60000),
          metros: metrosEntre(anterior, p),
        });
      }
      actual = [p];
    } else {
      metros += metrosEntre(anterior, p);
      actual.push(p);
    }
  }
  if (actual.length) segmentos.push(actual);

  return {
    segmentos: segmentos.filter((s) => s.length >= 2),
    puntos: limpios,
    descartados,
    imprecisos,
    huecos,
    metros,
    tramosSinDatos: huecos.length,
  };
}

/** "1.2 km" o "640 m". */
export function formatearDistancia(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${Math.round(metros)} m`;
}
