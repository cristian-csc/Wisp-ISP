import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession, resetInactivity, clearInactivityTimer, seccionDeRol } from '@/hooks/useSession';

const INACTIVITY_MS = 10 * 60 * 1000;

function AppNavigator() {
  const { session, loading, signOut } = useSession();
  const router = useRouter();
  const segments = useSegments();
  const lastActivityRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    const seccionCorrecta = seccionDeRol(session.role);
    if (segments[0] !== seccionCorrecta) {
      router.replace(`/${seccionCorrecta}` as any);
    }
  }, [session, loading, segments]);

  useEffect(() => {
    if (!session) return;

    const doLogout = () => { clearInactivityTimer(); signOut(); };
    resetInactivity(doLogout);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && appStateRef.current !== 'active') {
        if (Date.now() - lastActivityRef.current > INACTIVITY_MS) {
          doLogout();
        } else {
          resetInactivity(doLogout);
        }
      }
      if (state !== 'active') lastActivityRef.current = Date.now();
      appStateRef.current = state;
    });

    return () => { sub.remove(); clearInactivityTimer(); };
  }, [session]);

  if (loading) return null;
  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <AppNavigator />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
