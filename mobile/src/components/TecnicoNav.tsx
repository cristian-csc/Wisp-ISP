import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';

type Tab = { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; path: string; id: string };

const TABS: Tab[] = [
  { id: 'ordenes',    label: 'Órdenes',    icon: 'reader-outline',        iconActive: 'reader',        path: '/(tecnico)'               },
  { id: 'averias',    label: 'Averías',    icon: 'build-outline',         iconActive: 'build',         path: '/(tecnico)/averias'       },
  { id: 'retiros',    label: 'Retiros',    icon: 'arrow-undo-outline',    iconActive: 'arrow-undo',    path: '/(tecnico)/retiros'       },
  { id: 'inventario', label: 'Inventario', icon: 'cube-outline',          iconActive: 'cube',          path: '/(tecnico)/inventario'    },
  { id: 'nuevo',      label: 'Registrar',  icon: 'person-add-outline',    iconActive: 'person-add',    path: '/(tecnico)/nuevo-cliente' },
  { id: 'cuenta',     label: 'Cuenta',     icon: 'person-circle-outline', iconActive: 'person-circle', path: '/(tecnico)/cuenta'        },
];

export function TecnicoNav() {
  const router   = useRouter();
  const pathname = usePathname();

  const active =
    pathname.includes('averias')       ? 'averias'
    : pathname.includes('retiros')      ? 'retiros'
    : pathname.includes('inventario')  ? 'inventario'
    : pathname.includes('nuevo-cliente') ? 'nuevo'
    : pathname.includes('cuenta')       ? 'cuenta'
    : 'ordenes';

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
  // marca se apagaba y habia que usar el tono fuerte para que se leyera;
  // sobre oscuro se lee solo y es lo primero que se ve al abrir la app.
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
  iconWrap: {
    width: 46, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: COLORS.brand },
  label: { fontSize: 10.5, fontWeight: '600', color: COLORS.onDarkMuted },
  labelActive: { color: COLORS.brand, fontWeight: '800' },
});
