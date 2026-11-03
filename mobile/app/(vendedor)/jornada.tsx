import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getZonas } from '@/services/api';
import { useJornada } from '@/hooks/useJornada';
import { VendedorNav } from '@/components/VendedorNav';
import { COLORS } from '@/theme/colors';

function tiempoActivo(iniciadoEn: string): string {
  const ms = Date.now() - new Date(iniciadoEn).getTime();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  if (horas < 1) return `${minutos} min`;
  return `${horas} h ${minutos} min`;
}

function horaInicio(iniciadoEn: string): string {
  return new Date(iniciadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function JornadaScreen() {
  const { jornada, loading, iniciar, finalizar, reportarReclamo } = useJornada();
  const [zonas, setZonas] = useState<{ id: number; nombre: string }[]>([]);
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [, forceTick] = useState(0);

  const [modalReclamoVisible, setModalReclamoVisible] = useState(false);
  const [montoReclamo, setMontoReclamo] = useState('');
  const [notaReclamo, setNotaReclamo] = useState('');
  const [guardandoReclamo, setGuardandoReclamo] = useState(false);

  useEffect(() => { getZonas().then(setZonas).catch(() => {}); }, []);

  useEffect(() => {
    if (jornada?.estado !== 'activa') return;
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [jornada?.estado]);

  async function handleIniciar() {
    setProcesando(true);
    try {
      await iniciar(zonaId);
    } catch (e: any) {
      Alert.alert('No se pudo iniciar', e.message ?? 'Intenta de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  function handleFinalizar() {
    Alert.alert('Finalizar jornada', '¿Seguro que terminaste tu salida a campo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar', style: 'destructive', onPress: async () => {
          setProcesando(true);
          try {
            await finalizar();
          } catch (e: any) {
            Alert.alert('No se pudo finalizar', e.message ?? 'Intenta de nuevo.');
          } finally {
            setProcesando(false);
          }
        },
      },
    ]);
  }

  const activa = jornada?.estado === 'activa';

  function abrirReclamo() {
    setMontoReclamo(jornada?.monto_reclamado != null ? String(jornada.monto_reclamado) : '');
    setNotaReclamo(jornada?.nota_reclamo ?? '');
    setModalReclamoVisible(true);
  }

  async function handleGuardarReclamo() {
    const monto = Number(montoReclamo);
    if (!montoReclamo.trim() || Number.isNaN(monto) || monto <= 0) {
      Alert.alert('Monto inválido', 'Ingresa cuánto gastaste de tu bolsillo.');
      return;
    }
    setGuardandoReclamo(true);
    try {
      await reportarReclamo(monto, notaReclamo.trim() || undefined);
      setModalReclamoVisible(false);
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardandoReclamo(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={[s.hero, activa && s.heroActiva]}>
        <View style={s.heroIconWrap}>
          <Ionicons name={activa ? 'navigate' : 'walk'} size={30} color={COLORS.white} />
        </View>
        <Text style={s.heroTitle}>{activa ? 'Jornada en curso' : 'Salida a campo'}</Text>
        <Text style={s.heroSub}>
          {activa
            ? 'Tu administrador puede ver que estás en ruta y seguir tu recorrido.'
            : 'Inicia tu jornada para que tu administrador sepa que estás en ruta.'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
      ) : activa && jornada ? (
        <View style={s.card}>
          <View style={s.estadoRow}>
            <View style={s.pulseDot} />
            <Text style={s.estadoText}>En ruta</Text>
          </View>

          <View style={s.infoRow}>
            <Ionicons name="time-outline" size={16} color={COLORS.primary} />
            <Text style={s.infoText}>Desde las {horaInicio(jornada.iniciado_en)} · {tiempoActivo(jornada.iniciado_en)}</Text>
          </View>
          {jornada.zona && (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.primary} />
              <Text style={s.infoText}>Zona: {jornada.zona.nombre}</Text>
            </View>
          )}

          <Text style={s.hint}>Tu ubicación se guarda cada 5 min para que tu administrador vea tu recorrido en el sistema.</Text>

          {jornada.monto_pasaje != null ? (
            // Ya hay un pasaje registrado para hoy — ya sea porque el admin lo
            // puso directamente desde la web, o porque ya le reintegraron un
            // reclamo anterior. En ambos casos no tiene nada que reportar.
            <View style={[s.reclamoBadge, s.reclamoBadgeOk]}>
              <Ionicons name="checkmark-circle" size={15} color="#059669" />
              <Text style={[s.reclamoBadgeText, { color: '#059669' }]}>
                {jornada.reclamo_reintegrado
                  ? `Pasaje reintegrado — S/ ${jornada.monto_pasaje.toFixed(2)}`
                  : `Pasaje de hoy registrado — S/ ${jornada.monto_pasaje.toFixed(2)}`}
              </Text>
            </View>
          ) : jornada.monto_reclamado == null ? (
            <TouchableOpacity style={s.reclamoLink} onPress={abrirReclamo}>
              <Ionicons name="wallet-outline" size={15} color={COLORS.warning} />
              <Text style={s.reclamoLinkText}>¿No te dieron pasaje? Reporta tu gasto</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.reclamoBadge} onPress={abrirReclamo}>
              <Ionicons name="time-outline" size={15} color={COLORS.warning} />
              <Text style={s.reclamoBadgeText}>
                {`Reclamaste S/ ${jornada.monto_reclamado.toFixed(2)} — pendiente de reintegro (toca para editar)`}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[s.btn, s.btnFinalizar, procesando && { opacity: 0.6 }]} onPress={handleFinalizar} disabled={procesando}>
            {procesando ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Ionicons name="stop-circle-outline" size={19} color={COLORS.white} />
                <Text style={s.btnText}>Finalizar jornada</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardTitle}>¿A qué zona vas hoy?</Text>
          <Text style={s.cardSub}>Opcional — ayuda a tu administrador a ubicarte más rápido.</Text>

          {zonas.length > 0 && (
            <View style={s.chipsRow}>
              {zonas.map((z) => (
                <TouchableOpacity
                  key={z.id}
                  style={[s.chip, zonaId === z.id && s.chipActivo]}
                  onPress={() => setZonaId(zonaId === z.id ? null : z.id)}
                >
                  <Text style={[s.chipText, zonaId === z.id && s.chipTextActivo]}>{z.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={[s.btn, s.btnIniciar, procesando && { opacity: 0.6 }]} onPress={handleIniciar} disabled={procesando}>
            {procesando ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Ionicons name="play-circle-outline" size={19} color={COLORS.white} />
                <Text style={s.btnText}>Iniciar jornada</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>

    <Modal visible={modalReclamoVisible} transparent animationType="fade" onRequestClose={() => setModalReclamoVisible(false)}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Reportar gasto de pasaje</Text>
          <Text style={s.modalHint}>Si la tienda no te dio pasaje hoy y pagaste de tu bolsillo, repórtalo aquí para que tu administrador te lo reintegre.</Text>

          <Text style={s.modalLabel}>¿Cuánto gastaste? (S/)</Text>
          <TextInput
            style={s.modalInput}
            value={montoReclamo}
            onChangeText={setMontoReclamo}
            placeholder="0.00"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="decimal-pad"
          />

          <Text style={s.modalLabel}>Nota (opcional)</Text>
          <TextInput
            style={s.modalInput}
            value={notaReclamo}
            onChangeText={setNotaReclamo}
            placeholderTextColor={COLORS.placeholder}
          />

          <View style={s.modalRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setModalReclamoVisible(false)} disabled={guardandoReclamo}>
              <Text style={s.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalSubmitBtn, guardandoReclamo && { opacity: 0.6 }]} onPress={handleGuardarReclamo} disabled={guardandoReclamo}>
              {guardandoReclamo ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.modalSubmitText}>Reportar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <VendedorNav />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroActiva: { backgroundColor: '#059669' },
  heroIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  heroTitle: { fontSize: 19, fontWeight: '800', color: COLORS.white },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, textAlign: 'center', lineHeight: 18 },

  card: { backgroundColor: COLORS.card, borderRadius: 16, marginHorizontal: 20, marginTop: -16, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.dark },
  cardSub: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 3, marginBottom: 4 },

  estadoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  estadoText: { fontSize: 14, fontWeight: '800', color: '#059669' },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  infoText: { fontSize: 13, color: COLORS.dark, fontWeight: '600' },
  hint: { fontSize: 12, color: COLORS.mutedForeground, marginTop: 14, lineHeight: 17 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.background },
  chipActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.mutedForeground },
  chipTextActivo: { color: COLORS.white },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, marginTop: 18 },
  btnIniciar: { backgroundColor: COLORS.primary },
  btnFinalizar: { backgroundColor: '#DC2626' },
  btnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },

  reclamoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start' },
  reclamoLinkText: { fontSize: 12, fontWeight: '700', color: COLORS.warning },
  reclamoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: COLORS.lightwarning, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  reclamoBadgeOk: { backgroundColor: 'rgba(16,185,129,0.1)' },
  reclamoBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.warning, flexShrink: 1 },

  overlay: { flex: 1, backgroundColor: 'rgba(28,37,54,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: COLORS.dark, marginBottom: 6 },
  modalHint: { fontSize: 12, color: COLORS.mutedForeground, marginBottom: 14, lineHeight: 17 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.mutedForeground, marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.dark },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  modalSubmitBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalSubmitText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});
