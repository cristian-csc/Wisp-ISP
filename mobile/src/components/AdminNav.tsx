import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { COLORS } from '@/theme/colors';

type Tab = { label: string; icon: string; path: string; id: string };

const TABS: Tab[] = [
  { id: 'clientes', label: 'Clientes',  icon: '👥', path: '/(admin)'              },
  { id: 'atrasados', label: 'Atrasados', icon: '⚠️',  path: '/(admin)/atrasados'   },
  { id: 'nuevo',    label: 'Agregar',   icon: '➕', path: '/(admin)/nuevo-cliente' },
];

export function AdminNav() {
  const router   = useRouter();
  const pathname = usePathname();

  const active =
    pathname === '/'          ? 'clientes'
    : pathname.includes('atrasados')    ? 'atrasados'
    : pathname.includes('nuevo-cliente')? 'nuevo'
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
              if (t.id === 'nuevo') router.push(t.path as any);
              else router.replace(t.path as any);
            }}
            activeOpacity={0.7}
          >
            <View style={[s.iconWrap, isActive && s.iconWrapActive]}>
              <Text style={s.icon}>{t.icon}</Text>
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
  icon: { fontSize: 18 },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.placeholder },
  labelActive: { color: COLORS.primary, fontWeight: '700' },
});
