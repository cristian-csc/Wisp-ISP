import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { getClientes, noInstalarCliente, ClienteListItem } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { PromptModal } from '@/components/PromptModal';
import { COLORS } from '@/theme/colors';
import { alerta } from '@/components/Aviso';

function OrdenCard({ item, onInstalar, onNoInstalar }: {
  item: ClienteListItem; onInstalar: () => void; onNoInstalar: () => void;
}) {
  return (
    <View style={st.card}>
      {/* Franja de color a la izquierda: se recorre la lista y se ve el tipo
          de enlace sin leer una palabra. */}
      <View
        style={[
          st.franja,
          { backgroundColor: item.tipo_conexion === 'inalambrico' ? COLORS.info : COLORS.primary },
        ]}
      />

      <View style={st.cardCuerpo}>
        <View style={st.cardTop}>
          <Text style={st.nombre} numberOfLines={1}>{item.nombre}</Text>
          <View style={st.badge}>
            <Text style={st.badgeText}>
              {item.tipo_conexion === 'inalambrico' ? 'Inalámbrico' : 'Fibra'}
            </Text>
          </View>
        </View>

        {/* Un icono donde reemplaza a una palabra, no al lado de cada linea:
            la chincheta dice "zona" sin escribirlo. */}
        <View style={st.metaFila}>
          <Ionicons name="location" size={13} color={COLORS.placeholder} />
          <Text style={st.meta} numberOfLines={1}>
            {item.zona?.nombre ?? 'Sin zona'} · {item.plan?.nombre ?? 'Sin plan'}
          </Text>
        </View>
        <View style={st.metaFila}>
          <Ionicons name="call" size={13} color={COLORS.placeholder} />
          <Text style={st.meta} numberOfLines={1}>
            {item.telefono ?? 'Sin teléfono'} · DNI {item.dni ?? '—'}
          </Text>
        </View>

        <View style={st.btnRow}>
          <TouchableOpacity style={st.btnGhost} onPress={onNoInstalar} activeOpacity={0.8}>
            <Text style={st.btnGhostText}>Anular</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.btnPrimary} onPress={onInstalar} activeOpacity={0.85}>
            <Text style={st.btnPrimaryText}>Instalar</Text>
          </TouchableOpacity>
        </View>
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
      alerta('Error', e.message);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* La hora y la bateria van en claro: la cabecera de abajo es oscura. */}
      <StatusBar style="light" />
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
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View>
            {/* Cabecera oscura a sangre, sin margenes: es lo que separa una
                app de un formulario. El numero grande es la respuesta a lo
                unico que el tecnico pregunta al abrir: cuanto me queda hoy. */}
            <View style={st.hero}>
              <Text style={st.heroLabel}>ÓRDENES DE HOY</Text>
              <View style={st.heroNumeroFila}>
                <Text style={st.heroValue}>{ordenes.length}</Text>
                <Text style={st.heroUnidad}>
                  {ordenes.length === 1 ? 'instalación pendiente' : 'instalaciones pendientes'}
                </Text>
              </View>

              <View style={st.heroActions}>
                <TouchableOpacity
                  style={st.heroBtnMarca}
                  onPress={() => router.push('/(tecnico)/escanear-equipo' as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="scan" size={17} color={COLORS.brandForeground} />
                  <Text style={st.heroBtnMarcaText}>Escanear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.heroBtnSuave}
                  onPress={() => router.push('/(tecnico)/inventario' as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cube" size={17} color={COLORS.onDark} />
                  <Text style={st.heroBtnSuaveText}>Mi stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.heroBtnSuave}
                  onPress={() => router.push('/(tecnico)/mapa' as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map" size={17} color={COLORS.onDark} />
                  <Text style={st.heroBtnSuaveText}>Mapa</Text>
                </TouchableOpacity>
              </View>
            </View>

            {ordenes.length > 0 && (
              <Text style={st.listaHeader}>POR INSTALAR</Text>
            )}
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
        title={`¿Por qué se anula la instalación de ${noInstalarTarget?.nombre}?`}
        onCancel={() => setNoInstalarTarget(null)}
        onSubmit={confirmarNoInstalar}
        submitLabel="Confirmar"
      />
    </View>
  );
}

const st = StyleSheet.create({
  // ── Cabecera oscura ────────────────────────────────────────────────────
  hero: {
    backgroundColor: COLORS.surfaceDark,
    paddingHorizontal: 20, paddingTop: 54, paddingBottom: 22,
    borderBottomLeftRadius: 26, borderBottomRightRadius: 26,
    marginBottom: 18,
  },
  heroLabel: {
    color: COLORS.onDarkMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
  },
  heroNumeroFila: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 6, marginBottom: 18 },
  // El numero en naranja: es el unico acento de marca de la pantalla, y cae
  // justo donde se mira primero.
  heroValue: { color: COLORS.brand, fontSize: 44, fontWeight: '900', lineHeight: 48 },
  heroUnidad: { color: COLORS.onDark, fontSize: 14, fontWeight: '600', flex: 1 },

  heroActions: { flexDirection: 'row', gap: 9 },
  heroBtnMarca: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.brand, borderRadius: 14, paddingVertical: 13,
  },
  heroBtnMarcaText: { color: COLORS.brandForeground, fontWeight: '800', fontSize: 12.5 },
  heroBtnSuave: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceDarkSoft, borderRadius: 14, paddingVertical: 13,
  },
  heroBtnSuaveText: { color: COLORS.onDark, fontWeight: '700', fontSize: 12.5 },

  listaHeader: {
    color: COLORS.placeholder, fontSize: 11, fontWeight: '800', letterSpacing: 1.4,
    marginBottom: 10, marginHorizontal: 16,
  },

  // ── Tarjeta ────────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 11, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  franja: { width: 5 },
  cardCuerpo: { flex: 1, padding: 15 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  nombre: { flex: 1, fontSize: 16.5, fontWeight: '800', color: COLORS.dark },
  badge: { backgroundColor: COLORS.muted, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 10.5, color: COLORS.mutedForeground, fontWeight: '800' },
  metaFila: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  meta: { flex: 1, fontSize: 13, color: COLORS.mutedForeground },

  // Botones altos: se usan de pie, con guantes y a pleno sol.
  btnRow: { flexDirection: 'row', gap: 9, marginTop: 11 },
  btnGhost: {
    flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  btnGhostText: { color: COLORS.mutedForeground, fontWeight: '800', fontSize: 13 },
  btnPrimary: {
    flex: 1.4, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.dark,
  },
  btnPrimaryText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});
