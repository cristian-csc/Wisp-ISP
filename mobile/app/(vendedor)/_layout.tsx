import { Stack } from 'expo-router';
import { COLORS } from '@/theme/colors';
import { JornadaProvider } from '@/hooks/useJornada';
import { AccionesVendedora } from '@/components/BotonesCabecera';

export default function VendedorLayout() {
  return (
    <JornadaProvider>
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
        <Stack.Screen
          name="index"
          options={{
            title: 'Mis Clientes',
            headerLeft: () => null,
            headerRight: () => <AccionesVendedora />,
          }}
        />
        <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerLeft: () => null, headerRight: () => <AccionesVendedora /> }} />
        <Stack.Screen name="cliente/[id]" options={{ title: 'Detalle' }} />
        <Stack.Screen name="jornada" options={{ title: 'Jornada', headerLeft: () => null, headerRight: () => <AccionesVendedora /> }} />
        <Stack.Screen name="mapa" options={{ title: 'Cobertura de fibra' }} />
        <Stack.Screen name="cuenta" options={{ title: 'Mi cuenta' }} />
      </Stack>
    </JornadaProvider>
  );
}
