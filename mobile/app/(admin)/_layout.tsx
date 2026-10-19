import { Stack } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

export default function AdminLayout() {
  const { signOut } = useSession();

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
          headerRight: () => (
            <TouchableOpacity onPress={signOut} style={s.salirBtn}>
              <Text style={s.salirText}>Salir</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="atrasados"
        options={{
          headerTitle: () => <Logo height={24} />,
          headerLeft: () => null,
          headerRight: () => (
            <TouchableOpacity onPress={signOut} style={s.salirBtn}>
              <Text style={s.salirText}>Salir</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="nuevo-cliente" options={{ title: 'Nuevo Cliente', headerTintColor: COLORS.primary }} />
      <Stack.Screen name="cliente/[id]"  options={{ title: 'Detalle',        headerTintColor: COLORS.primary }} />
    </Stack>
  );
}

const s = StyleSheet.create({
  salirBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary },
  salirText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
});
