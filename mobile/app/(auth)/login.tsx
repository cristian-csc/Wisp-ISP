import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSession, ROLES_MOBILE_PERMITIDOS } from '@/hooks/useSession';
import { loginAdmin, loginCliente, getMeWithToken } from '@/services/api';
import { COLORS } from '@/theme/colors';
import { alerta } from '@/components/Aviso';
import { useTopeSeguro } from '@/components/Pantalla';

// El icono oficial de la app: la "W" sobre el cuadrado naranja. Es el
// mismo archivo que se usa de icono en el telefono, asi que la app y su
// pantalla de entrada dicen lo mismo.
const ICONO = require('../../assets/icon.png');

export default function LoginScreen() {
  const { signIn } = useSession();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);
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
      {/* Clara: el bloque de arriba es azul marino. */}
      <StatusBar style="light" />

      {/* Bloque de marca. Va fuera del scroll para que no se mueva, pero el
          formulario si sube cuando aparece el teclado. */}
      <View style={[s.marca, { paddingTop: tope + 26 }]}>
        <Image source={ICONO} style={s.icono} resizeMode="contain" />
        <Text style={s.marcaNombre}>WISP</Text>
        <Text style={s.marcaLema}>Internet para todos</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.card}>
          <Text style={s.cardTitulo}>Inicia sesión</Text>

          <Text style={s.inputLabel}>USUARIO</Text>
          <View style={s.inputWrap}>
            <Ionicons name="person-outline" size={19} color={COLORS.mutedForeground} style={s.leadingIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={usuario}
              onChangeText={setUsuario}
              placeholder="DNI o correo electrónico"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={[s.inputLabel, { marginTop: 16 }]}>CONTRASEÑA</Text>
          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={19} color={COLORS.mutedForeground} style={s.leadingIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={clave}
              onChangeText={setClave}
              placeholderTextColor={COLORS.placeholder}
              secureTextEntry={!mostrarClave}
              keyboardType="default"
              autoComplete="off"
              autoCorrect={false}
              maxLength={100}
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setMostrarClave(v => !v)} hitSlop={10}>
              <Ionicons name={mostrarClave ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Naranja de marca con tinta oscura encima: el blanco sobre este
              naranja da 2,45:1 y no se lee. */}
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.brandForeground} />
            ) : (
              <Text style={s.btnText}>Ingresar</Text>
            )}
          </TouchableOpacity>

          <View style={s.statusRow}>
            <View style={s.greenDot} />
            <Text style={s.statusText}>Sistema activo</Text>
          </View>
        </View>

        <Text style={s.bottomText}>¿Problemas para ingresar? Contacta al administrador.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.background },

  // Bloque de marca, azul marino y a sangre.
  marca: {
    backgroundColor: COLORS.surfaceDark,
    alignItems: 'center',
    paddingBottom: 30,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  // El icono oficial ya trae su cuadrado naranja: no hace falta ponerle
  // fondo ni marco, solo dejarle aire.
  icono: { width: 78, height: 78, borderRadius: 18 },
  marcaNombre: {
    color: COLORS.onDark, fontSize: 30, fontWeight: '900',
    letterSpacing: 3, marginTop: 14,
  },
  marcaLema: { color: COLORS.onDarkMuted, fontSize: 13.5, fontWeight: '600', marginTop: 4 },

  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 26 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  cardTitulo: { fontSize: 20, fontWeight: '900', color: COLORS.dark, marginBottom: 18 },

  inputLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.mutedForeground,
    letterSpacing: 1.6, marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, paddingLeft: 14,
  },
  input: { paddingVertical: 14, paddingRight: 12, fontSize: 15, color: COLORS.dark },
  leadingIcon: { marginRight: 10 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'center' },

  btn: {
    backgroundColor: COLORS.brand, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    marginTop: 22,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: COLORS.brandForeground, fontWeight: '900',
    fontSize: 16, letterSpacing: 0.3,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', marginTop: 16 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  statusText: { fontSize: 12, color: COLORS.mutedForeground, fontWeight: '600' },

  bottomText: {
    textAlign: 'center', color: COLORS.placeholder, fontSize: 12,
    marginTop: 20, lineHeight: 17,
  },
});
