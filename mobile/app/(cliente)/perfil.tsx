import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { cambiarPin } from '@/services/api';
import { COLORS } from '@/theme/colors';
import { alerta } from '@/components/Aviso';

export default function PerfilScreen() {
  const { session, signOut } = useSession();
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCambiarPin() {
    if (!pinActual || !pinNuevo || !pinConfirm) { alerta('Campos requeridos', 'Completa todos los campos.'); return; }
    if (pinNuevo.length < 8) { alerta('Contraseña inválida', 'La contraseña nueva debe tener al menos 8 caracteres.'); return; }
    if (pinNuevo !== pinConfirm) { alerta('No coincide', 'La contraseña nueva y la confirmación no son iguales.'); return; }
    setSaving(true);
    try {
      await cambiarPin(pinActual, pinNuevo);
      setPinActual(''); setPinNuevo(''); setPinConfirm('');
      alerta('Contraseña actualizada', 'Tu contraseña fue cambiada correctamente.');
    } catch (e: any) {
      alerta('Error', e.message ?? 'No se pudo cambiar la contraseña');
    } finally { setSaving(false); }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      <View style={s.card}>
        <Text style={s.cardTitle}>MI PERFIL</Text>
        <View style={s.fila}>
          <Text style={s.filaLabel}>Nombre</Text>
          <Text style={s.filaValue}>{session?.nombre ?? '—'}</Text>
        </View>
        <View style={[s.fila, { borderBottomWidth: 0 }]}>
          <Text style={s.filaLabel}>Rol</Text>
          <View style={s.rolBadge}><Text style={s.rolText}>Cliente</Text></View>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>CAMBIAR CONTRASEÑA</Text>
        <Text style={s.hint}>Tu contraseña por defecto es tu mismo DNI. Puedes cambiarla por otra de al menos 8 caracteres.</Text>

        {[
          { label: 'Contraseña actual', value: pinActual, set: setPinActual },
          { label: 'Contraseña nueva', value: pinNuevo, set: setPinNuevo },
          { label: 'Confirmar contraseña nueva', value: pinConfirm, set: setPinConfirm },
        ].map(({ label, value, set }) => (
          <View key={label}>
            <Text style={s.inputLabel}>{label.toUpperCase()}</Text>
            <TextInput
              style={s.input}
              value={value}
              onChangeText={set}
              placeholder="••••••••"
              placeholderTextColor="#CBD5E1"
              secureTextEntry
              keyboardType="default"
              maxLength={100}
            />
          </View>
        ))}

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleCambiarPin} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>GUARDAR CONTRASEÑA</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={signOut}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: COLORS.placeholder, letterSpacing: 2, marginBottom: 14 },
  hint: { fontSize: 13, color: COLORS.placeholder, marginBottom: 14, lineHeight: 18 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.muted },
  filaLabel: { fontSize: 13, color: COLORS.placeholder },
  filaValue: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  rolBadge: { backgroundColor: COLORS.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  rolText: { fontSize: 12, fontWeight: '700', color: COLORS.dark },
  inputLabel: { fontSize: 10, fontWeight: '700', color: COLORS.placeholder, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.dark },
  btn: { backgroundColor: COLORS.dark, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: COLORS.white, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  logoutBtn: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 20, backgroundColor: COLORS.white },
  logoutText: { color: COLORS.error, fontWeight: '700', fontSize: 15 },
});
