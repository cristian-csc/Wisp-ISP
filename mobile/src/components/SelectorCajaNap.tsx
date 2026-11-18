import { useMemo, useState } from 'react';
import {
  View, Text, Modal, TextInput, SectionList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';
import type { CajaNap } from '@/services/api';

const SIN_MUFA = 'Sin mufa asignada';

/**
 * Elegir la caja NAP donde se conecta el cliente.
 *
 * Antes era una tira horizontal con todas las cajas de la zona, una detrás de
 * otra. En Sucasco, que tiene una sola mufa, se veía bien. En una zona con
 * tres mufas son hasta cuarenta y ocho pastillas que hay que arrastrar a
 * ciegas, sin saber cuántas faltan ni de qué mufa cuelga cada una — y el
 * técnico, que está parado delante de una mufa concreta, no tiene forma de
 * reconocer las suyas.
 *
 * Ahora la lista va agrupada por mufa, que es como está tendida la red: el
 * técnico busca primero la mufa que tiene al lado y dentro elige la caja. Se
 * ve de un vistazo cuántos bornes libres le quedan a cada una, y las llenas
 * salen apagadas y no se dejan tocar: enseñar una opción que va a fallar al
 * confirmar es peor que no enseñarla.
 */
export function SelectorCajaNap({
  cajas,
  valor,
  onChange,
}: {
  cajas: CajaNap[];
  valor: number | null;
  onChange: (id: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState('');

  const elegida = cajas.find((c) => c.id === valor) ?? null;

  const secciones = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const visibles = t
      ? cajas.filter(
          (c) =>
            c.codigo.toLowerCase().includes(t) ||
            (c.mufa_codigo ?? '').toLowerCase().includes(t),
        )
      : cajas;

    const grupos = new Map<string, CajaNap[]>();
    for (const c of visibles) {
      const clave = c.mufa_codigo ?? SIN_MUFA;
      const lista = grupos.get(clave);
      if (lista) lista.push(c);
      else grupos.set(clave, [c]);
    }

    return [...grupos.entries()]
      .sort(([a], [b]) => {
        // Las huérfanas al final: son una anomalía del mapeo, no una mufa.
        if (a === SIN_MUFA) return 1;
        if (b === SIN_MUFA) return -1;
        return a.localeCompare(b, 'es', { numeric: true });
      })
      .map(([titulo, data]) => ({
        titulo,
        data: [...data].sort((x, y) =>
          x.codigo.localeCompare(y.codigo, 'es', { numeric: true }),
        ),
      }));
  }, [cajas, busca]);

  function cerrar() {
    setAbierto(false);
    setBusca('');
  }

  const libresDe = (c: CajaNap) => c.bornes.filter((b) => b.estado === 'libre').length;

  return (
    <>
      <TouchableOpacity
        style={[s.campo, elegida && s.campoElegido]}
        onPress={() => setAbierto(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name="cube-outline"
          size={20}
          color={elegida ? COLORS.brandStrong : COLORS.mutedForeground}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.campoTexto, !elegida && s.campoVacio]} numberOfLines={1}>
            {elegida ? elegida.codigo : 'Elegir caja NAP'}
          </Text>
          {elegida && (
            <Text style={s.campoSub} numberOfLines={1}>
              {(elegida.mufa_codigo ?? SIN_MUFA) + ' · ' + libresDe(elegida) + ' ' +
                (libresDe(elegida) === 1 ? 'borne libre' : 'bornes libres')}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color={COLORS.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <View style={s.hoja}>
          <View style={s.cabecera}>
            <Text style={s.titulo}>Caja NAP</Text>
            <TouchableOpacity onPress={cerrar} hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.dark} />
            </TouchableOpacity>
          </View>

          {/* El buscador solo cuando hay bastantes: con dos mufas estorba. */}
          {cajas.length > 8 && (
            <View style={s.buscadorCaja}>
              <Ionicons name="search" size={18} color={COLORS.mutedForeground} />
              <TextInput
                style={s.buscador}
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar caja o mufa…"
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
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ padding: 16, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <View style={s.vacio}>
                <Ionicons name="cube-outline" size={40} color={COLORS.placeholder} />
                <Text style={s.vacioTexto}>
                  {cajas.length === 0
                    ? 'No hay cajas NAP registradas en tu zona.'
                    : 'Ninguna caja o mufa coincide con la búsqueda.'}
                </Text>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <View style={s.grupo}>
                <Ionicons name="git-merge-outline" size={15} color={COLORS.brandStrong} />
                <Text style={s.grupoTexto}>{section.titulo}</Text>
                <Text style={s.grupoConteo}>
                  {section.data.length + (section.data.length === 1 ? ' caja' : ' cajas')}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const libres = libresDe(item);
              const llena = libres === 0;
              const activa = item.id === valor;
              return (
                <TouchableOpacity
                  style={[s.fila, activa && s.filaActiva, llena && s.filaLlena]}
                  disabled={llena}
                  onPress={() => {
                    onChange(item.id);
                    cerrar();
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[s.filaIcono, activa && s.filaIconoActivo]}>
                    <Ionicons
                      name="cube"
                      size={18}
                      color={activa ? COLORS.white : llena ? COLORS.placeholder : COLORS.brandStrong}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.filaNombre, activa && s.filaNombreActivo]}>
                      {item.codigo}
                    </Text>
                    <Text style={[s.filaSub, llena && s.filaSubLlena]}>
                      {llena
                        ? 'Llena — sin bornes libres'
                        : libres + ' de ' + item.bornes.length +
                          (item.bornes.length === 1 ? ' borne libre' : ' bornes libres')}
                    </Text>
                  </View>
                  {activa && <Ionicons name="checkmark-circle" size={22} color={COLORS.brandStrong} />}
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
  filaLlena: { opacity: 0.5 },
  filaIcono: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lightbrand,
  },
  filaIconoActivo: { backgroundColor: COLORS.brandStrong },
  filaNombre: { fontSize: 15.5, fontWeight: '700', color: COLORS.dark },
  filaNombreActivo: { color: COLORS.brandStrong },
  filaSub: { fontSize: 12.5, color: COLORS.mutedForeground, marginTop: 1 },
  filaSubLlena: { color: COLORS.errorText, fontWeight: '600' },

  vacio: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  vacioTexto: {
    marginTop: 12, fontSize: 15, color: COLORS.mutedForeground, textAlign: 'center',
  },
});
