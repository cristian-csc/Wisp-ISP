import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, Image, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSession, ROLES_MOBILE_PERMITIDOS } from '@/hooks/useSession';
import { loginAdmin, loginCliente, getMeWithToken } from '@/services/api';
import { COLORS } from '@/theme/colors';
import { FUENTES } from '@/theme/fonts';
import { alerta } from '@/components/Aviso';
import { useTopeSeguro } from '@/components/Pantalla';

const LOGO = require('../../assets/logo-wisp.png');
const TrazoAnimado = Animated.createAnimatedComponent(Path);
const ALTO_HILO = 76;

/** El borde del bloque de marca es un hilo de fibra que se enciende una sola
 * vez al abrir la pantalla. */
function HiloDeFibra() {
  const { width } = useWindowDimensions();
  const reducido = useReducedMotion();
  const largo = width * 1.25;
  const pendiente = useSharedValue(reducido ? 0 : largo);

  useEffect(() => {
    if (reducido) return;
    pendiente.set(withTiming(0, { duration: 900, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [reducido]);

  const trazo = useAnimatedProps(() => ({ strokeDashoffset: pendiente.get() }));
  const curva = `M 0 16 C ${width * 0.3} 78, ${width * 0.62} -12, ${width} 44`;

  return (
    <Svg width={width} height={ALTO_HILO} style={s.hilo}>
      <Path d={`${curva} L ${width} 0 L 0 0 Z`} fill={COLORS.surfaceDark} />
      <TrazoAnimado
        d={curva}
        stroke={COLORS.brandSoft}
        strokeOpacity={0.3}
        strokeWidth={10}
        strokeDasharray={[largo, largo]}
        fill="none"
        animatedProps={trazo}
      />
      <TrazoAnimado
        d={curva}
        stroke={COLORS.brand}
        strokeWidth={3}
        strokeDasharray={[largo, largo]}
        fill="none"
        animatedProps={trazo}
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const { signIn } = useSession();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);
  const [campoActivo, setCampoActivo] = useState<'usuario' | 'clave' | null>(null);
  const campoClave = useRef<TextInput>(null);
  const reducido = useReducedMotion();
  const tope = useTopeSeguro();

  // El DNI del cliente siempre es solo dígitos; cualquier otra cosa (email
  // o, en pruebas, un username corto sin @) se trata como login de staff.
  const esStaff = usuario.trim().length > 0 && !/^\d+$/.test(usuario.trim());

  async function handleLogin() {
    if (!usuario.trim() || !clave.trim()) {
      alerta('Campos requeridos', 'Ingresa tu usuario y contraseña.');
      return;
    }
    setLoading(true);
    try {
      if (esStaff) {
        const res = await loginAdmin(usuario.trim(), clave);
        const me = await getMeWithToken(res.access_token);
        if (!ROLES_MOBILE_PERMITIDOS.includes(me.rol as any)) {
          alerta(
            'Acceso no disponible aquí',
            'Tu usuario debe ingresar desde el sistema web, no desde la app móvil.',
          );
          return;
        }
        await signIn({ token: res.access_token, role: me.rol as any, nombre: me.nombre });
      } else {
        const res = await loginCliente(usuario.trim(), clave.trim());
        await signIn({ token: res.access_token, role: 'cliente', nombre: res.nombre, clienteId: res.cliente_id });
      }
    } catch (e: any) {
      alerta('Error al ingresar', e.message ?? 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.bg}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[s.marca, { paddingTop: tope + 40 }]}>
          <Image source={LOGO} style={s.logo} resizeMode="contain" accessibilityLabel="WISP" />
          <Text style={s.lema}>Internet para todos</Text>
        </View>
        <HiloDeFibra />

        <View style={s.formulario}>
          <Text style={s.titulo}>Inicia sesión</Text>

          <Text style={s.etiqueta}>Usuario</Text>
          <View style={[s.campo, campoActivo === 'usuario' && s.campoActivo]}>
            <Ionicons name="person-outline" size={20} color={COLORS.mutedForeground} style={s.iconoCampo} />
            <TextInput
              style={s.input}
              value={usuario}
              onChangeText={setUsuario}
              onFocus={() => setCampoActivo('usuario')}
              onBlur={() => setCampoActivo(null)}
              onSubmitEditing={() => campoClave.current?.focus()}
              placeholder="DNI o correo electrónico"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              submitBehavior="submit"
              accessibilityLabel="Usuario"
            />
          </View>

          <Text style={[s.etiqueta, s.etiquetaSegunda]}>Contraseña</Text>
          <View style={[s.campo, campoActivo === 'clave' && s.campoActivo]}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.mutedForeground} style={s.iconoCampo} />
            <TextInput
              ref={campoClave}
              style={s.input}
              value={clave}
              onChangeText={setClave}
              onFocus={() => setCampoActivo('clave')}
              onBlur={() => setCampoActivo(null)}
              onSubmitEditing={handleLogin}
              placeholder="Tu contraseña"
              placeholderTextColor={COLORS.placeholder}
              secureTextEntry={!mostrarClave}
              keyboardType="default"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              returnKeyType="go"
              maxLength={100}
              accessibilityLabel="Contraseña"
            />
            <TouchableOpacity
              style={s.ojo}
              onPress={() => setMostrarClave(v => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Ionicons name={mostrarClave ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Pressable onPress={handleLogin} disabled={loading} accessibilityRole="button" accessibilityLabel="Ingresar">
            {({ pressed }) => (
              <Animated.View
                style={[
                  s.boton,
                  loading && s.botonOcupado,
                  {
                    transform: [{ scale: pressed && !reducido ? 0.97 : 1 }],
                    transitionProperty: 'transform',
                    transitionDuration: 120,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.brandForeground} />
                ) : (
                  <Text style={s.botonTexto}>Ingresar</Text>
                )}
              </Animated.View>
            )}
          </Pressable>

          <Text style={s.ayuda}>¿No puedes entrar? Contacta al administrador.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1 },

  marca: { backgroundColor: COLORS.surfaceDark, paddingHorizontal: 28, paddingBottom: 12 },
  logo: { width: 216, height: 88, marginLeft: -6 },
  lema: { fontFamily: FUENTES.lema, fontSize: 21, color: COLORS.brandSoft, marginTop: 6 },
  hilo: { marginTop: -1 },

  formulario: { flex: 1, paddingHorizontal: 28, paddingTop: 10, paddingBottom: 28 },
  titulo: { fontFamily: FUENTES.titulo, fontSize: 36, lineHeight: 44, color: COLORS.dark, marginBottom: 16 },

  etiqueta: { fontSize: 15, fontWeight: '700', color: COLORS.sidebarText, marginBottom: 7 },
  etiquetaSegunda: { marginTop: 18 },
  campo: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56,
    backgroundColor: COLORS.card, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: 14, paddingLeft: 14,
  },
  campoActivo: { borderColor: COLORS.brand },
  iconoCampo: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, paddingRight: 12, fontSize: 16, color: COLORS.dark },
  ojo: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },

  boton: {
    backgroundColor: COLORS.brand, borderRadius: 16, minHeight: 58,
    alignItems: 'center', justifyContent: 'center', marginTop: 26,
  },
  botonOcupado: { opacity: 0.7 },
  botonTexto: { fontFamily: FUENTES.boton, fontSize: 20, color: COLORS.brandForeground },

  ayuda: { textAlign: 'center', color: COLORS.mutedForeground, fontSize: 14, lineHeight: 20, marginTop: 20 },
});
