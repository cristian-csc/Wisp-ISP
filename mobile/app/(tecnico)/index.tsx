import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes, noInstalarCliente, ClienteListItem } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { PromptModal } from '@/components/PromptModal';
import { COLORS } from '@/theme/colors';

function OrdenCard({ item, onInstalar, onNoInstalar }: {
  item: ClienteListItem; onInstalar: () => void; onNoInstalar: () => void;
}) {
  return (
    <View style={st.card}>
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
        <View style={st.badge}>
          <Ionicons name={item.tipo_conexion === 'inalambrico' ? 'wifi-outline' : 'git-network-outline'} size={12} color={COLORS.primaryEmphasis} />
          <Text style={st.badgeText}>{item.tipo_conexion === 'inalambrico' ? 'Inalámbrico' : 'Fibra'}</Text>
        </View>
      </View>
      <Text style={st.planText}>{item.plan?.nombre ?? '—'}</Text>
      <View style={st.btnRow}>
        <TouchableOpacity style={st.btnGhost} onPress={onNoInstalar}>
          <Text style={st.btnGhostText}>No se pudo instalar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnPrimary} onPress={onInstalar}>
          <Text style={st.btnPrimaryText}>Instalar</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TecnicoOrdenesScreen() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState<ClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noInstalarTarget, setNoInstalarTarget] = useState<ClienteListItem | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getClientes({ estado: 'aprobado', per_page: 100 });
      setOrdenes(data.items);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmarNoInstalar(motivo: string) {
    if (!noInstalarTarget) return;
    try {
      await noInstalarCliente(noInstalarTarget.id, motivo);
      setNoInstalarTarget(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={ordenes}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <OrdenCard
            item={item}
            onInstalar={() => router.push(`/(tecnico)/instalar/${item.id}` as any)}
            onNoInstalar={() => setNoInstalarTarget(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View>
            <View style={st.hero}>
              <Text style={st.heroLabel}>ÓRDENES PENDIENTES</Text>
              <Text style={st.heroValue}>{ordenes.length}</Text>
              <View style={st.heroActions}>
                <TouchableOpacity style={st.heroBtnLight} onPress={() => router.push('/(tecnico)/escanear-equipo' as any)}>
                  <Ionicons name="scan-outline" size={16} color={COLORS.primary} />
                  <Text style={st.heroBtnLightText}>Escanear Equipo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.heroBtnDark} onPress={() => router.push('/(tecnico)/inventario' as any)}>
                  <Ionicons name="cube-outline" size={16} color={COLORS.white} />
                  <Text style={st.heroBtnDarkText}>Ver Mi Stock</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={st.heroBtnMapa} onPress={() => router.push('/(tecnico)/mapa' as any)}>
                <Ionicons name="map-outline" size={16} color={COLORS.white} />
                <Text style={st.heroBtnMapaText}>Ver mapa de mi zona</Text>
              </TouchableOpacity>
            </View>
            <Text style={st.listaHeader}>{ordenes.length} orden{ordenes.length !== 1 ? 'es' : ''} de instalación pendiente{ordenes.length !== 1 ? 's' : ''}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="checkmark-circle-outline" size={44} color={COLORS.success} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Sin órdenes pendientes</Text>
          </View>
        }
      />
      <TecnicoNav />
      <PromptModal
        visible={!!noInstalarTarget}
        title={`¿Por qué no se pudo instalar a ${noInstalarTarget?.nombre}?`}
        placeholder="Ej: dirección no encontrada, cliente no estaba, zona sin cobertura..."
        onCancel={() => setNoInstalarTarget(null)}
        onSubmit={confirmarNoInstalar}
        submitLabel="Confirmar"
      />
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: COLORS.primary, borderRadius: 18, padding: 18, marginBottom: 16 },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heroValue: { color: COLORS.white, fontSize: 32, fontWeight: '900', marginTop: 4, marginBottom: 14 },
  heroActions: { flexDirection: 'row', gap: 10 },
  heroBtnMapa: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 10, marginTop: 10 },
  heroBtnMapaText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  heroBtnLight: { flex: 1, backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  heroBtnLightText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  heroBtnDark: { flex: 1, backgroundColor: COLORS.primaryEmphasis, borderRadius: 12, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  heroBtnDarkText: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
  listaHeader: { color: COLORS.mutedForeground, fontSize: 12, marginBottom: 10, letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  nombre: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  sub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },
  zonaTagRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  zonaTag: { fontSize: 11, color: COLORS.info, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.lightprimary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, color: COLORS.primaryEmphasis, fontWeight: '700' },
  planText: { fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnGhost: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.lighterror, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  btnGhostText: { color: COLORS.error, fontWeight: '700', fontSize: 12 },
  btnPrimary: { flex: 1, flexDirection: 'row', gap: 5, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  btnPrimaryText: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
});
