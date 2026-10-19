import { useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registrarOnuPropio, detectarMarcaOnu, WifiVersion } from '@/services/api';
import { COLORS } from '@/theme/colors';

type Campo = 'mac' | 'serie' | null;

const BARCODE_TYPES = ['code128', 'code39', 'ean13', 'qr'] as const;

// La etiqueta trae varios códigos de barras pegados (MAC, GPON S/N, proveedor,
// QR) — aceptar la primera lectura tal cual agarra el que se cruce dentro del
// recuadro, que a veces incluye al vecino (ej. detecta el LOTE en vez de la
// MAC). Por eso ahora es como tomar una foto: el recuadro es angosto (una
// sola línea de código a la vez) y, apenas detecta algo, se congela y muestra
// lo leído para que el técnico confirme con "Usar este código" o reintente
// si agarró el que no era — nunca se registra solo.
const SCAN_ARM_DELAY_MS = 600;

function ScannerModal({ visible, onClose, onScanned }: {
  visible: boolean; onClose: () => void; onScanned: (valor: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [candidato, setCandidato] = useState<string | null>(null);
  const armadoRef = useRef(false);

  function handleShow() {
    setCandidato(null);
    armadoRef.current = false;
    setTimeout(() => { armadoRef.current = true; }, SCAN_ARM_DELAY_MS);
  }

  function handleScan(result: BarcodeScanningResult) {
    if (candidato || !armadoRef.current) return;
    const data = result.data.trim();
    if (!data) return;
    setCandidato(data);
  }

  function reintentar() {
    setCandidato(null);
    armadoRef.current = true;
  }

  function confirmar() {
    if (!candidato) return;
    onScanned(candidato);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onShow={handleShow}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permission ? (
          <ActivityIndicator style={{ flex: 1 }} color={COLORS.white} />
        ) : !permission.granted ? (
          <View style={sc.permWrap}>
            <Text style={sc.permText}>Necesitamos permiso de cámara para escanear el código de barras del equipo.</Text>
            <TouchableOpacity style={sc.permBtn} onPress={requestPermission}>
              <Text style={sc.permBtnText}>Dar permiso</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={sc.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={handleScan}
            />
            <View style={sc.overlay} pointerEvents="none">
              <View style={[sc.frame, candidato && sc.frameConfirmando]} />
              {!candidato && <Text style={sc.hint}>Centra una sola línea de código en el recuadro</Text>}
            </View>
            {candidato && (
              <View style={sc.confirmPanel}>
                <Text style={sc.confirmLabel}>¿Es este el código correcto?</Text>
                <Text style={sc.confirmValue}>{candidato}</Text>
                <View style={sc.confirmRow}>
                  <TouchableOpacity style={sc.retryBtn} onPress={reintentar}>
                    <Ionicons name="refresh" size={17} color={COLORS.dark} />
                    <Text style={sc.retryBtnText}>Reintentar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={sc.useBtn} onPress={confirmar}>
                    <Ionicons name="checkmark" size={18} color={COLORS.white} />
                    <Text style={sc.useBtnText}>Usar este código</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <TouchableOpacity style={sc.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={15} color="#fff" />
              <Text style={sc.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

export default function EscanearEquipoScreen() {
  const router = useRouter();
  const [mac, setMac] = useState('');
  const [serie, setSerie] = useState('');
  const [marca, setMarca] = useState('');
  const [wifiVersion, setWifiVersion] = useState<WifiVersion | ''>('');
  const [scanning, setScanning] = useState<Campo>(null);
  const [saving, setSaving] = useState(false);

  function onSerieChange(valor: string) {
    setSerie(valor);
    const detectada = detectarMarcaOnu(valor);
    if (detectada) setMarca(detectada);
  }

  function onScanned(valor: string) {
    if (scanning === 'mac') setMac(valor);
    else if (scanning === 'serie') onSerieChange(valor);
    setScanning(null);
  }

  async function guardar() {
    if (!serie.trim()) {
      Alert.alert('Falta el N° de serie', 'El N° de serie GPON es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      await registrarOnuPropio({
        numero_serie: serie.trim(),
        mac: mac.trim() || undefined,
        marca: marca.trim() || undefined,
        wifi_version: wifiVersion || undefined,
      });
      Alert.alert(
        '✓ Equipo registrado',
        `ONU ${serie.trim()} quedó en tu inventario.`,
        [{ text: 'OK', onPress: () => router.replace('/(tecnico)/inventario') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el equipo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.infoCard}>
        <Ionicons name="cube-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
        <Text style={s.infoText}>Registra un equipo que te dio el almacén y todavía no está en el sistema. Escanea el código de barras de la etiqueta o escríbelo a mano.</Text>
      </View>

      <Text style={s.label}>N° DE SERIE GPON *</Text>
      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={serie}
          onChangeText={onSerieChange}
          placeholder="ASKY0093629C"
          placeholderTextColor={COLORS.placeholder}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={s.scanBtn} onPress={() => setScanning('serie')}>
          <Ionicons name="camera-outline" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <Text style={s.label}>MAC</Text>
      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={mac}
          onChangeText={setMac}
          placeholder="A08A06187A10"
          placeholderTextColor={COLORS.placeholder}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={s.scanBtn} onPress={() => setScanning('mac')}>
          <Ionicons name="camera-outline" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <Text style={s.label}>MARCA</Text>
      <TextInput style={s.input} value={marca} onChangeText={setMarca} placeholder="Se detecta sola al escanear la serie" placeholderTextColor={COLORS.placeholder} />

      <Text style={s.label}>WIFI</Text>
      <View style={[s.row, { marginBottom: 20 }]}>
        {(['wifi5', 'wifi6'] as WifiVersion[]).map(v => (
          <TouchableOpacity
            key={v}
            style={[s.chip, wifiVersion === v && s.chipActive]}
            onPress={() => setWifiVersion(wifiVersion === v ? '' : v)}
          >
            <Text style={[s.chipText, wifiVersion === v && s.chipTextActive]}>{v === 'wifi5' ? 'WiFi 5' : 'WiFi 6'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[s.guardarBtn, saving && { opacity: 0.7 }]} onPress={guardar} disabled={saving}>
        {saving ? <ActivityIndicator color={COLORS.white} /> : (
          <>
            <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
            <Text style={s.guardarText}>Registrar a mi inventario</Text>
          </>
        )}
      </TouchableOpacity>

      <ScannerModal visible={scanning !== null} onClose={() => setScanning(null)} onScanned={onScanned} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.lightprimary, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(93,135,255,0.25)' },
  infoText: { flex: 1, fontSize: 13, color: COLORS.dark, lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: COLORS.dark },
  scanBtn: { width: 48, height: 48, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: COLORS.card },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: COLORS.primaryEmphasis },
  guardarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  guardarText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
});

const sc = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 300, height: 40, borderWidth: 3, borderColor: COLORS.secondary, borderRadius: 10, backgroundColor: 'transparent' },
  frameConfirmando: { borderColor: COLORS.success },
  hint: { color: '#fff', marginTop: 16, fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  closeBtn: { position: 'absolute', top: 50, right: 20, flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  confirmPanel: { position: 'absolute', left: 16, right: 16, bottom: 36, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  confirmLabel: { fontSize: 12, fontWeight: '700', color: COLORS.mutedForeground },
  confirmValue: { fontSize: 17, fontWeight: '900', color: COLORS.dark, marginTop: 4, marginBottom: 14, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 10, width: '100%' },
  retryBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12 },
  retryBtnText: { color: COLORS.dark, fontWeight: '700', fontSize: 13 },
  useBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.success, borderRadius: 10, paddingVertical: 12 },
  useBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  permBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { color: COLORS.white, fontWeight: '700' },
  cancelText: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
});
