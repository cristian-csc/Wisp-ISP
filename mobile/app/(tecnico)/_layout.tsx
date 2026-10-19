import { Stack } from 'expo-router';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

export default function TecnicoLayout() {
  return (
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
          headerTitle: () => <Logo height={24} />,
          headerLeft: () => null,
        }}
      />
      <Stack.Screen name="instalar/[id]" options={{ title: 'Instalar servicio', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="escanear-equipo" options={{ title: 'Escanear Equipo', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="mapa" options={{ title: 'Mapa de mi zona', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="averias/index" options={{ title: 'Averías', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="averias/nueva" options={{ title: 'Reportar avería', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="averias/[id]" options={{ title: 'Atender avería', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="retiros/index" options={{ title: 'Órdenes de retiro', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="retiros/[id]" options={{ title: 'Retiro de equipo', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="inventario" options={{ title: 'Mi Inventario', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="cuenta" options={{ title: 'Mi Cuenta', headerTintColor: COLORS.primary }} />
    </Stack>
  );
}
