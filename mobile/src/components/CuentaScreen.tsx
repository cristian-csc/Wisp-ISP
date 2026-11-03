import { useState, useEffect, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/hooks/useSession';
import { getMe, actualizarMiPerfil, cambiarPassword, UsuarioMe } from '@/services/api';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function antiguedad(fechaIngreso: string | null): string {
  if (!fechaIngreso) return 'Sin registrar';
  const inicio = new Date(fechaIngreso);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return 'Menos de 1 mes';
  if (meses < 12) return `${meses} mes${meses !== 1 ? 'es' : ''}`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto > 0 ? `${anios} año${anios !== 1 ? 's' : ''}, ${resto} mes${resto !== 1 ? 'es' : ''}` : `${anios} año${anios !== 1 ? 's' : ''}`;
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={16} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function AccionRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.accionRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={s.accionText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.mutedForeground} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

export function CuentaScreen({
  rolLabel,
  rolIcon,
  children,
}: {
  rolLabel: string;
  rolIcon: keyof typeof Ionicons.glyphMap;
  children?: ReactNode;
}) {
  const { session, signOut } = useSession();
  const [perfil, setPerfil] = useState<UsuarioMe | null>(null);
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  function cargarPerfil() {
    getMe().then(setPerfil).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { cargarPerfil(); }, []);

  function confirmarSalir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: signOut },
    ]);
  }

  function abrirEditar() {
    setTelefono(perfil?.telefono ?? '');
    setDireccion(perfil?.direccion ?? '');
    setEditando(true);
  }

  async function guardarPerfil() {
    setGuardandoPerfil(true);
    try {
      const actualizado = await actualizarMiPerfil({ telefono: telefono || undefined, direccion: direccion || undefined });
      setPerfil(actualizado);
      setEditando(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  function abrirCambiarPassword() {
    setPasswordActual(''); setPasswordNueva(''); setPasswordConfirmar('');
    setCambiandoPassword(true);
  }

  async function guardarPassword() {
    if (passwordNueva.length < 8) {
      Alert.alert('Clave muy corta', 'La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      Alert.alert('No coinciden', 'La confirmación no coincide con la contraseña nueva.');
      return;
    }
    setGuardandoPassword(true);
    try {
      await cambiarPassword(passwordActual, passwordNueva);
      setCambiandoPassword(false);
      Alert.alert('✓ Listo', 'Tu contraseña se actualizó correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo cambiar la contraseña');
    } finally {
      setGuardandoPassword(false);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(session?.nombre ?? '')}</Text>
        </View>
        <Text style={s.nombre}>{session?.nombre ?? '—'}</Text>
        <View style={s.rolBadge}>
          <Ionicons name={rolIcon} size={13} color={COLORS.white} />
          <Text style={s.rolText}>{rolLabel}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
      ) : (
        <>
          <View style={s.infoCard}>
            <InfoRow icon="call-outline" label="Teléfono" value={perfil?.telefono ?? 'Sin registrar'} />
            <View style={s.divider} />
            <InfoRow icon="card-outline" label="DNI" value={perfil?.dni ?? 'Sin registrar'} />
            <View style={s.divider} />
            <InfoRow icon="location-outline" label="Dirección" value={perfil?.direccion ?? 'Sin registrar'} />
            <View style={s.divider} />
            <InfoRow icon="time-outline" label="Con nosotros desde" value={antiguedad(perfil?.fecha_ingreso ?? null)} />
          </View>

          <View style={s.accionesCard}>
            <AccionRow icon="create-outline" label="Editar mis datos" onPress={abrirEditar} />
            <View style={s.divider} />
            <AccionRow icon="key-outline" label="Cambiar contraseña" onPress={abrirCambiarPassword} />
          </View>
        </>
      )}

      {children}

      <TouchableOpacity style={s.logoutBtn} onPress={confirmarSalir}>
        <Ionicons name="log-out-outline" size={19} color={COLORS.error} />
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={s.footer}>
        <Logo height={18} />
        <Text style={s.footerText}>Sistema de gestión ISP</Text>
      </View>

      {/* Editar mis datos */}
      <Modal visible={editando} transparent animationType="fade" onRequestClose={() => setEditando(false)}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Editar mis datos</Text>
            <Text style={s.modalLabel}>Teléfono</Text>
            <TextInput
              style={s.modalInput}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="999 999 999"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
            />
            <Text style={s.modalLabel}>Dirección</Text>
            <TextInput
              style={s.modalInput}
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Tu dirección"
              placeholderTextColor={COLORS.placeholder}
            />
            <View style={s.modalRow}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditando(false)} disabled={guardandoPerfil}>
                <Text style={s.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSubmitBtn, guardandoPerfil && { opacity: 0.6 }]} onPress={guardarPerfil} disabled={guardandoPerfil}>
                {guardandoPerfil ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.modalSubmitText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cambiar contraseña */}
      <Modal visible={cambiandoPassword} transparent animationType="fade" onRequestClose={() => setCambiandoPassword(false)}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Cambiar contraseña</Text>
            <Text style={s.modalLabel}>Contraseña actual</Text>
            <TextInput style={s.modalInput} value={passwordActual} onChangeText={setPasswordActual} secureTextEntry placeholderTextColor={COLORS.placeholder} />
            <Text style={s.modalLabel}>Contraseña nueva</Text>
            <TextInput style={s.modalInput} value={passwordNueva} onChangeText={setPasswordNueva} secureTextEntry placeholder="Mínimo 8 caracteres" placeholderTextColor={COLORS.placeholder} />
            <Text style={s.modalLabel}>Confirmar contraseña nueva</Text>
            <TextInput style={s.modalInput} value={passwordConfirmar} onChangeText={setPasswordConfirmar} secureTextEntry placeholderTextColor={COLORS.placeholder} />
            <View style={s.modalRow}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setCambiandoPassword(false)} disabled={guardandoPassword}>
                <Text style={s.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, (guardandoPassword || !passwordActual || !passwordNueva) && { opacity: 0.6 }]}
                onPress={guardarPassword}
                disabled={guardandoPassword || !passwordActual || !passwordNueva}
              >
                {guardandoPassword ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.modalSubmitText}>Cambiar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 32 },
  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarText: { color: COLORS.white, fontSize: 26, fontWeight: '900' },
  nombre: { fontSize: 19, fontWeight: '800', color: COLORS.white },
  rolBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  rolText: { fontSize: 12, fontWeight: '700', color: COLORS.white },

  infoCard: { backgroundColor: COLORS.card, borderRadius: 16, marginHorizontal: 20, marginTop: -16, padding: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10 },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.lightprimary, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
  infoValue: { fontSize: 14, color: COLORS.dark, fontWeight: '700', marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 10 },

  accionesCard: { backgroundColor: COLORS.card, borderRadius: 16, marginHorizontal: 20, marginTop: 14, padding: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  accionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 10 },
  accionText: { fontSize: 14, color: COLORS.dark, fontWeight: '700' },

  logoutBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.25)', backgroundColor: COLORS.lighterror, borderRadius: 12, paddingVertical: 14, marginHorizontal: 20, marginTop: 20 },
  logoutText: { color: COLORS.error, fontWeight: '800', fontSize: 14 },
  footer: { alignItems: 'center', gap: 6, paddingBottom: 20, paddingTop: 20 },
  footerText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(28,37,54,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 14 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.mutedForeground, marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.dark },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  modalSubmitBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalSubmitText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});
