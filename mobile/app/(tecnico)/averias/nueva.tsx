import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getClientes, getZonas, getCajasNap, crearAveria, subirEvidenciaAveria,
  ClienteListItem, CajaNap,
} from '@/services/api';
import { COLORS } from '@/theme/colors';

const MOTIVOS_CLIENTE = ['Cambio de router', 'Conectores', 'Cable drop', 'Patchcord', 'Cambio de roseta'];
const MOTIVOS_PLANTA = ['Sin potencia óptica', 'Caja dañada', 'Corte de troncal'];

export default function NuevaAveriaScreen() {
  const router = useRouter();
  const [tipo, setTipo] = useState<'cliente' | 'planta'>('cliente');

  const [queryCliente, setQueryCliente] = useState('');
  const [resultados, setResultados] = useState<ClienteListItem[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSel, setClienteSel] = useState<ClienteListItem | null>(null);

  const [zonas, setZonas] = useState<{ id: number; nombre: string }[]>([]);
  const [zonaSel, setZonaSel] = useState<number | null>(null);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [cajaSel, setCajaSel] = useState<number | null>(null);

  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getZonas().then(setZonas).catch(() => {});
  }, []);

  useEffect(() => {
    if (tipo !== 'cliente' || !queryCliente.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      getClientes({ search: queryCliente })
        .then((d) => setResultados(d.items.slice(0, 8)))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [queryCliente, tipo]);

  useEffect(() => {
    if (zonaSel) {
      getCajasNap(zonaSel).then(setCajas).catch(() => setCajas([]));
      setCajaSel(null);
    } else {
      setCajas([]);
    }
  }, [zonaSel]);

  async function tomarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Activa el permiso de cámara para tomar la evidencia.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled && result.assets?.[0]) {
      setFotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function quitarFoto(uri: string) {
    setFotos((prev) => prev.filter((f) => f !== uri));
  }

  async function guardar() {
    if (tipo === 'cliente' && !clienteSel) {
      Alert.alert('Falta el cliente', 'Busca y selecciona el cliente afectado.');
      return;
    }
    if (tipo === 'planta' && !cajaSel) {
      Alert.alert('Falta la caja NAP', 'Selecciona la caja NAP afectada.');
      return;
    }
    if (!motivo.trim()) {
      Alert.alert('Falta el motivo', 'Describe el problema.');
      return;
    }
    setSaving(true);
    try {
      const averia = await crearAveria({
        cliente_id: tipo === 'cliente' ? clienteSel!.id : undefined,
        caja_nap_id: tipo === 'planta' ? cajaSel! : undefined,
        motivo_reportado: motivo.trim(),
      });
      for (const uri of fotos) {
        try {
          await subirEvidenciaAveria(averia.id, uri, 'Evidencia del problema');
        } catch {
          // La avería ya se guardó — si una foto falla no se pierde el reporte.
        }
      }
      Alert.alert('✓ Avería reportada', '', [
        { text: 'OK', onPress: () => router.replace('/(tecnico)/averias') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar la avería');
    } finally {
      setSaving(false);
    }
  }

  const motivos = tipo === 'cliente' ? MOTIVOS_CLIENTE : MOTIVOS_PLANTA;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={s.tipoRow}>
          <TouchableOpacity
            style={[s.tipoBtn, tipo === 'cliente' && s.tipoBtnActive]}
            onPress={() => setTipo('cliente')}
          >
            <Ionicons name="person-outline" size={16} color={tipo === 'cliente' ? COLORS.white : COLORS.primary} />
            <Text style={[s.tipoText, tipo === 'cliente' && s.tipoTextActive]}>Cliente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tipoBtn, tipo === 'planta' && s.tipoBtnActive]}
            onPress={() => setTipo('planta')}
          >
            <Ionicons name="git-network-outline" size={16} color={tipo === 'planta' ? COLORS.white : COLORS.primary} />
            <Text style={[s.tipoText, tipo === 'planta' && s.tipoTextActive]}>Planta externa</Text>
          </TouchableOpacity>
        </View>

        {tipo === 'cliente' ? (
          <>
            <Text style={s.label}>CLIENTE AFECTADO</Text>
            {clienteSel ? (
              <View style={s.seleccionado}>
                <View style={{ flex: 1 }}>
                  <Text style={s.seleccionadoNombre}>{clienteSel.nombre}</Text>
                  <Text style={s.seleccionadoSub}>DNI {clienteSel.dni ?? '—'} · {clienteSel.zona?.nombre ?? '—'}</Text>
                </View>
                <TouchableOpacity onPress={() => { setClienteSel(null); setQueryCliente(''); }}>
                  <Ionicons name="close-circle" size={22} color={COLORS.mutedForeground} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={s.input}
                  value={queryCliente}
                  onChangeText={setQueryCliente}
                  placeholder="Buscar por nombre o DNI…"
                  placeholderTextColor={COLORS.placeholder}
                />
                {buscando && <ActivityIndicator style={{ marginTop: 8 }} color={COLORS.primary} />}
                {!buscando && resultados.map((c) => (
                  <TouchableOpacity key={c.id} style={s.resultado} onPress={() => setClienteSel(c)}>
                    <Text style={s.resultadoNombre}>{c.nombre}</Text>
                    <Text style={s.resultadoSub}>DNI {c.dni ?? '—'} · {c.zona?.nombre ?? '—'}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={s.label}>ZONA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {zonas.map((z) => (
                <TouchableOpacity
                  key={z.id}
                  style={[s.chip, zonaSel === z.id && s.chipActive]}
                  onPress={() => setZonaSel(z.id)}
                >
                  <Text style={[s.chipText, zonaSel === z.id && s.chipTextActive]}>{z.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {zonaSel && (
              <>
                <Text style={s.label}>CAJA NAP AFECTADA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {cajas.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.chip, cajaSel === c.id && s.chipActive]}
                      onPress={() => setCajaSel(c.id)}
                    >
                      <Text style={[s.chipText, cajaSel === c.id && s.chipTextActive]}>{c.codigo}</Text>
                    </TouchableOpacity>
                  ))}
                  {cajas.length === 0 && <Text style={s.emptyText}>No hay cajas NAP registradas en esta zona</Text>}
                </ScrollView>
              </>
            )}
          </>
        )}

        <Text style={s.label}>MOTIVO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {motivos.map((m) => (
            <TouchableOpacity
              key={m}
              style={s.motivoChip}
              onPress={() => setMotivo((prev) => (prev ? `${prev}, ${m}` : m))}
            >
              <Text style={s.motivoChipText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={[s.input, s.textArea]}
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Describe el problema"
          placeholderTextColor={COLORS.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Text style={s.label}>EVIDENCIA (FOTOS)</Text>
        <View style={s.fotosRow}>
          {fotos.map((uri) => (
            <View key={uri} style={s.fotoWrap}>
              <Image source={{ uri }} style={s.foto} />
              <TouchableOpacity style={s.fotoQuitar} onPress={() => quitarFoto(uri)}>
                <Ionicons name="close" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={s.fotoAgregar} onPress={tomarFoto}>
            <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.guardarBtn, saving && { opacity: 0.7 }]} onPress={guardar} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
              <Text style={s.guardarText}>Reportar avería</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tipoRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tipoBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12, paddingVertical: 12 },
  tipoBtnActive: { backgroundColor: COLORS.primary },
  tipoText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  tipoTextActive: { color: COLORS.white },

  label: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark },
  textArea: { minHeight: 80, paddingTop: 12, marginBottom: 20 },

  seleccionado: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightsuccess, borderWidth: 1, borderColor: COLORS.success, borderRadius: 12, padding: 12, marginBottom: 20 },
  seleccionadoNombre: { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  seleccionadoSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },

  resultado: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, marginTop: 8 },
  resultadoNombre: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  resultadoSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },

  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: COLORS.primaryEmphasis, fontWeight: '700' },
  emptyText: { fontSize: 12, color: COLORS.mutedForeground, paddingVertical: 10 },

  motivoChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, backgroundColor: COLORS.card },
  motivoChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },

  fotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  fotoWrap: { position: 'relative' },
  foto: { width: 72, height: 72, borderRadius: 10, backgroundColor: COLORS.muted },
  fotoQuitar: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  fotoAgregar: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },

  guardarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  guardarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
});
