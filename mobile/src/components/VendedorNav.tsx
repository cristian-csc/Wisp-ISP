import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJornada } from '@/hooks/useJornada';
import { COLORS } from '@/theme/colors';

type Tab = { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; path: string; id: string };

const TABS: Tab[] = [
  { id: 'jornada',  label: 'Jornada',     icon: 'walk-outline',          iconActive: 'walk',          path: '/(vendedor)/jornada'        },
  { id: 'clientes', label: 'Mis Clientes', icon: 'people-outline',       iconActive: 'people',        path: '/(vendedor)'               },
  { id: 'nuevo',    label: 'Registrar',    icon: 'person-add-outline',   iconActive: 'person-add',    path: '/(vendedor)/nuevo-cliente' },
  { id: 'mapa',     label: 'Cobertura',    icon: 'map-outline',          iconActive: 'map',           path: '/(vendedor)/mapa'          },
  { id: 'cuenta',   label: 'Cuenta',       icon: 'person-circle-outline', iconActive: 'person-circle', path: '/(vendedor)/cuenta'        },
];

export function VendedorNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const { jornada } = useJornada();

  const active =
    pathname.includes('jornada')       ? 'jornada'
    : pathname.includes('nuevo-cliente') ? 'nuevo'
    : pathname.includes('mapa')        ? 'mapa'
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
            onPress={() => router.replace(t.path as any)}
            activeOpacity={0.7}
          >
            <View style={[s.iconWrap, isActive && s.iconWrapActive]}>
              <Ionicons name={isActive ? t.iconActive : t.icon} size={20} color={isActive ? COLORS.primary : COLORS.placeholder} />
              {t.id === 'jornada' && jornada?.estado === 'activa' && <View style={s.liveDot} />}
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
  iconWrap: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  liveDot: { position: 'absolute', top: 2, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', borderWidth: 1.5, borderColor: COLORS.card },
  iconWrapActive: { backgroundColor: COLORS.lightprimary },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.placeholder },
  labelActive: { color: COLORS.primary, fontWeight: '700' },
});
