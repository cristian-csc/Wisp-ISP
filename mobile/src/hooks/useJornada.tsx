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
const INTERVALO_PING_MS = 2 * 60 * 1000;
// Dos puntos muy seguidos no aportan nada al recorrido y gastan batería
const MINIMO_ENTRE_PINGS_MS = 60 * 1000;

async function obtenerUbicacionActual(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Se necesita permiso de ubicación para iniciar la jornada.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
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

  const detenerPings = useCallback(() => {
    jornadaActivaRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /** Marca un punto del recorrido. Nunca lanza: si falla el GPS o la red, se
   *  intentará en el siguiente ciclo. */
  const marcarPunto = useCallback(async () => {
    if (!jornadaActivaRef.current) return;
    if (Date.now() - ultimoPingRef.current < MINIMO_ENTRE_PINGS_MS) return;
    try {
      const { lat, lng } = await obtenerUbicacionActual();
      await pingJornada(lat, lng);
      ultimoPingRef.current = Date.now();
    } catch {
      // Sin señal GPS o sin red — se reintenta después
    }
  }, []);

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

  // Cada vez que la app vuelve al frente, se marca dónde está
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void marcarPunto();
    });
    return () => sub.remove();
  }, [marcarPunto]);

  const iniciar = useCallback(async (zonaId?: number | null) => {
    const { lat, lng } = await obtenerUbicacionActual();
    const j = await iniciarJornada(lat, lng, zonaId);
    setJornada(j);
    iniciarPings();
  }, [iniciarPings]);

  const finalizar = useCallback(async () => {
    const { lat, lng } = await obtenerUbicacionActual();
    const j = await finalizarJornada(lat, lng);
    detenerPings();
    setJornada(j);
  }, [detenerPings]);

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
