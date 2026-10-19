import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Switch, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getAveria, getOnus, resolverAveria, getEvidenciasAveria, subirEvidenciaAveria,
  getEvidenciaImageSource, Averia, Onu, Evidencia,
} from '@/services/api';
import { COLORS } from '@/theme/colors';

export default function AveriaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [averia, setAveria] = useState<Averia | null>(null);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [evidenciaSrc, setEvidenciaSrc] = useState<Record<number, { uri: string; headers: Record<string, string> }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [diagnostico, setDiagnostico] = useState('');
  const [potencia, setPotencia] = useState('');
  const [cambiarOnu, setCambiarOnu] = useState(false);
  const [onuViejaId, setOnuViejaId] = useState<number | null>(null);
  const [onuNuevaId, setOnuNuevaId] = useState<number | null>(null);
  const [fotosSolucion, setFotosSolucion] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [a, o, ev] = await Promise.all([getAveria(Number(id)), getOnus(), getEvidenciasAveria(Number(id))]);
        setAveria(a);
        setOnus(o);
        setEvidencias(ev);
        const srcs = await Promise.all(ev.map((e) => getEvidenciaImageSource(e.id)));
        setEvidenciaSrc(Object.fromEntries(ev.map((e, i) => [e.id, srcs[i]])));
      } catch {
        Alert.alert('Error', 'No se pudo cargar la avería');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function tomarFotoSolucion() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Activa el permiso de cámara para tomar la evidencia.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled && result.assets?.[0]) {
      setFotosSolucion((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function quitarFotoSolucion(uri: string) {
    setFotosSolucion((prev) => prev.filter((f) => f !== uri));
  }

  const onuInstaladaEnCliente = onus.filter(o => o.estado === 'instalado' && o.cliente_id === averia?.cliente_id);
  const onusDisponibles = onus.filter(o => o.estado === 'asignado_tecnico');

  async function confirmar() {
    if (!diagnostico.trim()) {
      Alert.alert('Falta el diagnóstico', 'Describe lo que realmente se hizo para resolver la avería.');
      return;
    }
    setSaving(true);
    try {
      await resolverAveria(Number(id), {
        diagnostico_solucion: diagnostico.trim(),
        potencia_optica_dbm: potencia ? Number(potencia) : undefined,
        onu_reemplazada_id: cambiarOnu && onuViejaId ? onuViejaId : undefined,
        onu_nueva_id: cambiarOnu && onuNuevaId ? onuNuevaId : undefined,
      });
      for (const uri of fotosSolucion) {
        try {
          await subirEvidenciaAveria(Number(id), uri, 'Evidencia de la solución');
        } catch {
          // La avería ya quedó resuelta — si una foto falla no se pierde el registro.
        }
      }
      Alert.alert('✓ Avería resuelta', '', [{ text: 'OK', onPress: () => router.replace('/(tecnico)/averias') }]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo resolver la avería');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  if (!averia) return null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.card}>
        <Text style={s.cardTitle}>MOTIVO REPORTADO</Text>
        <Text style={s.motivo}>{averia.motivo_reportado}</Text>
      </View>

      {averia.estado === 'resuelta' ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>SOLUCIÓN</Text>
          <Text style={s.motivo}>{averia.diagnostico_solucion}</Text>
          {evidencias.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {evidencias.map((ev) => evidenciaSrc[ev.id] && (
                <Image key={ev.id} source={evidenciaSrc[ev.id]} style={s.evidenciaThumb} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <>
          <Text style={s.sectionTitle}>DIAGNÓSTICO Y SOLUCIÓN</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={diagnostico}
            onChangeText={setDiagnostico}
            placeholder="¿Qué causó la avería y qué se hizo para resolverla? (puede ser distinto de lo reportado)"
            placeholderTextColor={COLORS.placeholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <Text style={s.label}>Potencia óptica (dBm)</Text>
          <TextInput
            style={s.input}
            value={potencia}
            onChangeText={setPotencia}
            placeholder="-18.5"
            keyboardType="numbers-and-punctuation"
            placeholderTextColor={COLORS.placeholder}
          />

          <View style={s.switchRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.dark} />
              <Text style={s.switchLabel}>Se cambió la ONU</Text>
            </View>
            <Switch
              value={cambiarOnu}
              onValueChange={setCambiarOnu}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
              thumbColor={COLORS.white}
            />
          </View>

          {cambiarOnu && (
            <>
              <Text style={s.label}>ONU retirada (dañada)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {onuInstaladaEnCliente.map(o => (
                  <TouchableOpacity key={o.id} style={[s.chip, onuViejaId === o.id && s.chipActive]} onPress={() => setOnuViejaId(o.id)}>
                    <Text style={[s.chipText, onuViejaId === o.id && s.chipTextActive]}>{o.numero_serie}</Text>
                  </TouchableOpacity>
                ))}
                {onuInstaladaEnCliente.length === 0 && <Text style={s.emptyText}>No hay ONU instalada registrada para este cliente</Text>}
              </ScrollView>

              <Text style={s.label}>ONU nueva (de tu inventario)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {onusDisponibles.map(o => (
                  <TouchableOpacity key={o.id} style={[s.chip, onuNuevaId === o.id && s.chipActive]} onPress={() => setOnuNuevaId(o.id)}>
                    <Text style={[s.chipText, onuNuevaId === o.id && s.chipTextActive]}>{o.numero_serie}</Text>
                  </TouchableOpacity>
                ))}
                {onusDisponibles.length === 0 && <Text style={s.emptyText}>No tienes ONUs disponibles en tu inventario</Text>}
              </ScrollView>
            </>
          )}

          <Text style={s.label}>EVIDENCIA DE LA SOLUCIÓN</Text>
          <View style={s.fotosRow}>
            {fotosSolucion.map((uri) => (
              <View key={uri} style={s.fotoWrap}>
                <Image source={{ uri }} style={s.foto} />
                <TouchableOpacity style={s.fotoQuitar} onPress={() => quitarFotoSolucion(uri)}>
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.fotoAgregar} onPress={tomarFotoSolucion}>
              <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[s.confirmarBtn, saving && { opacity: 0.7 }]} onPress={confirmar} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
                <Text style={s.confirmarText}>Resolver avería</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: COLORS.mutedForeground, letterSpacing: 2, marginBottom: 8 },
  motivo: { fontSize: 14, color: COLORS.dark, lineHeight: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark, marginBottom: 14 },
  textArea: { minHeight: 90, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: COLORS.primaryEmphasis, fontWeight: '700' },
  emptyText: { fontSize: 12, color: COLORS.mutedForeground, paddingVertical: 10 },
  confirmarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
  fotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  fotoWrap: { position: 'relative' },
  foto: { width: 72, height: 72, borderRadius: 10, backgroundColor: COLORS.muted },
  fotoQuitar: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  fotoAgregar: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  evidenciaThumb: { width: 90, height: 90, borderRadius: 10, marginRight: 10, backgroundColor: COLORS.muted },
});
