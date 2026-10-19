import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

export default function ClienteLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.card },
        headerTintColor: COLORS.dark,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: true,
        tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.border, borderTopWidth: 1 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.placeholder,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: () => <Logo height={22} />,
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="pagos"
        options={{
          title: 'Mis Pagos',
          tabBarLabel: 'Pagos',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💳</Text>,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
