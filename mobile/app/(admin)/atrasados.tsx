import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getClientes, suspenderCliente, activarCliente, ClienteListItem } from '@/services/api';
import { AdminNav } from '@/components/AdminNav';
import { ModalPago } from '@/components/ModalPago';
import { COLORS } from '@/theme/colors';

const AVATAR_COLORS = ['#7C3AED','#0891B2','#059669','#D97706','#DC2626','#BE185D','#6D28D9'];
function avatarColor(n: string) { return AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function diasRestantes(f: string | null) {
  if (!f) return null;
  return Math.ceil((new Date(f).getTime() - Date.now()) / 86400000);
}

function urgencyColor(dias: number) {
  if (dias < -14) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#DC2626' };
  if (dias < -7)  return { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: COLORS.error };
  return { bg: COLORS.lightwarning, border: 'rgba(246,181,30,0.3)', text: '#B8860B' };
}

function AtrasadoCard({ item, onCortar, onPago, onPress }: {
  item: ClienteListItem & { dias: number };
  onCortar: () => void; onPago: () => void; onPress: () => void;
}) {
  const urg = urgencyColor(item.dias);
  const mesesSinPagar = item.meses_pago?.filter(m => m.estado === 'vencido').length ?? 0;
  const deuda = mesesSinPagar * (item.plan?.precio ?? 0);
  const esCortado = item.estado === 'suspendido';

  return (
    <TouchableOpacity style={[st.card, { borderLeftColor: urg.text, borderLeftWidth: 4 }]} onPress={onPress} activeOpacity={0.75}>
      <View style={st.cardTop}>
        <View style={[st.avatar, { backgroundColor: avatarColor(item.nombre) }]}>
          <Text style={st.avatarText}>{initials(item.nombre)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.nombre} numberOfLines={1}>{item.nombre}</Text>
          <Text style={st.sub}>{item.usuario_pppoe}</Text>
          {item.zona && <Text style={st.zonaTag}>📍 {item.zona.nombre}</Text>}
        </View>
        {esCortado && (
          <View style={st.cortadoBadge}>
            <Text style={st.cortadoText}>Cortado</Text>
          </View>
        )}
      </View>

      <View style={[st.urgBar, { backgroundColor: urg.bg, borderColor: urg.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.urgText, { color: urg.text }]}>
            Vencido hace {Math.abs(item.dias)} días
          </Text>
          {mesesSinPagar > 0 && (
            <Text style={st.mesesText}>
              {mesesSinPagar} mes{mesesSinPagar > 1 ? 'es' : ''} sin pagar
              {deuda > 0 ? ` · S/ ${deuda.toFixed(0)} en deuda` : ''}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={st.pagoBtn} onPress={(e) => { e.stopPropagation(); onPago(); }}>
            <Text style={st.pagoBtnText}>💰 Pago</Text>
          </TouchableOpacity>
          {!esCortado
            ? <TouchableOpacity style={st.cortarBtn} onPress={(e) => { e.stopPropagation(); onCortar(); }}>
                <Text style={st.cortarText}>Cortar</Text>
              </TouchableOpacity>
            : <TouchableOpacity style={st.activarBtn} onPress={(e) => { e.stopPropagation(); onCortar(); }}>
                <Text style={st.activarText}>Activar</Text>
              </TouchableOpacity>
          }
        </View>
      </View>
    </TouchableOpacity>
  );
}

type PagoModal = { clienteId: number; nombre: string; monto: number } | null;

export default function AtrasadosScreen() {
  const router = useRouter();
  const [todos, setTodos] = useState<(ClienteListItem & { dias: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pagoModal, setPagoModal] = useState<PagoModal>(null);

  const load = useCallback(async () => {
    try {
      const data = await getClientes({ per_page: 100 });
      const atrasados = data.items
        .map(c => ({ ...c, dias: diasRestantes(c.fecha_vencimiento) ?? 0 }))
        .filter(c => c.dias < 0)
        .sort((a, b) => a.dias - b.dias); // más atrasado primero
      setTodos(atrasados);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  async function toggle(item: ClienteListItem) {
    const esSuspendido = item.estado === 'suspendido';
    Alert.alert(
      esSuspendido ? `¿Activar a ${item.nombre}?` : `¿Cortar a ${item.nombre}?`,
      esSuspendido ? 'El servicio se reactivará en el router.' : 'El cliente perderá acceso a internet.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: esSuspendido ? 'Activar' : 'Cortar',
          style: esSuspendido ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (esSuspendido) await activarCliente(item.id);
              else await suspenderCliente(item.id);
              load();
            } catch (e: any) { Alert.alert('Error', e.message); }
          },
        },
      ],
    );
  }

  const activos = todos.filter(c => c.estado === 'activo');
  const cortados = todos.filter(c => c.estado === 'suspendido');

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <FlatList
        data={todos}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <AtrasadoCard
            item={item}
            onCortar={() => toggle(item)}
            onPago={() => setPagoModal({ clienteId: item.id, nombre: item.nombre, monto: item.plan?.precio ?? 0 })}
            onPress={() => router.push(`/(admin)/cliente/${item.id}`)}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
        ListHeaderComponent={
          <View>
            {/* Resumen */}
            <View style={st.resumenRow}>
              <View style={[st.resumenCard, { borderTopColor: '#EF4444' }]}>
                <Text style={[st.resumenNum, { color: '#EF4444' }]}>{todos.length}</Text>
                <Text style={st.resumenLabel}>Atrasados</Text>
              </View>
              <View style={[st.resumenCard, { borderTopColor: COLORS.warning }]}>
                <Text style={[st.resumenNum, { color: COLORS.warning }]}>{activos.length}</Text>
                <Text style={st.resumenLabel}>Sin cortar</Text>
              </View>
              <View style={[st.resumenCard, { borderTopColor: '#94A3B8' }]}>
                <Text style={[st.resumenNum, { color: '#94A3B8' }]}>{cortados.length}</Text>
                <Text style={st.resumenLabel}>Ya cortados</Text>
              </View>
            </View>

            {activos.length > 0 && (
              <View style={st.sectionHeader}>
                <View style={st.sectionDot} />
                <Text style={st.sectionTitle}>Sin cortar · {activos.length}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Text style={{ fontSize: 52 }}>🎉</Text>
            <Text style={{ color: '#10B981', fontSize: 17, fontWeight: '700', marginTop: 14 }}>¡Sin clientes atrasados!</Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 6 }}>Todos los servicios están al día</Text>
          </View>
        }
      />
      <AdminNav />
      {pagoModal && (
        <ModalPago
          visible={!!pagoModal}
          onClose={() => setPagoModal(null)}
          onSuccess={() => { setPagoModal(null); load(); }}
          clienteId={pagoModal.clienteId}
          clienteNombre={pagoModal.nombre}
          montoSugerido={pagoModal.monto}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  resumenRow: { flexDirection: 'row', paddingTop: 14, paddingBottom: 4, gap: 10 },
  resumenCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  resumenNum: { fontSize: 24, fontWeight: '900' },
  resumenLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  nombre: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  zonaTag: { fontSize: 11, color: COLORS.info, fontWeight: '600', marginTop: 2 },
  cortadoBadge: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cortadoText: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  urgBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, borderWidth: 1, gap: 10 },
  urgText: { fontSize: 13, fontWeight: '700' },
  mesesText: { fontSize: 12, color: '#64748B', marginTop: 3 },
  pagoBtn: { backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pagoBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  cortarBtn: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  cortarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  activarBtn: { backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  activarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
