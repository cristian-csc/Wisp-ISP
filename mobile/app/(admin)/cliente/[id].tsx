import { useState, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getCliente, suspenderCliente, activarCliente, ClienteDetalle } from '@/services/api';
import { COLORS } from '@/theme/colors';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function Fila({ label, value, mono = false, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <View style={s.fila}>
      <Text style={s.filaLabel}>{label}</Text>
      <Text style={[s.filaValue, mono && s.mono, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ClienteDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await getCliente(Number(id));
      setCliente(data);
      navigation.setOptions({ title: data.nombre });
    } catch {
      Alert.alert('Error', 'No se pudo cargar el cliente');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function toggleEstado() {
    if (!cliente) return;
    const esSuspendido = cliente.estado === 'suspendido';
    Alert.alert(
      esSuspendido ? 'Activar servicio' : 'Cortar servicio',
      `¿${esSuspendido ? 'Activar' : 'Suspender'} el servicio de ${cliente.nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: esSuspendido ? 'Activar' : 'Cortar',
          style: esSuspendido ? 'default' : 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              if (esSuspendido) await activarCliente(cliente.id);
              else await suspenderCliente(cliente.id);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo completar');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  if (!cliente) return <View style={s.container}><Text style={s.empty}>Cliente no encontrado</Text></View>;

  const activo = cliente.estado === 'activo';
  const suspendido = cliente.estado === 'suspendido';
  const dias = cliente.fecha_vencimiento
    ? Math.ceil((new Date(cliente.fecha_vencimiento).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* Estado */}
      <View style={[s.estadoBadge, activo ? s.badgeGreen : suspendido ? s.badgeRed : s.badgeGray]}>
        <View style={[s.dot, activo ? s.dotGreen : suspendido ? s.dotRed : s.dotGray]} />
        <Text style={[s.estadoText, activo ? s.textGreen : suspendido ? s.textRed : s.textGray]}>
          {activo ? 'Servicio Activo' : suspendido ? 'Servicio Cortado' : 'Anulado'}
        </Text>
      </View>

      {/* Vencimiento */}
      {dias !== null && (
        <View style={[s.diasCard, dias < 0 ? s.diasRojo : dias <= 5 ? s.diasOrange : s.diasGreen]}>
          <Text style={[s.diasText, dias < 0 ? s.textRed : dias <= 5 ? s.textOrange : s.textGreenC]}>
            {dias < 0 ? `⚠ Vencido hace ${Math.abs(dias)} días` : dias === 0 ? '⚠ Vence hoy' : `📅 Vence en ${dias} días`}
          </Text>
        </View>
      )}

      {/* Info personal */}
      <View style={s.card}>
        <Text style={s.cardTitle}>INFORMACIÓN PERSONAL</Text>
        <Fila label="Nombre" value={cliente.nombre} />
        <Fila label="Teléfono" value={cliente.telefono ?? '—'} />
        <Fila label="Dirección" value={cliente.direccion ?? '—'} />
      </View>

      {/* Servicio */}
      <View style={s.card}>
        <Text style={s.cardTitle}>SERVICIO</Text>
        <Fila label="Plan" value={cliente.plan?.nombre ?? '—'} />
        <Fila label="Zona" value={cliente.zona?.nombre ?? '—'} />
        <Fila label="Usuario PPPoE" value={cliente.usuario_pppoe} mono />
        <Fila label="Instalación" value={fmt(cliente.fecha_instalacion)} />
        <Fila
          label="Vencimiento"
          value={fmt(cliente.fecha_vencimiento)}
          color={dias !== null && dias < 0 ? COLORS.error : dias !== null && dias <= 5 ? COLORS.warning : undefined}
        />
      </View>

      {/* Acción */}
      {cliente.estado !== 'anulado' && (
        <TouchableOpacity
          style={[s.actionBtn, suspendido ? s.activarBtn : s.cortarBtn]}
          onPress={toggleEstado}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={suspendido ? COLORS.dark : '#FFFFFF'} />
            : <Text style={[s.actionText, suspendido && { color: COLORS.dark }]}>
                {suspendido ? '▶  Activar servicio' : '⏹  Cortar servicio'}
              </Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 60, fontSize: 15 },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' },
  badgeRed: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
  badgeGray: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#10B981' },
  dotRed: { backgroundColor: '#EF4444' },
  dotGray: { backgroundColor: '#94A3B8' },
  estadoText: { fontSize: 14, fontWeight: '700' },
  textGreen: { color: '#059669' },
  textRed: { color: '#DC2626' },
  textGray: { color: '#94A3B8' },
  textOrange: { color: '#D97706' },
  textGreenC: { color: '#059669' },
  diasCard: { borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1 },
  diasRojo: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' },
  diasOrange: { backgroundColor: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' },
  diasGreen: { backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' },
  diasText: { fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 2, marginBottom: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  filaLabel: { color: '#94A3B8', fontSize: 13 },
  filaValue: { color: '#1E293B', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12 },
  actionBtn: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  cortarBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  activarBtn: { backgroundColor: COLORS.primary },
  actionText: { color: '#DC2626', fontWeight: '800', fontSize: 15 },
});
