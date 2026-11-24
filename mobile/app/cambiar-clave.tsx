/**
 * Cambio de contraseña obligatorio para el cliente.
 *
 * Mientras el cliente no haya puesto una contraseña propia, la suya es su
 * DNI: ocho dígitos que están en su recibo, en su contrato y en cualquier
 * foto de su documento. Quien los tenga entra a su cuenta y ve su dirección,
 * su teléfono y todo su historial de pagos.
 *
 * Esta pantalla se interpone entre el login y la app (ver app/_layout.tsx) y
 * no se puede saltar: no hay botón de «más tarde». Las dos únicas salidas son
 * poner una contraseña o cerrar sesión.
 *
 * Lo que esto NO arregla: si alguien llega antes que el cliente, cambia la
 * contraseña él y se queda con la cuenta. Para eso hace falta que el DNI deje
 * de ser credencial — ver AUDITORIA_SEGURIDAD.md, hallazgo C-2.
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/useSession';
import { cambiarPin } from '@/services/api';
import { alerta } from '@/components/Aviso';
import { COLORS } from '@/theme/colors';

export default function CambiarClaveScreen() {
  const { session, marcarPinCambiado, signOut } = useSession();
  const insets = useSafeAreaInsets();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!actual || !nueva || !confirmar) {
      alerta('Campos requeridos', 'Completa los tres campos.');
      return;
    }
    if (nueva.length < 8) {
      alerta('Contraseña muy corta', 'Tiene que tener al menos 8 caracteres.');
      return;
    }
    if (nueva !== confirmar) {
      alerta('No coincide', 'La contraseña nueva y la confirmación no son iguales.');
      return;
    }
    setGuardando(true);
    try {
      await cambiarPin(actual, nueva);
      // Solo después de que el servidor confirme: si falla, el candado sigue
      // puesto y el cliente se queda aquí.
      await marcarPinCambiado();
    } catch (e: any) {
      alerta('No se pudo cambiar', e.message ?? 'Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  function confirmarSalir() {
    alerta('Cerrar sesión', '¿Seguro que quieres salir sin cambiar tu contraseña?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: signOut },
    ]);
  }

  const campos = [
    { label: 'Contraseña actual (tu DNI)', value: actual, set: setActual },
    { label: 'Contraseña nueva', value: nueva, set: setNueva },
    { label: 'Repite la contraseña nueva', value: confirmar, set: setConfirmar },
  ];

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.escudo}>
          <Ionicons name="lock-closed" size={26} color={COLORS.brandStrong} />
        </View>

        <Text style={s.titulo}>Elige tu contraseña</Text>
        <Text style={s.bajada}>
          Hola{session?.nombre ? `, ${session.nombre.split(' ')[0]}` : ''}. Estás entrando con tu
          DNI, y tu DNI no es un secreto: aparece en tus recibos y en tu contrato. Pon una
          contraseña que solo sepas tú para que nadie más vea tus pagos.
        </Text>

        <View style={s.card}>
          {campos.map(({ label, value, set }) => (
            <View key={label}>
              <Text style={s.inputLabel}>{label.toUpperCase()}</Text>
              <TextInput
                style={s.input}
                value={value}
                onChangeText={set}
                placeholder="••••••••"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />
            </View>
          ))}

          <Text style={s.nota}>
            Al menos 8 caracteres. No puede ser tu DNI, tu RUC ni tu número de teléfono.
          </Text>

          <TouchableOpacity
            style={[s.btn, guardando && s.btnDisabled]}
            onPress={guardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={s.btnText}>GUARDAR Y ENTRAR</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.salirBtn} onPress={confirmarSalir}>
          <Text style={s.salirText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  escudo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titulo: { fontSize: 24, fontWeight: '800', color: COLORS.dark, marginBottom: 8 },
  bajada: { fontSize: 14, color: COLORS.mutedForeground, lineHeight: 20, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
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
  salirBtn: { paddingVertical: 14, alignItems: 'center' },
  salirText: { color: COLORS.placeholder, fontWeight: '600', fontSize: 14 },
});
