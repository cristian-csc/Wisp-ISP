import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { Jornada, getMiJornadaActiva, iniciarJornada, pingJornada, finalizarJornada, reportarReclamoPasaje } from '@/services/api';

// El recorrido se arma con estos puntos. Solo se registran mientras la app está
// abierta: no pedimos permiso de ubicación "siempre" (más invasivo y pelea con
// las restricciones de Android/iOS para el seguimiento en segundo plano).
//
// Por eso, además del temporizador, se marca un punto cada vez que la vendedora
// vuelve a la app: en la práctica eso es lo que más llena el recorrido, porque
// camina con el teléfono guardado y lo saca para registrar a cada cliente.
const INTERVALO_PING_MS = 60 * 1000;
// Dos puntos muy seguidos no aportan nada al recorrido y gastan batería
const MINIMO_ENTRE_PINGS_MS = 40 * 1000;
// Tope del buffer en memoria de puntos sin enviar (sin señal). Suficiente para
// horas de jornada; si se pasa, se descartan los más viejos.
const MAX_BUFFER = 600;

type PuntoPendiente = { lat: number; lng: number; precision_m: number | null; capturado_en: string };

/** Toma un punto del GPS con su precisión y su hora real de captura. */
async function capturarFix(): Promise<PuntoPendiente> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Se necesita permiso de ubicación para iniciar la jornada.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    precision_m: pos.coords.accuracy ?? null,
    capturado_en: new Date(pos.timestamp).toISOString(),
  };
}

// Ubicación para CERRAR la jornada: nunca bloquea. Exigir un GPS nuevo de alta
// precisión dejaba el botón «Finalizar» cargando para siempre bajo techo. Aquí
// se intenta el último punto conocido (instantáneo) y, si no hay, un intento
// rápido con tope de 5 s; si nada responde, se cierra igual sin coordenadas.
async function ubicacionParaCierre(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const conocida = await Location.getLastKnownPositionAsync();
    if (conocida) return { lat: conocida.coords.latitude, lng: conocida.coords.longitude };
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

type JornadaCtx = {
  jornada: Jornada | null;
  loading: boolean;
  iniciar: (zonaId?: number | null) => Promise<void>;
  finalizar: () => Promise<void>;
  reportarReclamo: (monto: number, nota?: string) => Promise<void>;
};

const Ctx = createContext<JornadaCtx | null>(null);

export function JornadaProvider({ children }: { children: ReactNode }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoPingRef = useRef(0);
  const jornadaActivaRef = useRef(false);
  // Puntos capturados sin red, a la espera de que vuelva la señal. Viven solo en
  // memoria: como el rastreo ya es solo con la app abierta, si la app se cierra
  // el rastreo se detiene de todos modos, así que persistirlos no añade nada.
  const bufferRef = useRef<PuntoPendiente[]>([]);

  const detenerPings = useCallback(() => {
    jornadaActivaRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /** Intenta enviar un punto. Devuelve si lo logró. Nunca lanza. */
  const enviarPunto = useCallback(async (p: PuntoPendiente): Promise<boolean> => {
    try {
      await pingJornada(p);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Reintenta los puntos que quedaron sin enviar por falta de red. El servidor
   *  deduplica por `capturado_en`, así que un reenvío no crea duplicados. */
  const vaciarBuffer = useCallback(async () => {
    if (!bufferRef.current.length) return;
    const pendientes = [...bufferRef.current];
    const quedan: PuntoPendiente[] = [];
    for (const p of pendientes) {
      const ok = await enviarPunto(p);
      if (!ok) quedan.push(p);
    }
    bufferRef.current = quedan;
  }, [enviarPunto]);

  /** Marca un punto del recorrido. Nunca lanza: si falla el GPS se intentará en
   *  el siguiente ciclo; si falla la red, el punto se guarda en memoria con su
   *  hora real y se reenvía cuando vuelva la señal. */
  const marcarPunto = useCallback(async () => {
    if (!jornadaActivaRef.current) return;
    if (Date.now() - ultimoPingRef.current < MINIMO_ENTRE_PINGS_MS) return;
    let fix: PuntoPendiente;
    try {
      fix = await capturarFix();
    } catch {
      return; // sin GPS — se reintenta después
    }
    ultimoPingRef.current = Date.now();
    const ok = await enviarPunto(fix);
    if (ok) {
      await vaciarBuffer();
    } else if (!bufferRef.current.some((q) => q.capturado_en === fix.capturado_en)) {
      bufferRef.current.push(fix);
      if (bufferRef.current.length > MAX_BUFFER) bufferRef.current.shift();
    }
  }, [enviarPunto, vaciarBuffer]);

  const iniciarPings = useCallback(() => {
    detenerPings();
    jornadaActivaRef.current = true;
    intervalRef.current = setInterval(() => void marcarPunto(), INTERVALO_PING_MS);
  }, [detenerPings, marcarPunto]);

  useEffect(() => {
    getMiJornadaActiva()
      .then((j) => {
        setJornada(j);
        if (j) {
          iniciarPings();
          void marcarPunto();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return detenerPings;
  }, []);

  // Cada vez que la app vuelve al frente, se marca dónde está y se reintenta lo
  // que hubiera quedado sin enviar por falta de señal.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        void vaciarBuffer();
        void marcarPunto();
      }
    });
    return () => sub.remove();
  }, [marcarPunto, vaciarBuffer]);

  const iniciar = useCallback(async (zonaId?: number | null) => {
    const fix = await capturarFix();
    const j = await iniciarJornada(fix.lat, fix.lng, zonaId);
    setJornada(j);
    iniciarPings();
  }, [iniciarPings]);

  const finalizar = useCallback(async () => {
    // Último intento de enviar lo que quedó en el buffer antes de cerrar.
    await vaciarBuffer();
    bufferRef.current = [];
    const u = await ubicacionParaCierre();
    const j = await finalizarJornada(u?.lat ?? null, u?.lng ?? null);
    detenerPings();
    setJornada(j);
  }, [detenerPings, vaciarBuffer]);

  const reportarReclamo = useCallback(async (monto: number, nota?: string) => {
    if (!jornada) return;
    const j = await reportarReclamoPasaje(jornada.id, monto, nota);
    setJornada(j);
  }, [jornada]);

  return (
    <Ctx.Provider value={{ jornada, loading, iniciar, finalizar, reportarReclamo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useJornada(): JornadaCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useJornada debe usarse dentro de JornadaProvider');
  return ctx;
}
