import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes, noInstalarCliente, ClienteListItem } from '@/services/api';
import { TecnicoNav } from '@/components/TecnicoNav';
import { ESPACIO_BARRA } from '@/components/BarraInferior';
import { BotonCuenta } from '@/components/BotonesCabecera';
import { PromptModal } from '@/components/PromptModal';
import { COLORS } from '@/theme/colors';
import { Cabecera, AccionCabecera, Rotulo, UI } from '@/components/Pantalla';
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
          { backgroundColor: item.tipo_conexion === 'inalambrico' ? COLORS.brand : COLORS.dark },
        ]}
      />

      <View style={st.cardCuerpo}>
        <View style={st.cardTop}>
          <View style={st.nombreFila}>
            <Text style={[st.nombre, { flexShrink: 1 }]} numberOfLines={1}>{item.nombre}</Text>
            {item.linea > 1 && (
            <View style={st.lineaChip}>
              <Text style={st.lineaChipText}>L{item.linea}</Text>
            </View>
          )}
          </View>
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

  if (loading) return <ActivityIndicator style={UI.pantalla} color={COLORS.dark} size="large" />;

  return (
    <View style={UI.pantalla}>
      {/* La cabecera va FUERA de la lista: asi se queda fija y solo corre lo
          de abajo. Dentro de ListHeaderComponent se desplazaba con el
          contenido y el tecnico perdia de vista el acceso a Escanear justo
          cuando mas lo usa, con la lista larga. */}
      <Cabecera titulo="Órdenes de hoy" derecha={<BotonCuenta />}>
        <View style={st.heroNumeroFila}>
          <Text style={st.heroValue}>{ordenes.length}</Text>
          <Text style={st.heroUnidad}>
            {ordenes.length === 1 ? 'instalación pendiente' : 'instalaciones pendientes'}
          </Text>
        </View>

        <View style={st.heroActions}>
          <AccionCabecera
            icono="scan"
            texto="Escanear"
            destacada
            onPress={() => router.push('/(tecnico)/escanear-equipo' as any)}
          />
          <AccionCabecera
            icono="cube"
            texto="Mi stock"
            onPress={() => router.push('/(tecnico)/inventario' as any)}
          />
          <AccionCabecera
            icono="map"
            texto="Mapa"
            onPress={() => router.push('/(tecnico)/mapa' as any)}
          />
        </View>
      </Cabecera>

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
        // El relleno de abajo deja ver entera la ultima tarjeta por encima de
        // la barra inferior, que flota sobre la lista.
        contentContainerStyle={{ paddingBottom: ESPACIO_BARRA }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.brand} />}
        ListHeaderComponent={ordenes.length > 0 ? <Rotulo>POR INSTALAR</Rotulo> : null}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 70, paddingHorizontal: 30 }}>
            <Ionicons name="checkmark-circle-outline" size={46} color={COLORS.success} />
            <Text style={st.vacioTitulo}>Sin órdenes pendientes</Text>
            <Text style={st.vacioTexto}>
              Cuando el administrador apruebe una instalación, aparecerá acá.
            </Text>
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
  heroNumeroFila: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 10, marginBottom: 18 },
  // El numero en naranja: es el unico acento de marca de la pantalla, y cae
  // justo donde se mira primero.
  heroValue: { color: COLORS.brand, fontSize: 44, fontWeight: '900', lineHeight: 48 },
  heroUnidad: { color: COLORS.onDark, fontSize: 14, fontWeight: '600', flex: 1 },
  heroActions: { flexDirection: 'row', gap: 9 },

  vacioTitulo: { color: COLORS.dark, marginTop: 14, fontSize: 16, fontWeight: '800' },
  vacioTexto: {
    color: COLORS.mutedForeground, marginTop: 6, fontSize: 13.5,
    textAlign: 'center', lineHeight: 19,
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
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineaChip: { backgroundColor: COLORS.lightbrand, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  lineaChipText: { fontSize: 10, fontWeight: '800', color: COLORS.brand },
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
