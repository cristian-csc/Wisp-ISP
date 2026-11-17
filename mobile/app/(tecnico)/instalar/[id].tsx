import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getCliente, getCajasNap, getOnus, instalarCliente,
  getEvidenciasCliente, subirFotoFachada, subirEvidenciaInstalacion,
  ClienteDetalle, CajaNap, Borne, Onu,
} from '@/services/api';
import { elegirFoto } from '@/services/fotos';
import { COLORS } from '@/theme/colors';
import { alerta } from '@/components/Aviso';

/** La fecha de hace `dias` dias, a medianoche local. */
function haceDias(dias: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(d: Date): string {
  return d.getDate() + ' de ' + MESES[d.getMonth()];
}

/**
 * El dia del mes en que pagara el cliente, con la misma regla que el
 * servidor: del 26 en adelante no hay dia seguro --el 31 no existe en medio
 * anio-- y se pasa al 1.
 */
function diaDePago(d: Date): number {
  return d.getDate() <= 25 ? d.getDate() : 1;
}

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

  const [fotoPowerMeter, setFotoPowerMeter] = useState<string | null>(null);
  const [fotoCajaNap, setFotoCajaNap] = useState<string | null>(null);
  const [fotoRouter, setFotoRouter] = useState<string | null>(null);

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
        alerta('Error', 'No se pudo cargar la información de instalación');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function tomarFotoGenerica(setFoto: (uri: string) => void) {
    const uri = await elegirFoto();
    if (uri) setFoto(uri);
  }

  const tomarFoto = () => tomarFotoGenerica(setFotoUri);

  // Instalar es hoy. Corregirla es cosa del administrador, desde la ficha.
  const fechaActivacion = haceDias(0);

  // Un cliente inalambrico va por antena y PPPoE: no tiene caja NAP, ni
  // borne, ni ONU. Pedirselos no era un requisito mal puesto, era un callejon
  // sin salida -- no hay ningun numero valido que darle -- y por eso no se
  // podia dejar activo.
  const porFibra = cliente?.tipo_conexion !== 'inalambrico';

  const cajaSeleccionada = cajas.find(c => c.id === cajaId) ?? null;
  const bornesLibres: Borne[] = cajaSeleccionada?.bornes.filter(b => b.estado === 'libre') ?? [];

  async function confirmar() {
    if (porFibra && (!cajaId || !borneNum || !onuId)) {
      alerta('Faltan datos', 'Selecciona caja NAP, borne y ONU.');
      return;
    }
    if (!tieneFoto && !fotoUri) {
      alerta('Falta la foto de la fachada', 'Este cliente se registró sin foto — tómala ahora antes de confirmar la instalación.');
      return;
    }
    if (!fotoPowerMeter) {
      alerta('Falta la foto del power meter', 'Toma una foto de la lectura del power meter antes de confirmar.');
      return;
    }
    if (!fotoCajaNap) {
      alerta('Falta la foto de la caja NAP', 'Toma una foto de la caja NAP con el precinto y el puerto usado antes de confirmar.');
      return;
    }
    setSaving(true);
    try {
      await instalarCliente(Number(id), {
        caja_nap_id: porFibra ? cajaId : undefined,
        numero_borne: porFibra ? borneNum : undefined,
        onu_id: porFibra ? onuId : undefined,
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
      try {
        await subirEvidenciaInstalacion(Number(id), fotoPowerMeter, 'Power meter — lectura de potencia óptica');
        await subirEvidenciaInstalacion(Number(id), fotoCajaNap, 'Caja NAP — precinto y puerto usado');
        if (fotoRouter) {
          await subirEvidenciaInstalacion(Number(id), fotoRouter, 'Router instalado');
        }
      } catch {
        // La instalación ya se guardó — las fotos se pueden volver a subir después, no bloquea el flujo.
      }
      alerta('✓ Instalación completada', `${cliente?.nombre} quedó activo.`, [
        { text: 'OK', onPress: () => router.replace('/(tecnico)') },
      ]);
    } catch (e: any) {
      alerta('Error', e.message ?? 'No se pudo completar la instalación');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.mutedForeground} size="large" />;
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
            <Ionicons name="location-outline" size={16} color={COLORS.mutedForeground} />
            <Text style={s.ubicacionBtnText}>Ver ubicación del cliente</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Caja, borne y ONU son de la fibra. Un enlace inalambrico no
          tiene nada de eso, asi que estas tres secciones no se pintan:
          ensenar campos que no se pueden llenar es peor que no tenerlos. */}
      {porFibra && (
        <>
        <Text style={s.sectionTitle}>1. CAJA NAP</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {cajas.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, cajaId === c.id && s.chipActive]}
              onPress={() => { setCajaId(c.id); setBorneNum(null); }}
            >
              <View style={s.chipRow}>
                <Ionicons name="cube-outline" size={14} color={cajaId === c.id ? COLORS.dark : COLORS.mutedForeground} />
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
              <View style={s.leyendaItem}><View style={[s.leyendaDot, { backgroundColor: COLORS.dark }]} /><Text style={s.leyendaText}>Libre</Text></View>
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
                <Ionicons name="hardware-chip-outline" size={14} color={onuId === o.id ? COLORS.dark : COLORS.mutedForeground} />
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
              <Ionicons name={fotoUri ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoUri ? COLORS.success : COLORS.mutedForeground} />
              <Text style={[s.fotoBtnText, fotoUri && { color: COLORS.success }]}>
                {fotoUri ? 'Foto tomada — tocar para repetir' : 'Este cliente no tiene foto — tómala ahora'}
              </Text>
            </TouchableOpacity>
            {fotoUri && <Image source={{ uri: fotoUri }} style={s.fotoPreview} />}
          </>
        )}

        </>
      )}

      {!porFibra && (
        <View style={s.inalambricoAviso}>
          <Ionicons name="wifi" size={20} color={COLORS.brandStrong} />
          <Text style={s.inalambricoTexto}>
            Enlace inalambrico: no lleva caja NAP, borne ni ONU. Solo se
            registra la instalacion y el cliente queda activo.
          </Text>
        </View>
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

      <Text style={s.sectionTitle}>5. EVIDENCIA FOTOGRÁFICA</Text>

      <TouchableOpacity style={[s.fotoBtn, fotoPowerMeter && s.fotoBtnDone]} onPress={() => tomarFotoGenerica(setFotoPowerMeter)}>
        <Ionicons name={fotoPowerMeter ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoPowerMeter ? COLORS.success : COLORS.mutedForeground} />
        <Text style={[s.fotoBtnText, fotoPowerMeter && { color: COLORS.success }]}>
          {fotoPowerMeter ? 'Power meter — tocar para repetir' : 'Foto del power meter (obligatoria)'}
        </Text>
      </TouchableOpacity>
      {fotoPowerMeter && <Image source={{ uri: fotoPowerMeter }} style={s.fotoPreview} />}

      <TouchableOpacity style={[s.fotoBtn, fotoCajaNap && s.fotoBtnDone]} onPress={() => tomarFotoGenerica(setFotoCajaNap)}>
        <Ionicons name={fotoCajaNap ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoCajaNap ? COLORS.success : COLORS.mutedForeground} />
        <Text style={[s.fotoBtnText, fotoCajaNap && { color: COLORS.success }]}>
          {fotoCajaNap ? 'Caja NAP — tocar para repetir' : 'Foto de la caja NAP con precinto y puerto usado (obligatoria)'}
        </Text>
      </TouchableOpacity>
      {fotoCajaNap && <Image source={{ uri: fotoCajaNap }} style={s.fotoPreview} />}

      <TouchableOpacity style={[s.fotoBtn, s.fotoBtnOpcional, fotoRouter && s.fotoBtnDone]} onPress={() => tomarFotoGenerica(setFotoRouter)}>
        <Ionicons name={fotoRouter ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoRouter ? COLORS.success : COLORS.mutedForeground} />
        <Text style={[s.fotoBtnText, { color: fotoRouter ? COLORS.success : COLORS.mutedForeground }]}>
          {fotoRouter ? 'Router — tocar para repetir' : 'Foto del router instalado (opcional)'}
        </Text>
      </TouchableOpacity>
      {fotoRouter && <Image source={{ uri: fotoRouter }} style={s.fotoPreview} />}

      <Text style={s.sectionTitle}>5. FECHAS DEL SERVICIO</Text>
      {/* El tecnico no las elige: instalar es hoy y el servicio queda
          funcionando hoy, que es el caso normal. Las ve para saber que dia le
          va a tocar pagar al cliente y poder decirselo ahi mismo. Si hay que
          corregirlas --un cliente migrado que traia otra fecha, o una
          instalacion que se registra dias despues-- lo hace un administrador
          desde la ficha, donde el cambio queda firmado en el historial. */}
      <View style={s.fechasCaja}>
        <View style={s.fechaFila}>
          <Ionicons name="construct-outline" size={17} color={COLORS.mutedForeground} />
          <Text style={s.fechaEtiqueta}>Instalacion</Text>
          <Text style={s.fechaValor}>{fechaLarga(fechaActivacion)}</Text>
        </View>
        <View style={s.fechaSeparador} />
        <View style={s.fechaFila}>
          <Ionicons name="flash-outline" size={17} color={COLORS.mutedForeground} />
          <Text style={s.fechaEtiqueta}>Activacion</Text>
          <Text style={s.fechaValor}>{fechaLarga(fechaActivacion)}</Text>
        </View>
      </View>
      <View style={s.pagoAviso}>
        <Ionicons name="calendar-outline" size={16} color={COLORS.mutedForeground} />
        <Text style={s.pagoAvisoText}>
          Este cliente pagara los{' '}
          <Text style={s.pagoAvisoFuerte}>{diaDePago(fechaActivacion)}</Text> de cada mes,
          con 3 dias de gracia antes del corte.
        </Text>
      </View>

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
  ubicacionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: COLORS.dark, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  ubicacionBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.dark },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.dark, letterSpacing: 1.5, marginBottom: 10 },
  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.dark, backgroundColor: COLORS.muted },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.mutedForeground },
  chipTextActive: { color: COLORS.dark, fontWeight: '700' },
  emptyText: { fontSize: 12, color: COLORS.mutedForeground, paddingVertical: 10 },
  bornesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  borne: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  borneLibre: { backgroundColor: COLORS.muted, borderColor: COLORS.dark },
  borneOcupado: { backgroundColor: COLORS.lightsuccess, borderColor: COLORS.success },
  borneDanado: { backgroundColor: COLORS.lighterror, borderColor: COLORS.error },
  borneSelected: { backgroundColor: COLORS.dark },
  borneNum: { fontWeight: '800', color: COLORS.dark },
  leyenda: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaDot: { width: 8, height: 8, borderRadius: 4 },
  leyendaText: { fontSize: 11, color: COLORS.mutedForeground, fontWeight: '600' },
  fotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.warning, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: COLORS.lightwarning, marginBottom: 16 },
  fotoBtnOpcional: { borderColor: COLORS.border, backgroundColor: COLORS.card },
  fotoBtnDone: { borderStyle: 'solid', borderColor: COLORS.success, backgroundColor: COLORS.lightsuccess },
  fotoBtnText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.dark },
  fotoPreview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 16, backgroundColor: COLORS.muted },
  row: { flexDirection: 'row', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.mutedForeground, marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark },
  inalambricoAviso: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.lightbrand, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 18,
  },
  inalambricoTexto: { flex: 1, fontSize: 13, color: COLORS.dark, lineHeight: 18 },
  fechasCaja: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    backgroundColor: COLORS.background, marginBottom: 10,
    paddingHorizontal: 14, paddingVertical: 4,
  },
  fechaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  fechaEtiqueta: { flex: 1, fontSize: 14, color: COLORS.mutedForeground, fontWeight: '600' },
  fechaValor: { fontSize: 14, fontWeight: '800', color: COLORS.dark },
  fechaSeparador: { height: 1, backgroundColor: COLORS.border },
  pagoAviso: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.muted, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  pagoAvisoText: { flex: 1, fontSize: 13, color: COLORS.dark },
  pagoAvisoFuerte: { fontWeight: '900', color: COLORS.mutedForeground },
  confirmarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.dark, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  confirmarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
});
