import { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { seccionDeRol, useSession } from '@/hooks/useSession';
import { COLORS } from '@/theme/colors';

function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

/** Evita abrir la misma pantalla dos veces con un doble toque. */
function useAbrirUnaVez() {
  const router = useRouter();
  const ultimo = useRef(0);
  return (ruta: string) => {
    const ahora = Date.now();
    if (ahora - ultimo.current < 700) return;
    ultimo.current = ahora;
    router.push(ruta as any);
  };
}

/** La cuenta vive arriba: se consulta poco y así la barra queda para trabajar. */
export function BotonCuenta() {
  const { session } = useSession();
  const abrir = useAbrirUnaVez();
  return (
    <TouchableOpacity
      style={s.avatar}
      onPress={() => abrir(`/${seccionDeRol(session?.role ?? null)}/cuenta`)}
      hitSlop={6}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Mi cuenta"
    >
      <Text style={s.avatarTexto} maxFontSizeMultiplier={1.2}>{iniciales(session?.nombre ?? '')}</Text>
    </TouchableOpacity>
  );
}

export function BotonIcono({
  icono,
  etiqueta,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.icono}
      onPress={onPress}
      hitSlop={6}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
    >
      <Ionicons name={icono} size={22} color={COLORS.onDark} />
    </TouchableOpacity>
  );
}

/** Cabecera de la vendedora: la cobertura y su cuenta. */
export function AccionesVendedora() {
  const abrir = useAbrirUnaVez();
  return (
    <View style={s.fila}>
      <BotonIcono icono="map-outline" etiqueta="Cobertura" onPress={() => abrir('/(vendedor)/mapa')} />
      <BotonCuenta />
    </View>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.surfaceDarkSoft, borderWidth: 2, borderColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { color: COLORS.onDark, fontSize: 14, fontWeight: '800' },
  icono: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.surfaceDarkSoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
