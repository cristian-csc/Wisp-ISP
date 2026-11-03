import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getClientes, ClienteListItem } from '@/services/api';
import { COLORS } from '@/theme/colors';

function InstalacionCard({ item }: { item: ClienteListItem }) {
  const activo = item.estado === 'activo';
  return (
    <View style={st.card}>
      <View style={st.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={st.nombre}>{item.nombre}</Text>
          <Text style={st.sub}>{item.plan?.nombre ?? '—'}</Text>
          {item.zona && (
            <View style={st.zonaTagRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.info} />
              <Text style={st.zonaTag}>{item.zona?.nombre ?? 'Sin zona'}</Text>
            </View>
          )}
        </View>
        <View style={[st.badge, { backgroundColor: (activo ? COLORS.success : COLORS.mutedForeground) + '22' }]}>
          <Text style={[st.badgeText, { color: activo ? COLORS.success : COLORS.mutedForeground }]}>
            {activo ? 'Activo' : item.estado}
          </Text>
        </View>
      </View>
      {item.fecha_instalacion && (
        <View style={st.fechaRow}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.mutedForeground} />
          <Text style={st.fechaText}>Instalado el {item.fecha_instalacion}</Text>
        </View>
      )}
    </View>
  );
}

export default function MisInstalacionesScreen() {
  const [clientes, setClientes] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getClientes({ solo_mis_instalaciones: true, per_page: 100 });
      setClientes(data.items);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  const activos = clientes.filter(c => c.estado === 'activo').length;
  const esteMes = clientes.filter(c => {
    if (!c.fecha_instalacion) return false;
    const hoy = new Date();
    const f = new Date(c.fecha_instalacion);
    return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
  }).length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={clientes}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => <InstalacionCard item={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View style={st.statsRow}>
            <View style={[st.statCard, { borderTopColor: COLORS.primary }]}>
              <Text style={[st.statValue, { color: COLORS.primary }]}>{clientes.length}</Text>
              <Text style={st.statLabel}>Total instaladas</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.success }]}>
              <Text style={[st.statValue, { color: COLORS.success }]}>{activos}</Text>
              <Text style={st.statLabel}>Activas</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.info }]}>
              <Text style={[st.statValue, { color: COLORS.info }]}>{esteMes}</Text>
              <Text style={st.statLabel}>Este mes</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="construct-outline" size={44} color={COLORS.placeholder} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Aún no has instalado ningún cliente</Text>
          </View>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  nombre: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  sub: { fontSize: 13, color: '#475569', fontWeight: '600', marginTop: 2 },
  zonaTagRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  zonaTag: { fontSize: 11, color: COLORS.info, fontWeight: '600' },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  fechaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  fechaText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
});
