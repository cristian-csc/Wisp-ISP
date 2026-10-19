import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getCliente, getCajasNap, getOnus, instalarCliente,
  getEvidenciasCliente, subirFotoFachada,
  ClienteDetalle, CajaNap, Borne, Onu,
} from '@/services/api';
import { COLORS } from '@/theme/colors';

export default function InstalarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();

  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cajaId, setCajaId] = useState<number | null>(null);
  const [borneNum, setBorneNum] = useState<number | null>(null);
  const [onuId, setOnuId] = useState<number | null>(null);
  const [metros, setMetros] = useState('');
  const [potencia, setPotencia] = useState('');
  const [precinto, setPrecinto] = useState('');

  const [tieneFoto, setTieneFoto] = useState(true);
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, cj, o, evidencias] = await Promise.all([
          getCliente(Number(id)),
          getCajasNap(),
          getOnus({ estado: 'asignado_tecnico' }),
          getEvidenciasCliente(Number(id)).catch(() => []),
        ]);
        setCliente(c);
        navigation.setOptions({ title: `Instalar: ${c.nombre}` });
        const enSuZona = cj.filter(x => x.zona_id === c.zona?.id);
        setCajas(enSuZona.length ? enSuZona : cj);
        setOnus(o);
        setTieneFoto(evidencias.length > 0);
      } catch {
        Alert.alert('Error', 'No se pudo cargar la información de instalación');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function tomarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Activa el permiso de cámara para tomar la foto de la fachada.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled && result.assets?.[0]) {
      setFotoUri(result.assets[0].uri);
    }
  }

  const cajaSeleccionada = cajas.find(c => c.id === cajaId) ?? null;
  const bornesLibres: Borne[] = cajaSeleccionada?.bornes.filter(b => b.estado === 'libre') ?? [];

  async function confirmar() {
    if (!cajaId || !borneNum || !onuId) {
      Alert.alert('Faltan datos', 'Selecciona caja NAP, borne y ONU.');
      return;
    }
    if (!tieneFoto && !fotoUri) {
      Alert.alert('Falta la foto de la fachada', 'Este cliente se registró sin foto — tómala ahora antes de confirmar la instalación.');
      return;
    }
    setSaving(true);
    try {
      await instalarCliente(Number(id), {
        caja_nap_id: cajaId,
        numero_borne: borneNum,
        onu_id: onuId,
        metros_cable: metros ? Number(metros) : undefined,
        potencia_optica_dbm: potencia ? Number(potencia) : undefined,
        codigo_precinto: precinto.trim() || undefined,
      });
      if (!tieneFoto && fotoUri) {
        try {
          await subirFotoFachada(Number(id), fotoUri, 'Fachada de la vivienda (instalación)');
        } catch {
          // La instalación ya se guardó — la foto se puede reintentar después, no bloquea el flujo.
        }
      }
      Alert.alert('✓ Instalación completada', `${cliente?.nombre} quedó activo.`, [
        { text: 'OK', onPress: () => router.replace('/(tecnico)') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo completar la instalación');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  if (!cliente) return null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.infoCard}>
        <Text style={s.infoNombre}>{cliente.nombre}</Text>
        <Text style={s.infoSub}>{cliente.direccion ?? 'Sin dirección'}</Text>
        <Text style={s.infoSub}>Plan: {cliente.plan?.nombre ?? '—'} · Zona: {cliente.zona?.nombre ?? '—'}</Text>
        {cliente.lat != null && cliente.lng != null && (
          <TouchableOpacity
            style={s.ubicacionBtn}
            onPress={() => router.push({
              pathname: '/(tecnico)/mapa',
              params: { clienteLat: String(cliente.lat), clienteLng: String(cliente.lng), clienteNombre: cliente.nombre },
            })}
          >
            <Ionicons name="location-outline" size={16} color={COLORS.primary} />
            <Text style={s.ubicacionBtnText}>Ver ubicación del cliente</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={s.sectionTitle}>1. CAJA NAP</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {cajas.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[s.chip, cajaId === c.id && s.chipActive]}
            onPress={() => { setCajaId(c.id); setBorneNum(null); }}
          >
            <View style={s.chipRow}>
              <Ionicons name="cube-outline" size={14} color={cajaId === c.id ? COLORS.primaryEmphasis : '#64748B'} />
              <Text style={[s.chipText, cajaId === c.id && s.chipTextActive]}>{c.codigo}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {cajas.length === 0 && <Text style={s.emptyText}>No hay cajas NAP registradas en tu zona</Text>}
      </ScrollView>

      {cajaSeleccionada && (
        <>
          <Text style={s.sectionTitle}>2. BORNE LIBRE</Text>
          <View style={s.bornesGrid}>
            {cajaSeleccionada.bornes.map(b => (
              <TouchableOpacity
                key={b.id}
                disabled={b.estado !== 'libre'}
                style={[
                  s.borne,
                  b.estado === 'libre' && s.borneLibre,
                  b.estado === 'ocupado' && s.borneOcupado,
                  b.estado === 'danado' && s.borneDanado,
                  borneNum === b.numero && s.borneSelected,
                ]}
                onPress={() => setBorneNum(b.numero)}
              >
                <Text style={[s.borneNum, borneNum === b.numero && { color: COLORS.white }]}>{b.numero}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.leyenda}>
            <View style={s.leyendaItem}><View style={[s.leyendaDot, { backgroundColor: COLORS.primary }]} /><Text style={s.leyendaText}>Libre</Text></View>
            <View style={s.leyendaItem}><View style={[s.leyendaDot, { backgroundColor: COLORS.success }]} /><Text style={s.leyendaText}>Ocupado</Text></View>
            <View style={s.leyendaItem}><View style={[s.leyendaDot, { backgroundColor: COLORS.error }]} /><Text style={s.leyendaText}>Dañado</Text></View>
          </View>
        </>
      )}

      <Text style={s.sectionTitle}>3. ONU (de tu inventario)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {onus.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[s.chip, onuId === o.id && s.chipActive]}
            onPress={() => setOnuId(o.id)}
          >
            <View style={s.chipRow}>
              <Ionicons name="hardware-chip-outline" size={14} color={onuId === o.id ? COLORS.primaryEmphasis : '#64748B'} />
              <Text style={[s.chipText, onuId === o.id && s.chipTextActive]}>{o.numero_serie}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {onus.length === 0 && <Text style={s.emptyText}>No tienes ONUs asignadas — pide al admin que te entregue una</Text>}
      </ScrollView>

      {!tieneFoto && (
        <>
          <Text style={s.sectionTitle}>FOTO DE LA FACHADA (FALTA)</Text>
          <TouchableOpacity style={[s.fotoBtn, fotoUri && s.fotoBtnDone]} onPress={tomarFoto}>
            <Ionicons name={fotoUri ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoUri ? COLORS.success : COLORS.primary} />
            <Text style={[s.fotoBtnText, fotoUri && { color: COLORS.success }]}>
              {fotoUri ? 'Foto tomada — tocar para repetir' : 'Este cliente no tiene foto — tómala ahora'}
            </Text>
          </TouchableOpacity>
          {fotoUri && <Image source={{ uri: fotoUri }} style={s.fotoPreview} />}
        </>
      )}

      <Text style={s.sectionTitle}>4. DATOS TÉCNICOS</Text>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Metros de cable</Text>
          <TextInput style={s.input} value={metros} onChangeText={setMetros} placeholder="0" keyboardType="numeric" placeholderTextColor={COLORS.placeholder} />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Potencia óptica (dBm)</Text>
          <TextInput style={s.input} value={potencia} onChangeText={setPotencia} placeholder="-18.5" keyboardType="numbers-and-punctuation" placeholderTextColor={COLORS.placeholder} />
        </View>
      </View>

      <Text style={s.label}>Código de precinto</Text>
      <TextInput
        style={[s.input, { marginBottom: 20 }]}
        value={precinto}
        onChangeText={setPrecinto}
        autoCapitalize="characters"
        placeholderTextColor={COLORS.placeholder}
      />

      <TouchableOpacity style={[s.confirmarBtn, saving && { opacity: 0.7 }]} onPress={confirmar} disabled={saving}>
        {saving ? <ActivityIndicator color={COLORS.white} /> : (
          <>
            <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
            <Text style={s.confirmarText}>Confirmar instalación</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  infoCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 18 },
  infoNombre: { fontSize: 16, fontWeight: '800', color: COLORS.dark },
  infoSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 3 },
  ubicacionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  ubicacionBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5, marginBottom: 10 },
  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: COLORS.primaryEmphasis, fontWeight: '700' },
  emptyText: { fontSize: 12, color: COLORS.mutedForeground, paddingVertical: 10 },
  bornesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  borne: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  borneLibre: { backgroundColor: COLORS.lightprimary, borderColor: COLORS.primary },
  borneOcupado: { backgroundColor: COLORS.lightsuccess, borderColor: COLORS.success },
  borneDanado: { backgroundColor: COLORS.lighterror, borderColor: COLORS.error },
  borneSelected: { backgroundColor: COLORS.primary },
  borneNum: { fontWeight: '800', color: COLORS.dark },
  leyenda: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaDot: { width: 8, height: 8, borderRadius: 4 },
  leyendaText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
  fotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.warning, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: COLORS.lightwarning, marginBottom: 16 },
  fotoBtnDone: { borderStyle: 'solid', borderColor: COLORS.success, backgroundColor: COLORS.lightsuccess },
  fotoBtnText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.primary },
  fotoPreview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 16, backgroundColor: COLORS.muted },
  row: { flexDirection: 'row', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark },
  confirmarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
});
