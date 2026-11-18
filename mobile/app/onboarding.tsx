import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SessionRole, useSession } from '@/hooks/useSession';
import { COLORS } from '@/theme/colors';
import { FUENTES } from '@/theme/fonts';

type Paso = { icono: keyof typeof Ionicons.glyphMap; titulo: string; texto: string };

const PASOS_TECNICO: Paso[] = [
  {
    icono: 'reader',
    titulo: 'Todas tus órdenes en un lugar',
    texto: 'Abre una orden, instala el servicio y escanea el equipo sin salir de la app.',
  },
  {
    icono: 'build',
    titulo: 'Atiende averías y retiros',
    texto: 'Cada caso trae sus datos. Al terminar, deja las fotos de lo que hiciste.',
  },
  {
    icono: 'cube',
    titulo: 'Controla tu inventario',
    texto: 'Mira los equipos que tienes a tu cargo y registra clientes nuevos en campo.',
  },
];

const PASOS_VENDEDOR: Paso[] = [
  {
    icono: 'walk',
    titulo: 'Empieza tu jornada',
    texto: 'Al iniciarla, la app guarda tu ubicación mientras la tengas abierta. Así queda tu recorrido del día.',
  },
  {
    icono: 'person-add',
    titulo: 'Registra clientes donde estés',
    texto: 'Anota sus datos, toma la foto de la fachada y marca la ubicación de su casa.',
  },
  {
    icono: 'map',
    titulo: 'Revisa la cobertura',
    texto: 'Mira en el mapa dónde llega la fibra antes de ofrecer el servicio.',
  },
];

const PASOS_CLIENTE: Paso[] = [
  {
    icono: 'wifi',
    titulo: 'Mira el estado de tu servicio',
    texto: 'Comprueba si está activo y cuántos días faltan para tu próximo pago.',
  },
  {
    icono: 'card',
    titulo: 'Revisa tus pagos',
    texto: 'Encuentra en un solo lugar los pagos que ya hiciste.',
  },
  {
    icono: 'logo-whatsapp',
    titulo: 'Escríbenos si necesitas ayuda',
    texto: 'Desde Inicio puedes contactarnos por WhatsApp cuando tengas un problema.',
  },
];

function pasosDeRol(role: SessionRole | undefined): Paso[] {
  if (role === 'tecnico') return PASOS_TECNICO;
  if (role === 'vendedor_campo') return PASOS_VENDEDOR;
  return PASOS_CLIENTE;
}

/** El hilo de fibra pasa por el centro de cada paso: al deslizar, se sigue el
 * mismo cable de una pantalla a la otra. */
function trazarHilo(ancho: number, alto: number, pasos: number): string {
  const puntos = Array.from({ length: pasos }, (_, i) => ({
    x: ancho * (i + 0.5),
    y: alto * (i % 2 === 0 ? 0.56 : 0.44),
  }));
  const todos = [{ x: -24, y: alto * 0.12 }, ...puntos, { x: ancho * pasos + 24, y: alto * 0.88 }];
  return todos.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const previo = todos[i - 1];
    const medio = (p.x - previo.x) / 2;
    return `${d} C ${previo.x + medio} ${previo.y}, ${p.x - medio} ${p.y}, ${p.x} ${p.y}`;
  }, '');
}

export default function OnboardingScreen() {
  const { session, completarOnboarding } = useSession();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducido = useReducedMotion();
  const lista = useAnimatedRef<Animated.ScrollView>();
  const desplazamiento = useSharedValue(0);
  const [paso, setPaso] = useState(0);

  const pasos = pasosDeRol(session?.role);
  const ultimo = paso === pasos.length - 1;
  const nombre = session?.nombre?.trim().split(/\s+/)[0];
  const altoArte = Math.max(210, height * 0.4);
  const anchoRiel = width - 48;

  const alDeslizar = useAnimatedScrollHandler((e) => {
    desplazamiento.set(e.contentOffset.x);
  });

  useAnimatedReaction(
    () => Math.round(desplazamiento.get() / width),
    (actual, previo) => {
      if (actual !== previo) scheduleOnRN(setPaso, actual);
    },
    [width],
  );

  const avance = useAnimatedStyle(() => ({
    width: Math.max(0, Math.min(1, desplazamiento.get() / (width * (pasos.length - 1)))) * anchoRiel,
  }));

  function siguiente() {
    // El botón cambia a "Empezar" a mitad del deslizamiento. Sin esta espera,
    // un doble toque terminaría la guía sin mostrar el último paso.
    const asentado = Math.abs(desplazamiento.get() - width * paso) < 1;
    if (!asentado) return;
    if (ultimo) {
      void completarOnboarding();
      return;
    }
    lista.current?.scrollTo({ x: width * (paso + 1), animated: !reducido });
  }

  return (
    <View style={[s.pantalla, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />

      <View style={s.barra}>
        <Text style={s.saludo} numberOfLines={1}>{nombre ? `Hola, ${nombre}` : 'Hola'}</Text>
        {!ultimo && (
          <Pressable
            onPress={() => void completarOnboarding()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Saltar la guía"
          >
            <Text style={s.saltar}>Saltar</Text>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={lista}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={alDeslizar}
        scrollEventThrottle={16}
        style={s.lista}
      >
        <View style={{ width: width * pasos.length }}>
          <Svg width={width * pasos.length} height={altoArte} style={StyleSheet.absoluteFill}>
            <Path d={trazarHilo(width, altoArte, pasos.length)} stroke={COLORS.brandSoft} strokeOpacity={0.2} strokeWidth={12} fill="none" />
            <Path d={trazarHilo(width, altoArte, pasos.length)} stroke={COLORS.brand} strokeWidth={3} fill="none" />
          </Svg>

          <View style={s.fila}>
            {pasos.map((p, i) => (
              <View key={p.titulo} style={{ width }}>
                <View style={{ height: altoArte }}>
                  <View style={[s.nodo, { top: altoArte * (i % 2 === 0 ? 0.56 : 0.44) - 62, left: width / 2 - 62 }]}>
                    <Ionicons name={p.icono} size={54} color={COLORS.brandSoft} />
                  </View>
                </View>
                <View style={s.textos}>
                  <Text style={s.titulo} maxFontSizeMultiplier={1.3}>{p.titulo}</Text>
                  <Text style={s.texto} maxFontSizeMultiplier={1.4}>{p.texto}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Animated.ScrollView>

      <View style={s.pie}>
        <View
          style={s.riel}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Paso ${paso + 1} de ${pasos.length}`}
        >
          <View style={s.rielBase} />
          <Animated.View style={[s.rielLuz, avance]} />
          <View style={s.rielNodos}>
            {pasos.map((p, i) => (
              <Animated.View
                key={p.titulo}
                style={[
                  s.rielNodo,
                  {
                    backgroundColor: i <= paso ? COLORS.brand : COLORS.surfaceDarkSoft,
                    transitionProperty: 'backgroundColor',
                    transitionDuration: 180,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <Pressable onPress={siguiente} accessibilityRole="button">
          {({ pressed }) => (
            <Animated.View
              style={[
                s.boton,
                {
                  transform: [{ scale: pressed && !reducido ? 0.97 : 1 }],
                  transitionProperty: 'transform',
                  transitionDuration: 120,
                },
              ]}
            >
              <Text style={s.botonTexto}>{ultimo ? 'Empezar' : 'Siguiente'}</Text>
            </Animated.View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.surfaceDark },

  barra: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, minHeight: 44,
  },
  saludo: { flex: 1, fontFamily: FUENTES.lema, fontSize: 20, color: COLORS.brandSoft },
  saltar: { fontFamily: FUENTES.boton, fontSize: 16, color: COLORS.onDarkMuted },

  lista: { flex: 1 },
  fila: { flexDirection: 'row' },
  nodo: {
    position: 'absolute', width: 124, height: 124, borderRadius: 62,
    backgroundColor: COLORS.surfaceDarkSoft, borderWidth: 3, borderColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  textos: { paddingHorizontal: 24, paddingTop: 8 },
  titulo: { fontFamily: FUENTES.titulo, fontSize: 36, lineHeight: 42, color: COLORS.onDark },
  texto: { fontSize: 17, lineHeight: 25, color: COLORS.onDarkMuted, marginTop: 10, maxWidth: 420 },

  pie: { paddingHorizontal: 24, gap: 22 },
  riel: { height: 14, justifyContent: 'center' },
  rielBase: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: COLORS.surfaceDarkSoft },
  rielLuz: { position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: COLORS.brand },
  rielNodos: { flexDirection: 'row', justifyContent: 'space-between' },
  rielNodo: { width: 14, height: 14, borderRadius: 7 },

  boton: {
    backgroundColor: COLORS.brand, borderRadius: 16, minHeight: 58,
    alignItems: 'center', justifyContent: 'center',
  },
  botonTexto: { fontFamily: FUENTES.boton, fontSize: 20, color: COLORS.brandForeground },
});
