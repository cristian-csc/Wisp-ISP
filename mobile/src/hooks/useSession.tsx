import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type SessionRole =
  | 'tecnico'
  | 'vendedor_campo'
  | 'cliente'
  | null;

/** Roles que tienen permitido usar la app móvil. Administración y
 * atención al cliente trabajan siempre desde el sistema web en PC —
 * nunca desde el móvil. */
export const ROLES_MOBILE_PERMITIDOS = ['tecnico', 'vendedor_campo'] as const;

/** A qué grupo de rutas pertenece cada rol. */
export function seccionDeRol(role: SessionRole): string {
  switch (role) {
    case 'tecnico':
      return '(tecnico)';
    case 'vendedor_campo':
      return '(vendedor)';
    case 'cliente':
      return '(cliente)';
    default:
      return '(auth)';
  }
}

export type Session = {
  token: string;
  role: SessionRole;
  nombre: string;
  clienteId?: number;
};

const INACTIVITY_MS = 10 * 60 * 1000;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

export function clearInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
}

export function resetInactivity(onLogout: () => void) {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(onLogout, INACTIVITY_MS);
}

const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try { localStorage.setItem(key, value); } catch {}
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async del(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

/** El onboarding se recuerda por rol y por teléfono, y sobrevive al cierre de
 * sesión: quien ya lo vio no vuelve a verlo cada vez que entra. */
const claveOnboarding = (role: SessionRole) => `onboarding_v1_${role}`;

async function faltaOnboarding(role: SessionRole): Promise<boolean> {
  if (!role) return false;
  try {
    return (await storage.get(claveOnboarding(role))) !== '1';
  } catch {
    // Sin acceso al almacenamiento no se bloquea la entrada a la app.
    return false;
  }
}

type SessionCtx = {
  session: Session | null;
  loading: boolean;
  onboardingPendiente: boolean;
  completarOnboarding: () => Promise<void>;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingPendiente, setOnboardingPendiente] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.get('token');
        const role = await storage.get('role');
        const nombre = await storage.get('nombre');
        const clienteId = await storage.get('clienteId');
        if (token && role) {
          setOnboardingPendiente(await faltaOnboarding(role as SessionRole));
          setSession({ token, role: role as SessionRole, nombre: nombre ?? '', clienteId: clienteId ? Number(clienteId) : undefined });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (s: Session) => {
    await storage.set('token', s.token);
    await storage.set('role', s.role ?? '');
    await storage.set('nombre', s.nombre);
    if (s.clienteId) await storage.set('clienteId', String(s.clienteId));
    // Antes de fijar la sesión, para que la app no alcance a pintar el inicio.
    setOnboardingPendiente(await faltaOnboarding(s.role));
    setSession(s);
  }, []);

  const completarOnboarding = useCallback(async () => {
    if (session?.role) {
      try {
        await storage.set(claveOnboarding(session.role), '1');
      } catch {
        // Si no se pudo guardar, se mostrará otra vez la próxima vez que entre.
      }
    }
    setOnboardingPendiente(false);
  }, [session?.role]);

  const signOut = useCallback(async () => {
    clearInactivityTimer();
    await storage.del('token');
    await storage.del('role');
    await storage.del('nombre');
    await storage.del('clienteId');
    setOnboardingPendiente(false);
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, onboardingPendiente, completarOnboarding, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
