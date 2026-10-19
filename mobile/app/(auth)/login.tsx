import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/hooks/useSession';
import { loginAdmin, loginCliente, getMeWithToken } from '@/services/api';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'flash-outline', label: 'Instalación rápida' },
  { icon: 'shield-checkmark-outline', label: 'Soporte 24/7' },
  { icon: 'wifi-outline', label: 'Red de fibra propia' },
];

export default function LoginScreen() {
  const { signIn } = useSession();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);

  // El DNI del cliente siempre es solo dígitos; cualquier otra cosa (email
  // o, en pruebas, un username corto sin @) se trata como login de staff.
  const esStaff = usuario.trim().length > 0 && !/^\d+$/.test(usuario.trim());

  async function handleLogin() {
    if (!usuario.trim() || !clave.trim()) {
      Alert.alert('Campos requeridos', 'Ingresa tu usuario y contraseña.');
      return;
    }
    setLoading(true);
    try {
      if (esStaff) {
        const res = await loginAdmin(usuario.trim(), clave);
        const me = await getMeWithToken(res.access_token);
        await signIn({ token: res.access_token, role: me.rol, nombre: me.nombre });
      } else {
        const res = await loginCliente(usuario.trim(), clave.trim());
        await signIn({ token: res.access_token, role: 'cliente', nombre: res.nombre, clienteId: res.cliente_id });
      }
    } catch (e: any) {
      Alert.alert('Error al ingresar', e.message ?? 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />

      {/* Formas decorativas sutiles, sin depender de assets nuevos */}
      <View style={[s.deco, s.decoA]} />
      <View style={[s.deco, s.decoB]} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.brand}>
          <Logo height={56} />
          <Text style={s.tagline}>Fibra óptica confiable para tu hogar</Text>
          <Text style={s.taglineSub}>Rápida. Estable. Siempre contigo.</Text>
        </View>

        <View style={s.featuresRow}>
          {FEATURES.map((f) => (
            <View key={f.label} style={s.featurePill}>
              <Ionicons name={f.icon} size={16} color={COLORS.primary} />
              <Text style={s.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <View style={s.cardBody}>
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

            <Text style={[s.inputLabel, { marginTop: 16 }]}>
              {esStaff ? 'CONTRASEÑA' : 'PIN'}
            </Text>
            <View style={s.inputWrap}>
              <Ionicons name="lock-closed-outline" size={19} color={COLORS.mutedForeground} style={s.leadingIcon} />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={clave}
                onChangeText={setClave}
                placeholder="••••••••"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!mostrarClave}
                keyboardType="default"
                autoComplete="off"
                autoCorrect={false}
                maxLength={esStaff ? 100 : 4}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setMostrarClave(v => !v)}>
                <Ionicons name={mostrarClave ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.mutedForeground} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={s.btnText}>INGRESAR</Text>
                  <Ionicons name="arrow-forward" size={17} color={COLORS.white} />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={s.cardFooter}>
            <View style={s.statusRow}>
              <View style={s.greenDot} />
              <Text style={s.statusText}>Sistema activo</Text>
            </View>
          </View>
        </View>

        <Text style={s.bottomText}>¿Problemas para ingresar? Contacta al administrador.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.lightprimary },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },

  deco: { position: 'absolute', borderRadius: 999, backgroundColor: COLORS.primary },
  decoA: { width: 220, height: 220, top: -90, right: -80, opacity: 0.08 },
  decoB: { width: 160, height: 160, bottom: -60, left: -70, opacity: 0.06 },

  brand: { alignItems: 'center', marginBottom: 18 },
  tagline: { color: COLORS.dark, fontSize: 17, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  taglineSub: { color: COLORS.mutedForeground, fontSize: 13, fontWeight: '600', marginTop: 4 },

  featuresRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 22, flexWrap: 'wrap' },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.border,
  },
  featureText: { fontSize: 11, fontWeight: '700', color: COLORS.dark },

  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  cardBody: { padding: 22 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.mutedForeground, letterSpacing: 2, marginBottom: 8 },
  input: {
    paddingVertical: 13, paddingRight: 12,
    fontSize: 15, color: COLORS.dark,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingLeft: 14,
  },
  leadingIcon: { marginRight: 10 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'center', alignItems: 'center' },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginTop: 22,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: COLORS.white, fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 22, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  statusText: { fontSize: 11, color: COLORS.success, fontWeight: '600' },

  bottomText: { textAlign: 'center', fontSize: 12, color: COLORS.mutedForeground, marginTop: 18 },
});
