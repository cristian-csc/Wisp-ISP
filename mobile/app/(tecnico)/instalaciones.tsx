import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
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
              <Ionicons name="location-outline" size={12} color={COLORS.mutedForeground} />
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

/**
 * Dos listas en una pantalla: lo que este técnico instaló, y lo que dio de
 * alta. Son grupos distintos — se puede registrar a un cliente que instala
 * otro, y al revés — pero se ven exactamente igual, así que lo único que
 * cambia es la consulta y los textos.
 */
export default function MisInstalacionesScreen() {
  const { modo } = useLocalSearchParams<{ modo?: string }>();
  const esRegistros = modo === 'registros';
  const [clientes, setClientes] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getClientes(
        esRegistros
          ? { solo_mis_registros: true, per_page: 100 }
          : { solo_mis_instalaciones: true, per_page: 100 },
      );
      setClientes(data.items);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [esRegistros]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.mutedForeground} size="large" />;

  const activos = clientes.filter(c => c.estado === 'activo').length;
  // En "registros" la fecha de instalación no sirve de referencia: un cliente
  // recién registrado todavía no tiene ninguna.
  const esteMes = clientes.filter(c => {
    if (!c.fecha_instalacion) return false;
    const hoy = new Date();
    const f = new Date(c.fecha_instalacion);
    return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
  }).length;
  const pendientes = clientes.filter(c => c.estado !== 'activo').length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* El titulo lo pone la pantalla, no el layout: es la misma para las
          dos listas y tiene que decir cual se esta viendo. */}
      <Stack.Screen
        options={{ title: esRegistros ? 'Clientes que registré' : 'Mis instalaciones' }}
      />
      <FlatList
        data={clientes}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => <InstalacionCard item={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.dark} />}
        ListHeaderComponent={
          <View style={st.statsRow}>
            <View style={[st.statCard, { borderTopColor: COLORS.dark }]}>
              <Text style={[st.statValue, { color: COLORS.dark }]}>{clientes.length}</Text>
              <Text style={st.statLabel}>{esRegistros ? 'Total registrados' : 'Total instaladas'}</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.success }]}>
              <Text style={[st.statValue, { color: COLORS.success }]}>{activos}</Text>
              <Text style={st.statLabel}>Activos</Text>
            </View>
            <View style={[st.statCard, { borderTopColor: COLORS.dark }]}>
              <Text style={[st.statValue, { color: COLORS.mutedForeground }]}>
                {esRegistros ? pendientes : esteMes}
              </Text>
              <Text style={st.statLabel}>{esRegistros ? 'Sin activar' : 'Este mes'}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons
              name={esRegistros ? 'person-add-outline' : 'construct-outline'}
              size={44}
              color={COLORS.placeholder}
            />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>
              {esRegistros ? 'Aún no has registrado ningún cliente' : 'Aún no has instalado ningún cliente'}
            </Text>
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
  statLabel: { fontSize: 11, color: COLORS.mutedForeground, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  nombre: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  sub: { fontSize: 13, color: COLORS.mutedForeground, fontWeight: '600', marginTop: 2 },
  zonaTagRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  zonaTag: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  fechaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  fechaText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
});
