import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUnidades, registrarRecargaCombustible, type UnidadMovil } from '@/services/api';
import { elegirFoto } from '@/services/fotos';
import { alerta } from '@/components/Aviso';
import { COLORS } from '@/theme/colors';
import { UI } from '@/components/Pantalla';

/** Formulario de carga de combustible, compartido por técnico y vendedora:
 *  elige la unidad, pone el monto y toma la foto del surtidor y de la boleta. */
export function CombustibleForm() {
  const router = useRouter();
  const [unidades, setUnidades] = useState<UnidadMovil[]>([]);
  const [cargando, setCargando] = useState(true);

  const [unidadId, setUnidadId] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [fotoSurtidor, setFotoSurtidor] = useState<string | null>(null);
  const [fotoBoleta, setFotoBoleta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getUnidades()
      .then((u) => {
        setUnidades(u);
        if (u.length === 1) setUnidadId(u[0].id); // una sola unidad: ya queda elegida
      })
      .catch(() => alerta('Error', 'No se pudieron cargar las unidades.'))
      .finally(() => setCargando(false));
  }, []);

  async function tomar(cual: 'surtidor' | 'boleta') {
    const uri = await elegirFoto(cual === 'surtidor' ? 'Foto del surtidor' : 'Foto de la boleta');
    if (uri) (cual === 'surtidor' ? setFotoSurtidor : setFotoBoleta)(uri);
  }

  async function enviar() {
    const valor = parseFloat(monto.replace(',', '.'));
    if (!unidadId) return alerta('Falta la unidad', 'Elige el vehículo que cargaste.');
    if (!valor || valor <= 0) return alerta('Monto inválido', 'Escribe cuánto pagaste.');
    if (!fotoSurtidor) return alerta('Falta una foto', 'Toma la foto del surtidor.');
    if (!fotoBoleta) return alerta('Falta una foto', 'Toma la foto de la boleta o factura.');

    setEnviando(true);
    try {
      await registrarRecargaCombustible({
        unidadId,
        monto: valor,
        fotoSurtidorUri: fotoSurtidor,
        fotoBoletaUri: fotoBoleta,
      });
      alerta('Listo', 'La recarga quedó registrada.', [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      alerta('No se pudo registrar', e.message ?? 'Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <ActivityIndicator style={UI.pantalla} color={COLORS.dark} size="large" />;
  }

  if (unidades.length === 0) {
    return (
      <View style={[UI.pantalla, s.vacio]}>
        <Ionicons name="bus-outline" size={46} color={COLORS.placeholder} />
        <Text style={s.vacioTitulo}>No hay unidades registradas</Text>
        <Text style={s.vacioTexto}>
          Pídele al administrador que registre el vehículo en el sistema para poder cargar combustible.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={UI.pantalla} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Unidad */}
      <Text style={UI.etiqueta}>¿QUÉ UNIDAD CARGASTE?</Text>
      <View style={s.unidades}>
        {unidades.map((u) => {
          const activa = unidadId === u.id;
          return (
            <TouchableOpacity
              key={u.id}
              style={[s.unidad, activa && s.unidadActiva]}
              onPress={() => setUnidadId(u.id)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={activa ? 'checkmark-circle' : 'bus-outline'}
                size={20}
                color={activa ? COLORS.brand : COLORS.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.unidadPlaca, activa && { color: COLORS.dark }]}>{u.placa}</Text>
                {(u.marca || u.modelo) && (
                  <Text style={s.unidadMarca}>{[u.marca, u.modelo].filter(Boolean).join(' · ')}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Monto */}
      <Text style={[UI.etiqueta, { marginTop: 18 }]}>MONTO PAGADO (S/)</Text>
      <TextInput
        style={UI.campo}
        value={monto}
        onChangeText={setMonto}
        placeholder="Ej. 50.00"
        placeholderTextColor={COLORS.placeholder}
        keyboardType="decimal-pad"
        maxLength={9}
      />

      {/* Fotos */}
      <Text style={[UI.etiqueta, { marginTop: 18 }]}>FOTOS</Text>
      <View style={s.fotos}>
        <BotonFoto etiqueta="Surtidor" uri={fotoSurtidor} onPress={() => tomar('surtidor')} />
        <BotonFoto etiqueta="Boleta / factura" uri={fotoBoleta} onPress={() => tomar('boleta')} />
      </View>

      <TouchableOpacity
        style={[UI.botonMarca, { marginTop: 24 }, enviando && { opacity: 0.6 }]}
        onPress={enviar}
        disabled={enviando}
        activeOpacity={0.85}
      >
        {enviando ? (
          <ActivityIndicator color={COLORS.brandForeground} />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color={COLORS.brandForeground} />
            <Text style={UI.botonMarcaTexto}>Registrar recarga</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function BotonFoto({ etiqueta, uri, onPress }: { etiqueta: string; uri: string | null; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.foto} onPress={onPress} activeOpacity={0.85}>
      {uri ? (
        <>
          <Image source={{ uri }} style={s.fotoImg} />
          <View style={s.fotoHecha}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={s.fotoHechaText}>Tomada · tocar para cambiar</Text>
          </View>
        </>
      ) : (
        <View style={s.fotoVacia}>
          <Ionicons name="camera-outline" size={26} color={COLORS.mutedForeground} />
          <Text style={s.fotoEtiqueta}>{etiqueta}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  vacio: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  vacioTitulo: { color: COLORS.dark, marginTop: 14, fontSize: 16, fontWeight: '800' },
  vacioTexto: { color: COLORS.mutedForeground, marginTop: 6, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },

  unidades: { gap: 9 },
  unidad: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  unidadActiva: { borderColor: COLORS.brand, backgroundColor: COLORS.lightbrand },
  unidadPlaca: { fontSize: 16, fontWeight: '800', color: COLORS.mutedForeground, letterSpacing: 0.5 },
  unidadMarca: { fontSize: 12.5, color: COLORS.mutedForeground, marginTop: 1 },

  fotos: { flexDirection: 'row', gap: 12 },
  foto: {
    flex: 1, height: 148, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  fotoVacia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  fotoEtiqueta: { fontSize: 13, fontWeight: '700', color: COLORS.mutedForeground },
  fotoImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  fotoHecha: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 6,
  },
  fotoHechaText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
});
