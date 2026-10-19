import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getOrdenesRetiro, OrdenRetiro } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { COLORS } from '@/theme/colors';

const ESTADO_LABEL: Record<OrdenRetiro['estado'], string> = {
  pendiente: 'Pendiente',
  completado: 'Completado',
};
const ESTADO_COLOR: Record<OrdenRetiro['estado'], string> = {
  pendiente: COLORS.warning,
  completado: COLORS.success,
};

function OrdenCard({ item, onPress }: { item: OrdenRetiro; onPress: () => void }) {
  const color = ESTADO_COLOR[item.estado];
  return (
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.75}>
      <View style={st.cardTop}>
        <Text style={st.cliente}>{item.cliente?.nombre ?? `Cliente #${item.cliente_id}`}</Text>
        <View style={[st.badge, { backgroundColor: color + '22' }]}>
          <Text style={[st.badgeText, { color }]}>{ESTADO_LABEL[item.estado]}</Text>
        </View>
      </View>
      {item.cliente?.direccion && (
        <View style={st.row}>
          <Ionicons name="location-outline" size={13} color={COLORS.mutedForeground} />
          <Text style={st.rowText} numberOfLines={1}>{item.cliente.direccion}</Text>
        </View>
      )}
      {item.cliente?.telefono && (
        <View style={st.row}>
          <Ionicons name="call-outline" size={13} color={COLORS.mutedForeground} />
          <Text style={st.rowText}>{item.cliente.telefono}</Text>
        </View>
      )}
      <Text style={st.motivo} numberOfLines={2}>{item.motivo}</Text>
      {item.estado === 'pendiente' && (
        <View style={st.ctaRow}>
          <Text style={st.ctaText}>Toca para registrar el equipo recogido</Text>
          <Ionicons name="arrow-forward" size={13} color={COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function RetirosScreen() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState<OrdenRetiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOrdenesRetiro();
      setOrdenes(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const header = (
    <Stack.Screen options={{ title: 'Órdenes de retiro', headerTintColor: COLORS.primary }} />
  );

  if (loading) return (
    <>
      {header}
      <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />
    </>
  );

  const pendientes = ordenes.filter((o) => o.estado === 'pendiente');

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {header}
      <FlatList
        data={ordenes}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <OrdenCard item={item} onPress={() => router.push(`/(tecnico)/retiros/${item.id}` as any)} />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={<Text style={st.listaHeader}>{pendientes.length} retiro{pendientes.length !== 1 ? 's' : ''} pendiente{pendientes.length !== 1 ? 's' : ''}</Text>}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="archive-outline" size={44} color={COLORS.placeholder} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Sin órdenes de retiro asignadas</Text>
          </View>
        }
      />
      <TecnicoNav />
    </View>
  );
}

const st = StyleSheet.create({
  listaHeader: { color: COLORS.mutedForeground, fontSize: 12, marginBottom: 10, letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cliente: { fontSize: 14, fontWeight: '700', color: COLORS.dark, flex: 1, marginRight: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  rowText: { fontSize: 12, color: '#475569', flexShrink: 1 },
  motivo: { fontSize: 13, color: '#475569', marginTop: 4 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  ctaText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
});
