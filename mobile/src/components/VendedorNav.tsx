import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';

type Tab = { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; path: string; id: string };

const TABS: Tab[] = [
  { id: 'clientes', label: 'Mis Clientes', icon: 'people-outline',       iconActive: 'people',        path: '/(vendedor)'               },
  { id: 'nuevo',    label: 'Registrar',    icon: 'person-add-outline',   iconActive: 'person-add',    path: '/(vendedor)/nuevo-cliente' },
  { id: 'cuenta',   label: 'Cuenta',       icon: 'person-circle-outline', iconActive: 'person-circle', path: '/(vendedor)/cuenta'        },
];

export function VendedorNav() {
  const router   = useRouter();
  const pathname = usePathname();

  const active =
    pathname.includes('nuevo-cliente') ? 'nuevo'
    : pathname.includes('cuenta')      ? 'cuenta'
    : 'clientes';

  return (
    <View style={s.container}>
      {TABS.map(t => {
        const isActive = active === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={s.tab}
            onPress={() => {
              if (t.id === 'clientes') router.replace(t.path as any);
              else router.push(t.path as any);
            }}
            activeOpacity={0.7}
          >
            <View style={[s.iconWrap, isActive && s.iconWrapActive]}>
              <Ionicons name={isActive ? t.iconActive : t.icon} size={20} color={isActive ? COLORS.primary : COLORS.placeholder} />
            </View>
            <Text style={[s.label, isActive && s.labelActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: COLORS.lightprimary },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.placeholder },
  labelActive: { color: COLORS.primary, fontWeight: '700' },
});
