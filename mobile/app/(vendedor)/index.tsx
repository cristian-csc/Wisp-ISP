import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes, ClienteListItem, EstadoCliente } from '@/services/api';
import { VendedorNav } from '@/components/VendedorNav';
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

function ClienteCard({ item, onPress }: { item: ClienteListItem; onPress: () => void }) {
  const color = ESTADO_COLOR[item.estado];
  return (
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.75}>
      <View style={st.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={st.nombre}>{item.nombre}</Text>
          <Text style={st.sub}>DNI {item.dni ?? '—'} · {item.telefono ?? 'sin teléfono'}</Text>
          {item.zona && (
            <View style={st.zonaTagRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.info} />
              <Text style={st.zonaTag}>{item.zona.nombre}</Text>
            </View>
          )}
        </View>
        <View style={[st.badge, { backgroundColor: color + '22' }]}>
          <Text style={[st.badgeText, { color }]}>{ESTADO_LABEL[item.estado]}</Text>
        </View>
      </View>
      <Text style={st.planText}>{item.plan?.nombre ?? '—'}</Text>
    </TouchableOpacity>
  );
}

export default function VendedorClientesScreen() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getClientes({ per_page: 100 });
      setClientes(data.items);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendientes = clientes.filter(c => c.estado === 'pendiente_aprobacion').length;
  const activos = clientes.filter(c => c.estado === 'activo').length;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={clientes}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <ClienteCard item={item} onPress={() => router.push(`/(vendedor)/cliente/${item.id}` as any)} />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View style={st.statsRow}>
            <View style={[st.statCard, { borderTopColor: COLORS.info }]}>
              <Text style={[st.statValue, { color: COLORS.info }]}>{clientes.length}</Text>
              <Text style={st.statLabel}>Total</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.warning }]}>
              <Text style={[st.statValue, { color: COLORS.warning }]}>{pendientes}</Text>
              <Text style={st.statLabel}>Pendientes</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.success }]}>
              <Text style={[st.statValue, { color: COLORS.success }]}>{activos}</Text>
              <Text style={st.statLabel}>Activos</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="people-outline" size={44} color={COLORS.placeholder} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Aún no has registrado clientes</Text>
          </View>
        }
      />
      <VendedorNav />
    </View>
  );
}

const st = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  nombre: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  sub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },
  zonaTagRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  zonaTag: { fontSize: 11, color: COLORS.info, fontWeight: '600' },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 140 },
  badgeText: { fontSize: 10, fontWeight: '700', textAlign: 'right' },
  planText: { fontSize: 13, color: '#475569', fontWeight: '600' },
});
