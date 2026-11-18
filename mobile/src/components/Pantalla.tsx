import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';

/**
 * Las piezas que repiten todas las pantallas: la cabecera negro, las
 * tarjetas claras y los botones.
 *
 * Antes cada pantalla se pintaba sola y acababan pareciéndose de lejos pero
 * no de cerca: unas con cabecera azul eléctrico, otras con la gris del
 * sistema, tarjetas con cuatro radios distintos. Acá están una vez y se usan
 * en todas, que es lo que hace que la app se vea de una pieza.
 */

/** Alto de la barra de estado de Android, para que nada quede debajo. */
export function useTopeSeguro() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 24);
}

/**
 * Cabecera negro.
 *
 * `compacta` es la de las pantallas de dentro: una línea con el título y el
 * botón de volver. Sin ella queda la grande, la de las pantallas principales,
 * donde cabe un dato en grande y unos accesos.
 */
export function Cabecera({
  titulo,
  subtitulo,
  volver = false,
  derecha,
  compacta = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  volver?: boolean;
  derecha?: ReactNode;
  compacta?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const tope = useTopeSeguro();

  return (
    <View style={[c.caja, { paddingTop: tope + (compacta ? 10 : 16) }]}>
      {/* La hora y la batería en claro: debajo hay negro. */}
      <StatusBar style="light" />

      <View style={c.filaTitulo}>
        {volver && (
          <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={c.volver}>
            <Ionicons name="chevron-back" size={24} color={COLORS.onDark} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[c.titulo, compacta && c.tituloCompacto]} numberOfLines={1}>
            {titulo}
          </Text>
          {!!subtitulo && <Text style={c.subtitulo} numberOfLines={1}>{subtitulo}</Text>}
        </View>
        {derecha}
      </View>

      {children}
    </View>
  );
}

/** Los accesos que van dentro de una cabecera grande. */
export function AccionCabecera({
  icono,
  texto,
  onPress,
  destacada = false,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  texto: string;
  onPress: () => void;
  /** Una por cabecera: si todas destacan, ninguna destaca. */
  destacada?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[c.accion, destacada ? c.accionMarca : c.accionSuave]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons
        name={icono}
        size={17}
        color={destacada ? COLORS.brandForeground : COLORS.onDark}
      />
      <Text style={[c.accionTexto, destacada && c.accionTextoMarca]}>{texto}</Text>
    </TouchableOpacity>
  );
}

/** Título de una lista o un grupo, dentro del cuerpo claro. */
export function Rotulo({ children }: { children: ReactNode }) {
  return <Text style={c.rotulo}>{children}</Text>;
}

const c = StyleSheet.create({
  caja: {
    backgroundColor: COLORS.surfaceDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  volver: { marginLeft: -6, marginRight: 2 },
  titulo: { color: COLORS.onDark, fontSize: 22, fontWeight: '900' },
  tituloCompacto: { fontSize: 19 },
  subtitulo: { color: COLORS.onDarkMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  rotulo: {
    color: COLORS.placeholder, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.4, marginBottom: 10, marginHorizontal: 16, marginTop: 16,
  },
  accion: {
    flex: 1, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 13,
  },
  accionMarca: { backgroundColor: COLORS.brand },
  accionSuave: { backgroundColor: COLORS.surfaceDarkSoft },
  accionTexto: { color: COLORS.onDark, fontWeight: '700', fontSize: 12.5 },
  accionTextoMarca: { color: COLORS.brandForeground, fontWeight: '800' },
});

/** Estilos compartidos del cuerpo claro: tarjetas, botones y campos. */
export const UI = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },

  tarjeta: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginHorizontal: 16,
    marginBottom: 11,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  // Botones altos: se usan de pie, con guantes y a pleno sol.
  botonOscuro: {
    flexDirection: 'row', gap: 7, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.dark,
  },
  botonOscuroTexto: { color: COLORS.white, fontWeight: '800', fontSize: 14.5 },

  botonMarca: {
    flexDirection: 'row', gap: 7, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand,
  },
  botonMarcaTexto: { color: COLORS.brandForeground, fontWeight: '800', fontSize: 14.5 },

  botonSuave: {
    flexDirection: 'row', gap: 7, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
  },
  botonSuaveTexto: { color: COLORS.mutedForeground, fontWeight: '800', fontSize: 14 },

  // Rojo solo para lo que destruye o cierra.
  botonPeligro: {
    flexDirection: 'row', gap: 7, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.error,
  },
  botonPeligroTexto: { color: COLORS.error, fontWeight: '800', fontSize: 14 },

  etiqueta: {
    fontSize: 12.5, fontWeight: '800', color: COLORS.mutedForeground,
    letterSpacing: 0.3, marginBottom: 6,
  },
  campo: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
    backgroundColor: COLORS.card, color: COLORS.dark,
  },
});
