import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getOrdenRetiro, completarOrdenRetiro, subirEvidenciaRetiro,
  getEvidenciasOrdenRetiro, getEvidenciaImageSource,
  OrdenRetiro, Evidencia,
} from '@/services/api';
import { COLORS } from '@/theme/colors';

export default function RetiroDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [orden, setOrden] = useState<OrdenRetiro | null>(null);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [evidenciaSrc, setEvidenciaSrc] = useState<Record<number, { uri: string; headers: Record<string, string> }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [retirarOnu, setRetirarOnu] = useState(true);
  const [roseta, setRoseta] = useState(false);
  const [patchcord, setPatchcord] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);

  // Datos del cliente, editables en la visita. El celular es el que recibe el
  // mensaje de despedida, así que vale la pena confirmarlo en la puerta.
  const [telefono, setTelefono] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [direccion, setDireccion] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const o = await getOrdenRetiro(Number(id));
        setOrden(o);
        setRetirarOnu(!!o.onu_actual);
        setTelefono(o.cliente?.telefono ?? '');
        setWhatsapp(o.cliente?.telefono_whatsapp ?? '');
        setDireccion(o.cliente?.direccion ?? '');
        const ev = await getEvidenciasOrdenRetiro(o.id);
        setEvidencias(ev);
        const srcs = await Promise.all(ev.map((e) => getEvidenciaImageSource(e.id)));
        setEvidenciaSrc(Object.fromEntries(ev.map((e, i) => [e.id, srcs[i]])));
      } catch {
        Alert.alert('Error', 'No se pudo cargar la orden de retiro');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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

  function llamar() {
    if (orden?.cliente?.telefono) Linking.openURL(`tel:${orden.cliente.telefono}`);
  }

  /** El número al que le va a llegar la despedida: el de WhatsApp si lo puso. */
  const numeroAviso = (whatsapp.trim() || telefono.trim()).replace(/\s+/g, '');

  function confirmar() {
    if (!orden) return;
    if (!numeroAviso) {
      Alert.alert(
        'Sin número',
        'El cliente no tiene celular registrado, así que no va a recibir el mensaje de despedida. ¿Completar igual?',
        [
          { text: 'Volver', style: 'cancel' },
          { text: 'Completar igual', onPress: () => void completar() },
        ],
      );
      return;
    }
    Alert.alert(
      'Marcar equipos recogidos',
      `Se cierra el servicio y se le manda el mensaje de despedida al ${numeroAviso}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, completar', onPress: () => void completar() },
      ],
    );
  }

  async function completar() {
    if (!orden) return;
    setSaving(true);
    try {
      const resultado = await completarOrdenRetiro(orden.id, {
        onu_retirada_id: retirarOnu && orden.onu_actual ? orden.onu_actual.id : undefined,
        retiro_roseta: roseta,
        retiro_patchcord: patchcord,
        observaciones: observaciones.trim() || undefined,
        telefono: telefono.trim() || undefined,
        telefono_whatsapp: whatsapp.trim() || undefined,
        direccion: direccion.trim() || undefined,
      });
      for (const uri of fotos) {
        try {
          await subirEvidenciaRetiro(orden.id, uri, 'Evidencia del equipo retirado');
        } catch {
          // La orden ya quedó completada — si una foto falla no se pierde el registro.
        }
      }
      const aviso = resultado.whatsapp_enviado
        ? 'El servicio quedó anulado y al cliente le llegó el mensaje de despedida.'
        : `El servicio quedó anulado, pero el mensaje de despedida no salió: ${resultado.whatsapp_detalle ?? 'motivo desconocido'}. Avísale a la oficina para reenviarlo.`;
      Alert.alert('✓ Equipos recogidos', aviso, [
        { text: 'OK', onPress: () => router.replace('/(tecnico)/retiros') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo completar el retiro');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  if (!orden) return null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.card}>
        <Text style={s.cardTitle}>CLIENTE</Text>
        <Text style={s.clienteNombre}>{orden.cliente?.nombre ?? `#${orden.cliente_id}`}</Text>
        {orden.cliente?.direccion && (
          <View style={s.infoRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.mutedForeground} />
            <Text style={s.infoText}>{orden.cliente.direccion}</Text>
          </View>
        )}
        {orden.cliente?.telefono && (
          <TouchableOpacity style={s.infoRow} onPress={llamar}>
            <Ionicons name="call-outline" size={14} color={COLORS.primary} />
            <Text style={[s.infoText, { color: COLORS.primary, fontWeight: '600' }]}>{orden.cliente.telefono}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>MOTIVO</Text>
        <Text style={s.motivo}>{orden.motivo}</Text>
      </View>

      {orden.estado === 'completado' ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>RETIRO COMPLETADO</Text>
          <Text style={s.motivo}>
            {[
              orden.onu_retirada_id && 'router/ONU',
              orden.retiro_roseta && 'roseta',
              orden.retiro_patchcord && 'patchcord',
            ].filter(Boolean).join(', ') || 'Sin equipo marcado como retirado'}
          </Text>
          {orden.observaciones && <Text style={[s.motivo, { marginTop: 6 }]}>{orden.observaciones}</Text>}
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
          <Text style={s.sectionTitle}>DATOS DEL CLIENTE</Text>
          <Text style={s.hint}>
            Confirma el celular en la puerta: ahí le va a llegar el mensaje de despedida.
          </Text>

          <Text style={s.label}>CELULAR</Text>
          <TextInput
            style={s.input}
            value={telefono}
            onChangeText={setTelefono}
            placeholder="999 999 999"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="phone-pad"
          />

          <Text style={s.label}>WHATSAPP (SI ES OTRO)</Text>
          <TextInput
            style={s.input}
            value={whatsapp}
            onChangeText={setWhatsapp}
            placeholder="Déjalo vacío si es el mismo"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="phone-pad"
          />

          <Text style={s.label}>DIRECCIÓN</Text>
          <TextInput
            style={[s.input, { marginBottom: 6 }]}
            value={direccion}
            onChangeText={setDireccion}
            placeholderTextColor={COLORS.placeholder}
          />
          <View style={s.avisoBox}>
            <Ionicons name="logo-whatsapp" size={15} color={COLORS.success} />
            <Text style={s.avisoText}>
              {numeroAviso
                ? `La despedida se enviará al ${numeroAviso}`
                : 'Sin celular no se le puede enviar la despedida'}
            </Text>
          </View>

          <Text style={s.sectionTitle}>EQUIPO A RECOGER</Text>

          {orden.onu_actual ? (
            <TouchableOpacity style={s.switchRow} onPress={() => setRetirarOnu((v) => !v)}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Router / ONU</Text>
                <Text style={s.switchSub}>{orden.onu_actual.numero_serie}</Text>
              </View>
              <Ionicons name={retirarOnu ? 'checkbox' : 'square-outline'} size={22} color={retirarOnu ? COLORS.primary : COLORS.placeholder} />
            </TouchableOpacity>
          ) : (
            <Text style={s.emptyText}>No hay un router/ONU registrado como instalado para este cliente.</Text>
          )}

          <TouchableOpacity style={s.switchRow} onPress={() => setRoseta((v) => !v)}>
            <Text style={[s.switchLabel, { flex: 1 }]}>Roseta</Text>
            <Ionicons name={roseta ? 'checkbox' : 'square-outline'} size={22} color={roseta ? COLORS.primary : COLORS.placeholder} />
          </TouchableOpacity>

          <TouchableOpacity style={s.switchRow} onPress={() => setPatchcord((v) => !v)}>
            <Text style={[s.switchLabel, { flex: 1 }]}>Patchcord</Text>
            <Ionicons name={patchcord ? 'checkbox' : 'square-outline'} size={22} color={patchcord ? COLORS.primary : COLORS.placeholder} />
          </TouchableOpacity>

          <Text style={s.hint}>El cable drop no se recoge — queda en la vivienda.</Text>

          <Text style={s.label}>OBSERVACIONES (OPCIONAL)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={observaciones}
            onChangeText={setObservaciones}
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

          <TouchableOpacity style={[s.confirmarBtn, saving && { opacity: 0.7 }]} onPress={confirmar} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
                <Text style={s.confirmarText}>Marcar equipos recogidos</Text>
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
  clienteNombre: { fontSize: 16, fontWeight: '800', color: COLORS.dark, marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  infoText: { fontSize: 13, color: '#475569' },
  motivo: { fontSize: 14, color: COLORS.dark, lineHeight: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5, marginBottom: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  switchSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 2 },
  emptyText: { fontSize: 12, color: COLORS.mutedForeground, marginBottom: 10 },
  hint: { fontSize: 11, color: COLORS.mutedForeground, marginBottom: 16, fontStyle: 'italic' },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark },
  textArea: { minHeight: 80, paddingTop: 12, marginBottom: 20 },
  fotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  fotoWrap: { position: 'relative' },
  foto: { width: 72, height: 72, borderRadius: 10, backgroundColor: COLORS.muted },
  fotoQuitar: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  fotoAgregar: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  avisoBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 18 },
  avisoText: { flex: 1, fontSize: 12, color: '#475569' },
  confirmarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
  evidenciaThumb: { width: 90, height: 90, borderRadius: 10, marginRight: 10, backgroundColor: COLORS.muted },
});
