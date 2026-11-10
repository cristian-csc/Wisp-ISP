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

type SessionCtx = {
  session: Session | null;
  loading: boolean;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.get('token');
        const role = await storage.get('role');
        const nombre = await storage.get('nombre');
        const clienteId = await storage.get('clienteId');
        if (token && role) {
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
    setSession(s);
  }, []);

  const signOut = useCallback(async () => {
    clearInactivityTimer();
    await storage.del('token');
    await storage.del('role');
    await storage.del('nombre');
    await storage.del('clienteId');
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
