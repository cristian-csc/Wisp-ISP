/**
 * Alta y recuperación de la contraseña del cliente, con un código al WhatsApp.
 *
 * Por qué existe: hasta el 2026-11-23 la contraseña del cliente era su propio
 * DNI mientras no la cambiara. Un DNI está en el recibo, en el contrato y en
 * cualquier foto del documento — no es un secreto, así que no puede ser una
 * credencial. Ahora el documento por sí solo no abre nada: hace falta además
 * tener el teléfono que la empresa ya tiene registrado en la ficha.
 *
 * Dos pasos en una sola pantalla:
 *   1. documento  ->  se manda el código al WhatsApp de la cuenta
 *   2. código + contraseña nueva  ->  queda dentro
 *
 * Sirve igual para estrenar la cuenta y para «olvidé mi contraseña»: son el
 * mismo problema.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/useSession';
import { solicitarCodigoCliente, verificarCodigoCliente } from '@/services/api';
import { alerta } from '@/components/Aviso';
import { COLORS } from '@/theme/colors';

export default function CodigoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  // El login nos pasa el documento ya escrito, para no pedirlo dos veces.
  const params = useLocalSearchParams<{ usuario?: string }>();

  const [paso, setPaso] = useState<'documento' | 'codigo'>('documento');
  const [usuario, setUsuario] = useState(params.usuario ?? '');
  const [telefono, setTelefono] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [claveConfirm, setClaveConfirm] = useState('');
  const [cargando, setCargando] = useState(false);

  async function pedirCodigo() {
    if (!usuario.trim()) {
      alerta('Falta tu documento', 'Escribe tu DNI o RUC.');
      return;
    }
    setCargando(true);
    try {
      const res = await solicitarCodigoCliente(usuario.trim());
      setTelefono(res.telefono);
      if (!res.enviado) {
        // Sin teléfono en la ficha, o el bot caído: el mensaje del servidor
        // explica qué hacer, y no se avanza de paso.
        alerta('No se pudo enviar', res.mensaje);
        return;
      }
      setPaso('codigo');
    } catch (e: any) {
      alerta('No se pudo enviar', e.message ?? 'Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    if (codigo.trim().length !== 6) {
      alerta('Código incompleto', 'Son los 6 dígitos que te llegaron por WhatsApp.');
      return;
    }
    if (clave.length < 8) {
      alerta('Contraseña muy corta', 'Tiene que tener al menos 8 caracteres.');
      return;
    }
    if (clave !== claveConfirm) {
      alerta('No coincide', 'La contraseña y la confirmación no son iguales.');
      return;
    }
    setCargando(true);
    try {
      const res = await verificarCodigoCliente(usuario.trim(), codigo.trim(), clave);
      await signIn({
        token: res.access_token,
        role: 'cliente',
        nombre: res.nombre,
        clienteId: res.cliente_id,
        debeCambiarPin: false,
      });
    } catch (e: any) {
      alerta('No se pudo confirmar', e.message ?? 'Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.bg}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={s.volver} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.onDarkMuted} />
          <Text style={s.volverText}>Volver</Text>
        </TouchableOpacity>

        <View style={s.escudo}>
          <Ionicons
            name={paso === 'documento' ? 'chatbubble-ellipses' : 'key'}
            size={26}
            color={COLORS.brandStrong}
          />
        </View>

        {paso === 'documento' ? (
          <>
            <Text style={s.titulo}>Crear o recuperar tu contraseña</Text>
            <Text style={s.bajada}>
              Escribe tu documento y te mandamos un código al WhatsApp que tienes registrado
              con nosotros. Con ese código eliges tu contraseña.
            </Text>

            <View style={s.card}>
              <Text style={s.inputLabel}>DNI O RUC</Text>
              <TextInput
                style={s.input}
                value={usuario}
                onChangeText={setUsuario}
                placeholder="70111222"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              <TouchableOpacity
                style={[s.btn, cargando && s.btnDisabled]}
                onPress={pedirCodigo}
                disabled={cargando}
              >
                {cargando ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={s.btnText}>ENVIARME EL CÓDIGO</Text>
                )}
              </TouchableOpacity>
              <Text style={s.nota}>
                Si no tienes un WhatsApp registrado, acércate a la oficina y te damos acceso.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={s.titulo}>Escribe el código</Text>
            <Text style={s.bajada}>
              {telefono
                ? `Mandamos 6 dígitos al WhatsApp ${telefono}. `
                : 'Mandamos 6 dígitos a tu WhatsApp. '}
              Vence en 10 minutos.
            </Text>

            <View style={s.card}>
              <Text style={s.inputLabel}>CÓDIGO DE 6 DÍGITOS</Text>
              <TextInput
                style={[s.input, s.inputCodigo]}
                value={codigo}
                onChangeText={(t) => setCodigo(t.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="number-pad"
                maxLength={6}
              />

              <Text style={s.inputLabel}>TU CONTRASEÑA NUEVA</Text>
              <TextInput
                style={s.input}
                value={clave}
                onChangeText={setClave}
                placeholder="••••••••"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />

              <Text style={s.inputLabel}>REPITE LA CONTRASEÑA</Text>
              <TextInput
                style={s.input}
                value={claveConfirm}
                onChangeText={setClaveConfirm}
                placeholder="••••••••"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />

              <Text style={s.nota}>
                Al menos 8 caracteres. No puede ser tu DNI, tu RUC ni tu número de teléfono.
              </Text>

              <TouchableOpacity
                style={[s.btn, cargando && s.btnDisabled]}
                onPress={confirmar}
                disabled={cargando}
              >
                {cargando ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={s.btnText}>GUARDAR Y ENTRAR</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={s.secundario}
              onPress={() => { setCodigo(''); setPaso('documento'); }}
            >
              <Text style={s.secundarioText}>No me llegó, pedir otro código</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.surfaceDark },
  volver: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  volverText: { color: COLORS.onDarkMuted, fontSize: 15, fontWeight: '600' },
  escudo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceDarkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titulo: { fontSize: 24, fontWeight: '800', color: COLORS.onDark, marginBottom: 8 },
  bajada: { fontSize: 14, color: COLORS.onDarkMuted, lineHeight: 20, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.placeholder,
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.dark,
  },
  inputCodigo: { fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  nota: { fontSize: 12, color: COLORS.placeholder, lineHeight: 17, marginTop: 14 },
  btn: {
    backgroundColor: COLORS.dark,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: COLORS.white, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  secundario: { paddingVertical: 14, alignItems: 'center' },
  secundarioText: { color: COLORS.onDarkMuted, fontWeight: '600', fontSize: 14 },
});
