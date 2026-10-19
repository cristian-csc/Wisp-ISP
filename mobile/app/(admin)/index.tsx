import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getClientes, getDashboardStats, suspenderCliente, activarCliente, getZonas, ClienteListItem } from '@/services/api';
import { AdminNav } from '@/components/AdminNav';
import { COLORS } from '@/theme/colors';

const AVATAR_COLORS = ['#7C3AED','#0891B2','#059669','#D97706','#DC2626','#BE185D','#6D28D9'];
function avatarColor(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(name: string) { return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function diasRestantes(fecha: string | null) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[st.statCard, { borderTopColor: color }]}>
      <Text style={[st.statValue, { color }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function ClienteCard({ item, onToggle, onPress }: {
  item: ClienteListItem; onToggle: () => void; onPress: () => void;
}) {
  const activo = item.estado === 'activo';
  const dias = diasRestantes(item.fecha_vencimiento);
  const vencidos = item.meses_pago?.filter(m => m.estado === 'vencido').length ?? 0;

  return (
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.75}>
      <View style={st.cardTop}>
        <View style={[st.avatar, { backgroundColor: avatarColor(item.nombre) }]}>
          <Text style={st.avatarText}>{initials(item.nombre)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.nombre} numberOfLines={1}>{item.nombre}</Text>
          <Text style={st.sub}>{item.usuario_pppoe}</Text>
          {item.zona && <Text style={st.zonaTag}>📍 {item.zona.nombre}</Text>}
        </View>
        <View style={[st.badge, activo ? st.badgeGreen : st.badgeRed]}>
          <View style={[st.dot, activo ? st.dotGreen : st.dotRed]} />
          <Text style={[st.badgeText, activo ? { color: '#059669' } : { color: '#DC2626' }]}>
            {activo ? 'Activo' : 'Cortado'}
          </Text>
        </View>
      </View>

      <View style={st.cardBottom}>
        <View style={{ flex: 1 }}>
          <Text style={st.planText}>{item.plan?.nombre ?? '—'}</Text>
          {dias !== null && (
            <Text style={[st.diasText,
              dias < 0 ? { color: COLORS.error } : dias <= 5 ? { color: COLORS.warning } : { color: '#94A3B8' }
            ]}>
              {dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoy' : `Vence en ${dias}d`}
            </Text>
          )}
          {vencidos > 0 && (
            <Text style={st.vencidoTag}>{vencidos} mes{vencidos > 1 ? 'es' : ''} sin pagar</Text>
          )}
        </View>
        <View style={st.btnRow}>
          <TouchableOpacity
            style={[st.actionBtn, activo ? st.btnRed : st.btnGreen]}
            onPress={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <Text style={[st.actionBtnText, activo ? { color: '#DC2626' } : { color: '#059669' }]}>
              {activo ? 'Cortar' : 'Activar'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.actionBtn, st.btnGhost]} onPress={onPress}>
            <Text style={[st.actionBtnText, { color: '#475569' }]}>Ver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminHomeScreen() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteListItem[]>([]);
  const [zonas, setZonas] = useState<{ id: number; nombre: string }[]>([]);
  const [stats, setStats] = useState({ total_clientes: 0, clientes_activos: 0, clientes_suspendidos: 0, ingresos_mes_actual: 0 });
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = search, estado = filtroEstado, zona = zonaId) => {
    try {
      const [data, s, z] = await Promise.all([
        getClientes({ search: q, estado, zona_id: zona ?? undefined }),
        getDashboardStats(),
        getZonas(),
      ]);
      setClientes(data.items);
      setStats(s);
      setZonas(z);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [search, filtroEstado, zonaId]);

  useEffect(() => { load(); }, []);

  function onSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(text, filtroEstado, zonaId), 400);
  }

  function setEstado(e: string) { setFiltroEstado(e); load(search, e, zonaId); }
  function setZona(id: number | null) { setZonaId(id); load(search, filtroEstado, id); }

  async function toggle(item: ClienteListItem) {
    const accion = item.estado === 'activo' ? 'cortar' : 'activar';
    Alert.alert(
      `¿${accion === 'cortar' ? 'Cortar' : 'Activar'} a ${item.nombre}?`, '',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: accion === 'cortar' ? 'Cortar' : 'Activar',
          style: accion === 'cortar' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (item.estado === 'activo') await suspenderCliente(item.id);
              else await activarCliente(item.id);
              load();
            } catch (e: any) { Alert.alert('Error', e.message); }
          },
        },
      ],
    );
  }

  const vencidosSinCortar = clientes.filter(c => {
    const d = diasRestantes(c.fecha_vencimiento);
    return d !== null && d < 0 && c.estado === 'activo';
  });

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={clientes}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <ClienteCard
            item={item}
            onToggle={() => toggle(item)}
            onPress={() => router.push(`/(admin)/cliente/${item.id}`)}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View>
            {/* Stats */}
            <View style={st.statsRow}>
              <StatCard label="Total" value={stats.total_clientes} color={COLORS.info} />
              <StatCard label="Activos" value={stats.clientes_activos} color="#10B981" />
              <StatCard label="Cortados" value={stats.clientes_suspendidos} color="#EF4444" />
            </View>

            {/* Búsqueda */}
            <View style={st.searchWrap}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
              <TextInput
                style={st.searchInput}
                value={search}
                onChangeText={onSearch}
                placeholder="Buscar por nombre, DNI..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />
              {search ? (
                <TouchableOpacity onPress={() => { setSearch(''); load('', filtroEstado, zonaId); }}>
                  <Text style={{ color: '#94A3B8', fontSize: 18, paddingRight: 8 }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filtros estado */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtrosRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {([['', 'Todos'], ['activo', 'Activos'], ['suspendido', 'Cortados']] as const).map(([val, label]) => (
                <TouchableOpacity key={val} style={[st.chip, filtroEstado === val && st.chipActive]} onPress={() => setEstado(val)}>
                  <Text style={[st.chipText, filtroEstado === val && st.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Filtros zona */}
            {zonas.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtrosRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                <TouchableOpacity style={[st.chip, st.chipZona, zonaId === null && st.chipZonaActive]} onPress={() => setZona(null)}>
                  <Text style={[st.chipText, zonaId === null && { color: COLORS.info, fontWeight: '700' }]}>Todas las zonas</Text>
                </TouchableOpacity>
                {zonas.map(z => (
                  <TouchableOpacity key={z.id} style={[st.chip, st.chipZona, zonaId === z.id && st.chipZonaActive]} onPress={() => setZona(z.id)}>
                    <Text style={[st.chipText, zonaId === z.id && { color: COLORS.info, fontWeight: '700' }]}>📍 {z.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Alerta vencidos */}
            {vencidosSinCortar.length > 0 && !filtroEstado && !search && (
              <TouchableOpacity style={st.vencidoAlert} onPress={() => router.replace('/(admin)/atrasados' as any)}>
                <Text style={st.vencidoAlertText}>
                  ⚠  {vencidosSinCortar.length} cliente{vencidosSinCortar.length > 1 ? 's' : ''} con vencimiento sin cortar — ver atrasados →
                </Text>
              </TouchableOpacity>
            )}

            <Text style={st.listaHeader}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 15 }}>Sin resultados</Text>
          </View>
        }
      />
      <AdminNav />
    </View>
  );
}

const st = StyleSheet.create({
  statsRow: { flexDirection: 'row', paddingTop: 14, paddingBottom: 4, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1E293B' },
  filtrosRow: { marginTop: 10, maxHeight: 42 },
  chip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  chipZona: {},
  chipZonaActive: { borderColor: COLORS.info, backgroundColor: COLORS.lightinfo },
  chipText: { color: '#64748B', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: COLORS.primaryEmphasis, fontWeight: '700' },
  vencidoAlert: { marginTop: 10, backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 10, padding: 12 },
  vencidoAlertText: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  listaHeader: { color: '#94A3B8', fontSize: 12, marginTop: 14, marginBottom: 6, letterSpacing: 0.5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  nombre: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  zonaTag: { fontSize: 11, color: COLORS.info, fontWeight: '600', marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.1)' },
  badgeRed: { backgroundColor: 'rgba(239,68,68,0.1)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotGreen: { backgroundColor: '#10B981' },
  dotRed: { backgroundColor: '#EF4444' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  diasText: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  vencidoTag: { fontSize: 11, color: '#EF4444', fontWeight: '700', marginTop: 3 },
  btnRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnRed: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  btnGreen: { backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  btnGhost: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
});
