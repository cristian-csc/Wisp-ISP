import { Stack } from 'expo-router';
import { COLORS } from '@/theme/colors';
import { JornadaProvider } from '@/hooks/useJornada';

export default function VendedorLayout() {
  return (
    <JornadaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.card },
          headerTintColor: COLORS.dark,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: true,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Mis Clientes',
            headerLeft: () => null,
          }}
        />
        <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerLeft: () => null }} />
        <Stack.Screen name="cliente/[id]" options={{ title: 'Detalle' }} />
        <Stack.Screen name="jornada" options={{ title: 'Jornada', headerLeft: () => null }} />
        <Stack.Screen name="cuenta" options={{ title: 'Mi Cuenta', headerLeft: () => null }} />
      </Stack>
    </JornadaProvider>
  );
}
