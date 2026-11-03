import { Stack } from 'expo-router';
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
          title: 'Órdenes',
          headerLeft: () => null,
        }}
      />
      <Stack.Screen name="instalar/[id]" options={{ title: 'Instalar servicio' }} />
      <Stack.Screen name="escanear-equipo" options={{ title: 'Escanear Equipo' }} />
      <Stack.Screen name="mapa" options={{ title: 'Mapa de mi zona' }} />
      <Stack.Screen name="averias/index" options={{ title: 'Averías' }} />
      <Stack.Screen name="averias/nueva" options={{ title: 'Reportar avería' }} />
      <Stack.Screen name="averias/[id]" options={{ title: 'Atender avería' }} />
      <Stack.Screen name="retiros/index" options={{ title: 'Órdenes de retiro' }} />
      <Stack.Screen name="retiros/[id]" options={{ title: 'Retiro de equipo' }} />
      <Stack.Screen name="inventario" options={{ title: 'Mi Inventario', headerLeft: () => null }} />
      <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerLeft: () => null }} />
      <Stack.Screen name="cuenta" options={{ title: 'Mi Cuenta', headerLeft: () => null }} />
      <Stack.Screen name="instalaciones" options={{ title: 'Mis instalaciones' }} />
    </Stack>
  );
}
