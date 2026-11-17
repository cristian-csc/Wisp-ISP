import { useMemo, useState } from 'react';
import {
  View, Text, Modal, TextInput, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';

export type ZonaOpcion = { id: number; nombre: string; total_clientes?: number };

/**
 * Elegir la zona del cliente.
 *
 * Antes eran pastillas en una tira horizontal. Con cuatro zonas se veían
 * todas; con catorce hay que arrastrar a ciegas, no se sabe cuántas faltan, y
 * la que se busca casi siempre está fuera de la pantalla.
 *
 * Ahora es un campo que abre una lista a pantalla completa con buscador. Se
 * escriben dos letras y aparece la zona — que es como se busca cuando uno ya
 * sabe cuál quiere— y la lista entera queda a la vista para cuando no.
 */
export function SelectorZona({
  zonas,
  valor,
  onChange,
}: {
  zonas: ZonaOpcion[];
  valor: number | null;
  onChange: (id: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState('');

  const elegida = zonas.find((z) => z.id === valor) ?? null;

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return zonas;
    return zonas.filter((z) => z.nombre.toLowerCase().includes(t));
  }, [zonas, busca]);

  function cerrar() {
    setAbierto(false);
    setBusca('');
  }

  return (
    <>
      <TouchableOpacity
        style={[s.campo, elegida && s.campoElegido]}
        onPress={() => setAbierto(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name="location-outline"
          size={20}
          color={elegida ? COLORS.info : COLORS.mutedForeground}
        />
        <Text style={[s.campoTexto, !elegida && s.campoVacio]} numberOfLines={1}>
          {elegida ? elegida.nombre : 'Elegir zona'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <View style={s.hoja}>
          <View style={s.cabecera}>
            <Text style={s.titulo}>Zona del cliente</Text>
            <TouchableOpacity onPress={cerrar} hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.dark} />
            </TouchableOpacity>
          </View>

          {/* El buscador solo cuando hay bastantes: con cinco zonas estorba. */}
          {zonas.length > 6 && (
            <View style={s.buscadorCaja}>
              <Ionicons name="search" size={18} color={COLORS.mutedForeground} />
              <TextInput
                style={s.buscador}
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar zona…"
                placeholderTextColor={COLORS.placeholder}
                autoCorrect={false}
              />
              {busca.length > 0 && (
                <TouchableOpacity onPress={() => setBusca('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={COLORS.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <FlatList
            data={filtradas}
            keyExtractor={(z) => String(z.id)}
            contentContainerStyle={{ padding: 16, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={s.vacio}>
                <Ionicons name="map-outline" size={40} color={COLORS.placeholder} />
                <Text style={s.vacioTexto}>
                  {zonas.length === 0
                    ? 'No hay zonas registradas todavía.'
                    : `Ninguna zona se llama “${busca}”.`}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const activa = item.id === valor;
              return (
                <TouchableOpacity
                  style={[s.fila, activa && s.filaActiva]}
                  onPress={() => {
                    onChange(item.id);
                    cerrar();
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[s.filaIcono, activa && s.filaIconoActivo]}>
                    <Ionicons
                      name="location"
                      size={18}
                      color={activa ? '#fff' : COLORS.info}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.filaNombre, activa && s.filaNombreActivo]}>
                      {item.nombre}
                    </Text>
                    {item.total_clientes != null && (
                      <Text style={s.filaSub}>
                        {item.total_clientes}{' '}
                        {item.total_clientes === 1 ? 'cliente' : 'clientes'}
                      </Text>
                    )}
                  </View>
                  {activa && <Ionicons name="checkmark-circle" size={22} color={COLORS.info} />}
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
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: COLORS.background, marginTop: 6, marginBottom: 12,
  },
  campoElegido: { borderColor: COLORS.info, backgroundColor: COLORS.lightinfo },
  campoTexto: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.dark },
  campoVacio: { fontWeight: '500', color: COLORS.mutedForeground },

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

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10,
    backgroundColor: COLORS.card,
  },
  filaActiva: { borderColor: COLORS.info, backgroundColor: COLORS.lightinfo },
  filaIcono: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lightinfo,
  },
  filaIconoActivo: { backgroundColor: COLORS.info },
  filaNombre: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  filaNombreActivo: { color: COLORS.info },
  filaSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 1 },

  vacio: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  vacioTexto: {
    marginTop: 12, fontSize: 15, color: COLORS.mutedForeground, textAlign: 'center',
  },
});
