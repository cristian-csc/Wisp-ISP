import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { COLORS } from '@/theme/colors';

export type PestanaBarra = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  path: string;
  /** Punto verde sobre el icono: algo está en curso en esa sección. */
  enCurso?: boolean;
};

const DIAMETRO_CENTRAL = 66;
const DIAMETRO_JOROBA = 80;
/** Cuánto sube el botón central dentro de su espacio en la barra. */
const SUBIDA_CENTRAL = 36;

/**
 * Lo que las listas deben dejar libre al final: el botón central sobresale de
 * la barra y taparía la última tarjeta.
 */
export const ESPACIO_BARRA = 48;

function Pestana({ tab, activa, onPress }: { tab: PestanaBarra; activa: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={s.pestana}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: activa }}
    >
      <View>
        <Ionicons name={activa ? tab.iconActive : tab.icon} size={24} color={activa ? COLORS.brand : COLORS.onDarkMuted} />
        {tab.enCurso && <View style={s.puntoEnCurso} />}
      </View>
      <Text style={[s.etiqueta, activa && s.etiquetaActiva]} numberOfLines={1}>{tab.label}</Text>
    </TouchableOpacity>
  );
}

/**
 * La barra de abajo. El centro es el trabajo principal de cada rol: siempre en
 * naranja y siempre al alcance del pulgar, esté donde esté la persona.
 */
export function BarraInferior({
  izquierda,
  central,
  derecha,
  activa,
}: {
  izquierda: PestanaBarra[];
  central: PestanaBarra;
  derecha: PestanaBarra[];
  activa: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducido = useReducedMotion();
  const centralActiva = activa === central.id;

  const ir = (tab: PestanaBarra) => {
    if (tab.id !== activa) router.replace(tab.path as any);
  };

  return (
    <View style={[s.barra, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {izquierda.map(t => <Pestana key={t.id} tab={t} activa={activa === t.id} onPress={() => ir(t)} />)}

      <Pressable
        style={s.central}
        onPress={() => ir(central)}
        hitSlop={{ top: SUBIDA_CENTRAL }}
        accessibilityRole="tab"
        accessibilityLabel={central.label}
        accessibilityState={{ selected: centralActiva }}
      >
        {({ pressed }) => (
          <>
            <View style={s.joroba} />
            <Animated.View
              style={[
                s.botonCentral,
                centralActiva && s.botonCentralActivo,
                {
                  transform: [{ scale: pressed && !reducido ? 0.95 : 1 }],
                  transitionProperty: 'transform',
                  transitionDuration: 120,
                },
              ]}
            >
              <Ionicons name={central.iconActive} size={32} color={COLORS.brandForeground} />
            </Animated.View>
            <Text style={[s.etiquetaCentral, centralActiva && s.etiquetaActiva]} numberOfLines={1}>
              {central.label}
            </Text>
          </>
        )}
      </Pressable>

      {derecha.map(t => <Pestana key={t.id} tab={t} activa={activa === t.id} onPress={() => ir(t)} />)}
    </View>
  );
}

const s = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surfaceDark,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },

  // Altas a propósito: se tocan de pie, con guantes y a pleno sol.
  pestana: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  etiqueta: { fontSize: 11.5, fontWeight: '600', color: COLORS.onDarkMuted },
  etiquetaActiva: { color: COLORS.brand, fontWeight: '800' },
  puntoEnCurso: {
    position: 'absolute', top: -1, right: -4, width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.success, borderWidth: 2, borderColor: COLORS.surfaceDark,
  },

  central: { width: 96, minHeight: 52, alignItems: 'center', justifyContent: 'flex-end' },
  // Continúa el fondo de la barra alrededor del botón, para que suba de una
  // sola pieza con ella.
  joroba: {
    position: 'absolute',
    top: -SUBIDA_CENTRAL - (DIAMETRO_JOROBA - DIAMETRO_CENTRAL) / 2,
    width: DIAMETRO_JOROBA, height: DIAMETRO_JOROBA, borderRadius: DIAMETRO_JOROBA / 2,
    backgroundColor: COLORS.surfaceDark,
  },
  botonCentral: {
    position: 'absolute', top: -SUBIDA_CENTRAL,
    width: DIAMETRO_CENTRAL, height: DIAMETRO_CENTRAL, borderRadius: DIAMETRO_CENTRAL / 2,
    backgroundColor: COLORS.brand, borderWidth: 3, borderColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  botonCentralActivo: { borderColor: COLORS.brandSoft },
  etiquetaCentral: { fontSize: 12.5, fontWeight: '800', color: COLORS.onDark },
});
