import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/hooks/useSession';
import { Logo } from '@/components/Logo';
import { COLORS } from '@/theme/colors';

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

export function CuentaScreen({ rolLabel, rolIcon }: { rolLabel: string; rolIcon: keyof typeof Ionicons.glyphMap }) {
  const { session, signOut } = useSession();

  function confirmarSalir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(session?.nombre ?? '')}</Text>
        </View>
        <Text style={s.nombre}>{session?.nombre ?? '—'}</Text>
        <View style={s.rolBadge}>
          <Ionicons name={rolIcon} size={13} color={COLORS.primaryEmphasis} />
          <Text style={s.rolText}>{rolLabel}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={confirmarSalir}>
        <Ionicons name="log-out-outline" size={19} color={COLORS.error} />
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={s.footer}>
        <Logo height={18} />
        <Text style={s.footerText}>Sistema de gestión ISP</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  header: { alignItems: 'center', paddingVertical: 28 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { color: COLORS.white, fontSize: 26, fontWeight: '900' },
  nombre: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  rolBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.lightprimary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  rolText: { fontSize: 12, fontWeight: '700', color: COLORS.primaryEmphasis },
  logoutBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: COLORS.lighterror, borderRadius: 12, paddingVertical: 14, marginTop: 12 },
  logoutText: { color: COLORS.error, fontWeight: '800', fontSize: 14 },
  footer: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingBottom: 20 },
  footerText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
});
