import { Stack } from 'expo-router';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

export default function VendedorLayout() {
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
      <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="cliente/[id]" options={{ title: 'Detalle', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="cuenta" options={{ title: 'Mi Cuenta', headerTintColor: COLORS.primary }} />
    </Stack>
  );
}
