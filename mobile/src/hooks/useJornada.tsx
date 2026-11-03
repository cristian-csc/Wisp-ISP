import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Jornada, getMiJornadaActiva, iniciarJornada, pingJornada, finalizarJornada, reportarReclamoPasaje } from '@/services/api';

// Ping cada 5 min mientras la jornada está activa — mismo espíritu que mandar
// la ubicación en vivo al grupo de WhatsApp, pero queda guardado para que el
// admin lo revise después. Solo corre mientras la app está abierta en esta
// sección: no pedimos permiso de ubicación "siempre" (más invasivo y pelea
// con las restricciones de Android/iOS para tracking en segundo plano).
const INTERVALO_PING_MS = 5 * 60 * 1000;

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

  const detenerPings = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const iniciarPings = useCallback(() => {
    detenerPings();
    intervalRef.current = setInterval(async () => {
      try {
        const { lat, lng } = await obtenerUbicacionActual();
        await pingJornada(lat, lng);
      } catch {
        // Un ping fallido (sin señal GPS, red caída) no debe tumbar el
        // temporizador — simplemente se reintenta en el siguiente ciclo.
      }
    }, INTERVALO_PING_MS);
  }, [detenerPings]);

  useEffect(() => {
    getMiJornadaActiva()
      .then((j) => {
        setJornada(j);
        if (j) iniciarPings();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return detenerPings;
  }, []);

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
