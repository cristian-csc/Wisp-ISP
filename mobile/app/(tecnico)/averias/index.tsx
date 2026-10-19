import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAverias, iniciarAveria, Averia } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { COLORS } from '@/theme/colors';

const ESTADO_LABEL: Record<Averia['estado'], string> = {
  pendiente: 'Pendiente',
  asignada: 'Asignada',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
};
const ESTADO_COLOR: Record<Averia['estado'], string> = {
  pendiente: COLORS.warning,
  asignada: COLORS.info,
  en_proceso: COLORS.primary,
  resuelta: COLORS.success,
};

function AveriaCard({ item, onIniciar, onPress }: { item: Averia; onIniciar: () => void; onPress: () => void }) {
  const color = ESTADO_COLOR[item.estado];
  return (
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.75}>
      <View style={st.cardTop}>
        <Text style={st.cliente}>{item.cliente?.nombre ?? (item.caja_nap ? `Caja ${item.caja_nap.codigo}` : 'Planta externa')}</Text>
        <View style={[st.badge, { backgroundColor: color + '22' }]}>
          <Text style={[st.badgeText, { color }]}>{ESTADO_LABEL[item.estado]}</Text>
        </View>
      </View>
      <Text style={st.motivo} numberOfLines={2}>{item.motivo_reportado}</Text>
      {item.estado === 'asignada' && (
        <TouchableOpacity style={st.iniciarBtn} onPress={(e) => { e.stopPropagation(); onIniciar(); }}>
          <Ionicons name="play-outline" size={14} color={COLORS.white} />
          <Text style={st.iniciarText}>Iniciar atención</Text>
        </TouchableOpacity>
      )}
      {item.estado === 'en_proceso' && (
        <View style={st.enProcesoRow}>
          <Text style={st.enProcesoHint}>Toca para registrar la solución</Text>
          <Ionicons name="arrow-forward" size={13} color={COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AveriasScreen() {
  const router = useRouter();
  const [averias, setAverias] = useState<Averia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAverias();
      setAverias(data.filter(a => a.estado !== 'resuelta'));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function iniciar(item: Averia) {
    try {
      await iniciarAveria(item.id);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  const header = (
    <Stack.Screen
      options={{
        title: 'Averías',
        headerTintColor: COLORS.primary,
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push('/(tecnico)/averias/nueva')} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        ),
      }}
    />
  );

  if (loading) return (
    <>
      {header}
      <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {header}
      <FlatList
        data={averias}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <AveriaCard
            item={item}
            onIniciar={() => iniciar(item)}
            onPress={() => router.push(`/(tecnico)/averias/${item.id}` as any)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={<Text style={st.listaHeader}>{averias.length} avería{averias.length !== 1 ? 's' : ''} en atención</Text>}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="build-outline" size={44} color={COLORS.placeholder} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Sin averías asignadas</Text>
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
  motivo: { fontSize: 13, color: '#475569' },
  iniciarBtn: { flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  iniciarText: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
  enProcesoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  enProcesoHint: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
});
