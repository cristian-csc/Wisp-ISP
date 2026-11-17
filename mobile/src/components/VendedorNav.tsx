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
              <Ionicons
                name={isActive ? t.iconActive : t.icon}
                size={20}
                color={isActive ? COLORS.brandForeground : COLORS.onDarkMuted}
              />
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
  // Oscura, como la barra lateral del panel. Sobre blanco el naranja de la
  // marca se apagaba; sobre oscuro se lee solo.
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceDark,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderDark,
    paddingBottom: Platform.OS === 'ios' ? 26 : 10,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  // El borde del punto toma el color de la barra, que ahora es oscura: con
  // el blanco de antes quedaba un aro claro flotando.
  liveDot: { position: 'absolute', top: 2, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, borderWidth: 1.5, borderColor: COLORS.surfaceDark },
  iconWrapActive: { backgroundColor: COLORS.brand },
  label: { fontSize: 10.5, fontWeight: '600', color: COLORS.onDarkMuted },
  labelActive: { color: COLORS.brand, fontWeight: '800' },
});
