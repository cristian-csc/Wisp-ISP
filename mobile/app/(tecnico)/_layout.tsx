import { Stack } from 'expo-router';
import { COLORS } from '@/theme/colors';
import { BotonCuenta } from '@/components/BotonesCabecera';

export default function TecnicoLayout() {
  return (
    <Stack
      screenOptions={{
        // Negro en todas: antes unas pantallas tenian cabecera clara
        // y otras la oscura propia, y se notaba el salto al navegar.
        headerStyle: { backgroundColor: COLORS.surfaceDark },
        headerTintColor: COLORS.onDark,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: true,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      {/* Sin cabecera nativa: esta pantalla trae la suya, oscura y con el
          numero de ordenes. Dos cabeceras una encima de otra se ven mal y
          roban media pantalla en un telefono. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="instalar/[id]" options={{ title: 'Instalar servicio' }} />
      <Stack.Screen name="escanear-equipo" options={{ title: 'Escanear Equipo' }} />
      <Stack.Screen name="mapa" options={{ title: 'Mapa de mi zona' }} />
      <Stack.Screen name="averias/index" options={{ title: 'Averías' }} />
      <Stack.Screen name="averias/nueva" options={{ title: 'Reportar avería' }} />
      <Stack.Screen name="averias/[id]" options={{ title: 'Atender avería' }} />
      <Stack.Screen name="retiros/index" options={{ title: 'Órdenes de retiro' }} />
      <Stack.Screen name="retiros/[id]" options={{ title: 'Retiro de equipo' }} />
      <Stack.Screen name="inventario" options={{ title: 'Mi Inventario', headerLeft: () => null, headerRight: () => <BotonCuenta /> }} />
      <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerLeft: () => null, headerRight: () => <BotonCuenta /> }} />
      <Stack.Screen name="cuenta" options={{ title: 'Mi cuenta' }} />
      <Stack.Screen name="combustible" options={{ title: 'Cargar combustible' }} />
      {/* La misma pantalla sirve las dos listas; el título lo pone ella según
          el modo, por eso aquí no se fija uno fijo. */}
      <Stack.Screen name="instalaciones" options={{ title: 'Mis instalaciones' }} />
    </Stack>
  );
}
