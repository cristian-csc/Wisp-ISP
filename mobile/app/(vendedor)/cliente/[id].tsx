import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getCliente, ClienteDetalle, EstadoCliente } from '@/services/api';
import { COLORS } from '@/theme/colors';

const ESTADO_LABEL: Record<EstadoCliente, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobado: 'Aprobado — por instalar',
  rechazado: 'Rechazado',
  activo: 'Activo',
  no_instalado: 'No se instaló',
  suspendido: 'Suspendido',
  anulado: 'Anulado',
};
const ESTADO_COLOR: Record<EstadoCliente, string> = {
  pendiente_aprobacion: COLORS.warning,
  aprobado: COLORS.info,
  rechazado: COLORS.error,
  activo: COLORS.success,
  no_instalado: COLORS.error,
  suspendido: COLORS.mutedForeground,
  anulado: COLORS.mutedForeground,
};

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fila}>
      <Text style={s.filaLabel}>{label}</Text>
      <Text style={s.filaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function VendedorClienteDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getCliente(Number(id));
        setCliente(data);
        navigation.setOptions({ title: data.nombre });
      } catch {
        Alert.alert('Error', 'No se pudo cargar el cliente');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  if (!cliente) return <View style={s.container}><Text style={s.empty}>Cliente no encontrado</Text></View>;

  const color = ESTADO_COLOR[cliente.estado];

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={[s.estadoBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={[s.estadoText, { color }]}>{ESTADO_LABEL[cliente.estado]}</Text>
      </View>

      {cliente.estado === 'rechazado' && cliente.motivo_rechazo && (
        <View style={s.motivoCard}>
          <Text style={s.motivoTitle}>MOTIVO DE RECHAZO</Text>
          <Text style={s.motivoText}>{cliente.motivo_rechazo}</Text>
        </View>
      )}
      {cliente.estado === 'no_instalado' && cliente.motivo_no_instalado && (
        <View style={s.motivoCard}>
          <Text style={s.motivoTitle}>MOTIVO</Text>
          <Text style={s.motivoText}>{cliente.motivo_no_instalado}</Text>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>INFORMACIÓN PERSONAL</Text>
        <Fila label="Nombre" value={cliente.nombre} />
        <Fila label="DNI" value={cliente.dni ?? '—'} />
        <Fila label="Teléfono" value={cliente.telefono ?? '—'} />
        <Fila label="Dirección" value={cliente.direccion ?? '—'} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>SERVICIO</Text>
        <Fila label="Plan" value={cliente.plan?.nombre ?? '—'} />
        <Fila label="Zona" value={cliente.zona?.nombre ?? '—'} />
        <Fila label="Instalación" value={cliente.fecha_instalacion ?? '—'} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  empty: { color: COLORS.mutedForeground, textAlign: 'center', marginTop: 60, fontSize: 15 },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  estadoText: { fontSize: 14, fontWeight: '700' },
  motivoCard: { backgroundColor: COLORS.lighterror, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  motivoTitle: { fontSize: 10, fontWeight: '700', color: COLORS.error, letterSpacing: 1.5, marginBottom: 6 },
  motivoText: { fontSize: 13, color: COLORS.dark, lineHeight: 19 },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: COLORS.mutedForeground, letterSpacing: 2, marginBottom: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  filaLabel: { color: COLORS.mutedForeground, fontSize: 13 },
  filaValue: { color: COLORS.dark, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
