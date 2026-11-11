import { useRef, useState } from 'react';
import {
  View, Text, Image, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registrarOnuPropio, detectarMarcaOnu, WifiVersion } from '@/services/api';
import { COLORS } from '@/theme/colors';

type Campo = 'mac' | 'serie' | null;

const BARCODE_TYPES = ['code128', 'code39', 'ean13', 'qr'] as const;

// La etiqueta trae varios códigos de barras pegados (MAC, GPON S/N, proveedor,
// QR). Un escaneo "en vivo" (cuadro a cuadro) no sirve acá: expo-camera
// analiza toda la imagen de cada cuadro y devuelve cualquier código que
// detecte ahí, sin importar qué parte caiga dentro del recuadro que se ve en
// pantalla — ese recuadro es solo decorativo. Con varios códigos juntos,
// siempre terminaba agarrando el más fácil de leer, no el que el técnico
// apuntaba, ni con zoom.
//
// En cambio esto funciona como una cámara de fotos: el técnico encuadra y
// toca el botón, se toma UNA foto, se buscan todos los códigos que haya en
// esa foto (scanFromURLAsync) y se le muestran como lista para que elija cuál
// es — nunca se adivina ni se registra solo.
const ZOOM_INICIAL = 0.45;

function ScannerModal({ visible, onClose, onScanned }: {
  visible: boolean; onClose: () => void; onScanned: (valor: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [codigos, setCodigos] = useState<BarcodeScanningResult[]>([]);

  function handleShow() {
    setFoto(null);
    setCodigos([]);
    setAnalizando(false);
  }

  async function tomarFoto() {
    if (!cameraRef.current || analizando) return;
    try {
      const captura = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      setFoto(captura.uri);
      setAnalizando(true);
      const encontrados = await scanFromURLAsync(captura.uri, [...BARCODE_TYPES]);
      setCodigos(encontrados);
    } catch {
      Alert.alert('Error', 'No se pudo tomar la foto. Intenta de nuevo.');
      setFoto(null);
    } finally {
      setAnalizando(false);
    }
  }

  function reintentar() {
    setFoto(null);
    setCodigos([]);
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
        ) : !foto ? (
          <>
            <CameraView
              ref={cameraRef}
              style={{ flex: 1 }}
              facing="back"
              zoom={ZOOM_INICIAL}
            />
            <View style={sc.overlay} pointerEvents="none">
              <View style={sc.frame} />
              <Text style={sc.hint}>
                Encuadra un solo código{'\n'}y toca el botón para capturar
              </Text>
            </View>
            <TouchableOpacity style={sc.shutterBtn} onPress={tomarFoto} disabled={analizando}>
              <View style={sc.shutterInner} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: foto }} style={sc.fotoPreview} resizeMode="cover" />
            <View style={sc.resultPanel}>
              {analizando ? (
                <View style={sc.resultCentro}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={sc.resultLoadingText}>Buscando códigos en la foto…</Text>
                </View>
              ) : codigos.length === 0 ? (
                <View style={sc.resultCentro}>
                  <Ionicons name="alert-circle-outline" size={28} color={COLORS.warning} />
                  <Text style={sc.resultEmptyText}>No se detectó ningún código en la foto.</Text>
                  <TouchableOpacity style={sc.retryBtn} onPress={reintentar}>
                    <Ionicons name="camera-outline" size={17} color={COLORS.dark} />
                    <Text style={sc.retryBtnText}>Tomar otra foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={sc.resultLabel}>
                    {codigos.length === 1 ? '¿Es este el código?' : `Se encontraron ${codigos.length} códigos — ¿cuál es?`}
                  </Text>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {codigos.map((c, i) => (
                      <TouchableOpacity key={`${c.data}-${i}`} style={sc.codigoBtn} onPress={() => onScanned(c.data)}>
                        <View style={{ flex: 1 }}>
                          <Text style={sc.codigoValue}>{c.data}</Text>
                          <Text style={sc.codigoTipo}>{c.type}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.mutedForeground} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={sc.retryBtn} onPress={reintentar}>
                    <Ionicons name="camera-outline" size={17} color={COLORS.dark} />
                    <Text style={sc.retryBtnText}>Tomar otra foto</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
        <TouchableOpacity style={sc.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={15} color="#fff" />
          <Text style={sc.closeBtnText}>Cerrar</Text>
        </TouchableOpacity>
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
  frame: { width: 280, height: 90, borderWidth: 3, borderColor: COLORS.secondary, borderRadius: 10, backgroundColor: 'transparent' },
  hint: { color: '#fff', marginTop: 16, fontSize: 13, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  shutterBtn: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  closeBtn: { position: 'absolute', top: 50, right: 20, flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fotoPreview: { flex: 1 },
  resultPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 18, paddingBottom: 28, maxHeight: '55%',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  resultCentro: { alignItems: 'center', paddingVertical: 8 },
  resultLoadingText: { marginTop: 10, fontSize: 13, color: COLORS.mutedForeground },
  resultEmptyText: { marginTop: 10, fontSize: 13, color: COLORS.dark, textAlign: 'center' },
  resultLabel: { fontSize: 13, fontWeight: '700', color: COLORS.dark, marginBottom: 10, textAlign: 'center' },
  codigoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, backgroundColor: COLORS.background,
  },
  codigoValue: { fontSize: 15, fontWeight: '800', color: COLORS.dark },
  codigoTipo: { fontSize: 11, color: COLORS.mutedForeground, marginTop: 2, textTransform: 'uppercase' },
  retryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12, marginTop: 6 },
  retryBtnText: { color: COLORS.dark, fontWeight: '700', fontSize: 13 },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  permBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { color: COLORS.white, fontWeight: '700' },
  cancelText: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
});
