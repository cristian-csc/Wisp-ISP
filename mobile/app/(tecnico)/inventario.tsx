import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getOnus, marcarOnu, Onu } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { ESPACIO_BARRA } from '@/components/BarraInferior';
import { COLORS } from '@/theme/colors';
import { alerta } from '@/components/Aviso';

const ESTADO_LABEL: Record<Onu['estado'], string> = {
  en_almacen: 'En almacén',
  asignado_tecnico: 'En tu inventario',
  instalado: 'Instalada',
  danado: 'Dañada',
  perdido: 'Perdida',
};
const ESTADO_COLOR: Record<Onu['estado'], string> = {
  en_almacen: COLORS.mutedForeground,
  asignado_tecnico: COLORS.dark,
  instalado: COLORS.success,
  danado: COLORS.error,
  perdido: COLORS.error,
};

function OnuCard({ item, onMarcar }: { item: Onu; onMarcar: (estado: 'danado' | 'perdido') => void }) {
  const color = ESTADO_COLOR[item.estado];
  const puedeMarcar = item.estado === 'asignado_tecnico' || item.estado === 'instalado';
  return (
    <View style={st.card}>
      <View style={st.cardTop}>
        <View>
          <Text style={st.serie}>{item.numero_serie}</Text>
          {item.marca && <Text style={st.sub}>{item.marca}</Text>}
        </View>
        <View style={[st.badge, { backgroundColor: color + '22' }]}>
          <Text style={[st.badgeText, { color }]}>{ESTADO_LABEL[item.estado]}</Text>
        </View>
      </View>
      {puedeMarcar && (
        <View style={st.btnRow}>
          <TouchableOpacity style={st.btnDanger} onPress={() => onMarcar('danado')}>
            <Text style={st.btnDangerText}>Marcar dañada</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.btnDanger} onPress={() => onMarcar('perdido')}>
            <Text style={st.btnDangerText}>Marcar perdida</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function InventarioScreen() {
  const router = useRouter();
  const [onus, setOnus] = useState<Onu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOnus();
      setOnus(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function marcar(item: Onu, estado: 'danado' | 'perdido') {
    alerta(
      `¿Marcar ${item.numero_serie} como ${estado === 'danado' ? 'dañada' : 'perdida'}?`,
      'Esta acción la retira de tu inventario disponible.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', style: 'destructive',
          onPress: async () => {
            try { await marcarOnu(item.id, estado); load(); }
            catch (e: any) { alerta('Error', e.message); }
          },
        },
      ],
    );
  }

  const disponibles = onus.filter(o => o.estado === 'asignado_tecnico').length;
  const instaladas = onus.filter(o => o.estado === 'instalado').length;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.mutedForeground} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={onus}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => <OnuCard item={item} onMarcar={(estado) => marcar(item, estado)} />}
        contentContainerStyle={{ padding: 16, paddingBottom: ESPACIO_BARRA }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.dark} />}
        ListHeaderComponent={
          <View>
            <View style={st.statsRow}>
              <View style={[st.statCard, { borderTopColor: COLORS.dark }]}>
                <Text style={[st.statValue, { color: COLORS.dark }]}>{disponibles}</Text>
                <Text style={st.statLabel}>Disponibles</Text>
              </View>
              <View style={[st.statCard, { borderTopColor: COLORS.success }]}>
                <Text style={[st.statValue, { color: COLORS.success }]}>{instaladas}</Text>
                <Text style={st.statLabel}>Instaladas</Text>
              </View>
            </View>
            <TouchableOpacity style={st.addBtn} onPress={() => router.push('/(tecnico)/escanear-equipo' as any)}>
              <Ionicons name="scan-outline" size={16} color={COLORS.mutedForeground} />
              <Text style={st.addBtnText}>Registrar equipo nuevo</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Ionicons name="cube-outline" size={44} color={COLORS.placeholder} />
            <Text style={{ color: COLORS.mutedForeground, marginTop: 12, fontSize: 15 }}>Sin ONUs asignadas</Text>
          </View>
        }
      />
      <TecnicoNav />
    </View>
  );
}

const st = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  // Naranja: es la accion que se busca al entrar al inventario. El rojo
  // queda para marcar danada o perdida, que es de lo que hay que
  // distinguirlo.
  addBtn: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand, borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
  addBtnText: { color: COLORS.dark, fontWeight: '700', fontSize: 13 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 11, color: COLORS.mutedForeground, marginTop: 2, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  serie: { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  sub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnDanger: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', backgroundColor: COLORS.lighterror, borderWidth: 1, borderColor: COLORS.lighterror },
  btnDangerText: { color: COLORS.error, fontWeight: '700', fontSize: 12 },
});
