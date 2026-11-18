import { useMemo, useState } from 'react';
import {
  View, Text, Modal, TextInput, SectionList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';
import type { Onu } from '@/services/api';

const SIN_MARCA = 'Sin marca registrada';

/**
 * Elegir un equipo del inventario.
 *
 * Era una tira horizontal de pastillas, igual que las cajas NAP, y con los
 * equipos duele más todavía: una serie GPON son veinte caracteres, no entran
 * dos en la pantalla, y encontrar la que uno tiene en la mano obliga a
 * arrastrar a ciegas comparando carácter por carácter.
 *
 * Ahora es una lista a pantalla completa con buscador. El técnico teclea los
 * últimos cuatro dígitos de la etiqueta y aparece el equipo — que es como se
 * busca de verdad, porque el principio de la serie lo comparten todos los de
 * la misma marca.
 */
export function SelectorOnu({
  onus,
  valor,
  onChange,
  placeholder = 'Elegir equipo',
  vacio = 'No tienes equipos disponibles en tu inventario.',
}: {
  onus: Onu[];
  valor: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
  vacio?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState('');

  const elegido = onus.find((o) => o.id === valor) ?? null;

  const secciones = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const visibles = t
      ? onus.filter(
          (o) =>
            o.numero_serie.toLowerCase().includes(t) ||
            (o.mac ?? '').toLowerCase().includes(t) ||
            (o.marca ?? '').toLowerCase().includes(t),
        )
      : onus;

    const grupos = new Map<string, Onu[]>();
    for (const o of visibles) {
      const clave = o.marca ?? SIN_MARCA;
      const lista = grupos.get(clave);
      if (lista) lista.push(o);
      else grupos.set(clave, [o]);
    }

    return [...grupos.entries()]
      .sort(([a], [b]) => {
        if (a === SIN_MARCA) return 1;
        if (b === SIN_MARCA) return -1;
        return a.localeCompare(b, 'es');
      })
      .map(([titulo, data]) => ({
        titulo,
        data: [...data].sort((x, y) =>
          x.numero_serie.localeCompare(y.numero_serie, 'es', { numeric: true }),
        ),
      }));
  }, [onus, busca]);

  function cerrar() {
    setAbierto(false);
    setBusca('');
  }

  return (
    <>
      <TouchableOpacity
        style={[s.campo, elegido && s.campoElegido]}
        onPress={() => setAbierto(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name="hardware-chip-outline"
          size={20}
          color={elegido ? COLORS.brandStrong : COLORS.mutedForeground}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.campoTexto, !elegido && s.campoVacio]} numberOfLines={1}>
            {elegido ? elegido.numero_serie : placeholder}
          </Text>
          {elegido && (elegido.marca || elegido.wifi_version) && (
            <Text style={s.campoSub} numberOfLines={1}>
              {[elegido.marca, elegido.wifi_version].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color={COLORS.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <View style={s.hoja}>
          <View style={s.cabecera}>
            <Text style={s.titulo}>Equipo</Text>
            <TouchableOpacity onPress={cerrar} hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.dark} />
            </TouchableOpacity>
          </View>

          {/* Con más de cuatro equipos el buscador ya gana: la serie es larga
              y nadie la reconoce de un vistazo. */}
          {onus.length > 4 && (
            <View style={s.buscadorCaja}>
              <Ionicons name="search" size={18} color={COLORS.mutedForeground} />
              <TextInput
                style={s.buscador}
                value={busca}
                onChangeText={setBusca}
                placeholder="Últimos dígitos de la serie…"
                placeholderTextColor={COLORS.placeholder}
                autoCorrect={false}
                autoCapitalize="characters"
              />
              {busca.length > 0 && (
                <TouchableOpacity onPress={() => setBusca('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={COLORS.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <SectionList
            sections={secciones}
            keyExtractor={(o) => String(o.id)}
            contentContainerStyle={{ padding: 16, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <View style={s.vacio}>
                <Ionicons name="cube-outline" size={40} color={COLORS.placeholder} />
                <Text style={s.vacioTexto}>
                  {onus.length === 0
                    ? vacio
                    : 'Ningún equipo coincide con la búsqueda.'}
                </Text>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <View style={s.grupo}>
                <Ionicons name="pricetag-outline" size={15} color={COLORS.brandStrong} />
                <Text style={s.grupoTexto}>{section.titulo}</Text>
                <Text style={s.grupoConteo}>
                  {section.data.length + (section.data.length === 1 ? ' equipo' : ' equipos')}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const activo = item.id === valor;
              const detalle = [item.marca, item.wifi_version, item.mac]
                .filter(Boolean)
                .join(' · ');
              return (
                <TouchableOpacity
                  style={[s.fila, activo && s.filaActiva]}
                  onPress={() => {
                    onChange(item.id);
                    cerrar();
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[s.filaIcono, activo && s.filaIconoActivo]}>
                    <Ionicons
                      name="hardware-chip"
                      size={18}
                      color={activo ? COLORS.white : COLORS.brandStrong}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.filaNombre, activo && s.filaNombreActivo]}>
                      {item.numero_serie}
                    </Text>
                    {detalle.length > 0 && (
                      <Text style={s.filaSub} numberOfLines={1}>{detalle}</Text>
                    )}
                  </View>
                  {activo && <Ionicons name="checkmark-circle" size={22} color={COLORS.brandStrong} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  campo: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.background, marginTop: 6, marginBottom: 14,
  },
  campoElegido: { borderColor: COLORS.brandStrong, backgroundColor: COLORS.lightbrand },
  campoTexto: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  campoVacio: { fontWeight: '500', color: COLORS.mutedForeground },
  campoSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 1 },

  hoja: { flex: 1, backgroundColor: COLORS.card },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  titulo: { fontSize: 19, fontWeight: '900', color: COLORS.dark },

  buscadorCaja: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, marginBottom: 4, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  buscador: { flex: 1, paddingVertical: 11, fontSize: 15, color: COLORS.dark },

  grupo: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 10, marginBottom: 8, paddingHorizontal: 2,
  },
  grupoTexto: {
    flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 0.8,
    color: COLORS.dark, textTransform: 'uppercase',
  },
  grupoConteo: { fontSize: 11.5, fontWeight: '600', color: COLORS.mutedForeground },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 9,
    backgroundColor: COLORS.card,
  },
  filaActiva: { borderColor: COLORS.brandStrong, backgroundColor: COLORS.lightbrand },
  filaIcono: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lightbrand,
  },
  filaIconoActivo: { backgroundColor: COLORS.brandStrong },
  filaNombre: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  filaNombreActivo: { color: COLORS.brandStrong },
  filaSub: { fontSize: 12.5, color: COLORS.mutedForeground, marginTop: 1 },

  vacio: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  vacioTexto: {
    marginTop: 12, fontSize: 15, color: COLORS.mutedForeground, textAlign: 'center',
  },
});
