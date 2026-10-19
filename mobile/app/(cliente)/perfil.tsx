import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { cambiarPin } from '@/services/api';
import { COLORS } from '@/theme/colors';

export default function PerfilScreen() {
  const { session, signOut } = useSession();
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCambiarPin() {
    if (!pinActual || !pinNuevo || !pinConfirm) { Alert.alert('Campos requeridos', 'Completa todos los campos.'); return; }
    if (pinNuevo.length !== 4 || !/^\d{4}$/.test(pinNuevo)) { Alert.alert('PIN inválido', 'El PIN debe tener exactamente 4 dígitos.'); return; }
    if (pinNuevo !== pinConfirm) { Alert.alert('PIN no coincide', 'El PIN nuevo y la confirmación no son iguales.'); return; }
    setSaving(true);
    try {
      await cambiarPin(pinActual, pinNuevo);
      setPinActual(''); setPinNuevo(''); setPinConfirm('');
      Alert.alert('PIN actualizado', 'Tu PIN fue cambiado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo cambiar el PIN');
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
        <Text style={s.cardTitle}>CAMBIAR PIN</Text>
        <Text style={s.hint}>Tu PIN por defecto es la fecha de instalación en formato DDMM. Puedes cambiarlo por uno de 4 dígitos.</Text>

        {[
          { label: 'PIN actual', value: pinActual, set: setPinActual },
          { label: 'PIN nuevo (4 dígitos)', value: pinNuevo, set: setPinNuevo },
          { label: 'Confirmar PIN nuevo', value: pinConfirm, set: setPinConfirm },
        ].map(({ label, value, set }) => (
          <View key={label}>
            <Text style={s.inputLabel}>{label.toUpperCase()}</Text>
            <TextInput
              style={s.input}
              value={value}
              onChangeText={set}
              placeholder="••••"
              placeholderTextColor="#CBD5E1"
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
        ))}

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleCambiarPin} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>GUARDAR PIN</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={signOut}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 2, marginBottom: 14 },
  hint: { fontSize: 13, color: '#94A3B8', marginBottom: 14, lineHeight: 18 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  filaLabel: { fontSize: 13, color: '#94A3B8' },
  filaValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rolBadge: { backgroundColor: COLORS.lightprimary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  rolText: { fontSize: 12, fontWeight: '700', color: COLORS.primaryEmphasis },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1E293B' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  logoutBtn: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 20, backgroundColor: '#FFFFFF' },
  logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
});
