import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Baloo2_500Medium, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { SessionProvider, useSession, resetInactivity, clearInactivityTimer, seccionDeRol } from '@/hooks/useSession';
import { AvisoHost } from '@/components/Aviso';

const INACTIVITY_MS = 10 * 60 * 1000;

function AppNavigator() {
  const { session, loading, onboardingPendiente, signOut } = useSession();
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

    if (onboardingPendiente) {
      if (segments[0] !== 'onboarding') router.replace('/onboarding' as any);
      return;
    }

    // Cliente que sigue entrando con su DNI como contraseña: no pasa de aquí.
    // El `return` es lo que cierra el candado — sin él, el efecto seguiría
    // hasta la redirección de abajo y lo dejaría en su sección.
    if (session.debeCambiarPin) {
      if (segments[0] !== 'cambiar-clave') router.replace('/cambiar-clave' as any);
      return;
    }

    const seccionCorrecta = seccionDeRol(session.role);
    if (segments[0] !== seccionCorrecta) {
      router.replace(`/${seccionCorrecta}` as any);
    }
  }, [session, loading, onboardingPendiente, segments]);

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
  // Si la letra no carga, la app sigue con la del sistema en vez de quedarse
  // en blanco.
  const [fuentesListas, errorFuentes] = useFonts({ Baloo2_500Medium, Baloo2_700Bold, Baloo2_800ExtraBold });
  if (!fuentesListas && !errorFuentes) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Clara: encima hay negro en todas las pantallas con sesion.
          El login pinta su propio bloque oscuro arriba, asi que tambien. */}
      <StatusBar style="light" />
      <SafeAreaProvider>
        <SessionProvider>
          <AppNavigator />
          {/* Los avisos de la app. Va por encima de todo y una sola vez: las
              pantallas los piden con alerta(), sin montar nada. */}
          <AvisoHost />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
