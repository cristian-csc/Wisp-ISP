import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS } from '@/theme/colors';

type Coords = { lat: number; lng: number };

function buildPickerHtml(centro: Coords): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { maxZoom: 21 }).setView([${centro.lat}, ${centro.lng}], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxNativeZoom: 19, maxZoom: 21
    }).addTo(map);

    const pinIcon = L.divIcon({
      html: '<div style="background:${COLORS.error};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.4);border:2px solid white;"></div>',
      className: '', iconSize: [30, 30], iconAnchor: [15, 30],
    });

    const marker = L.marker([${centro.lat}, ${centro.lng}], { icon: pinIcon, draggable: true }).addTo(map);

    function enviarPosicion() {
      const pos = marker.getLatLng();
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: pos.lat, lng: pos.lng }));
    }

    marker.on('dragend', enviarPosicion);
    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      enviarPosicion();
    });

    window.moverA = function(lat, lng) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 17);
      enviarPosicion();
    };

    enviarPosicion();
  </script>
</body>
</html>`;
}

/** Selector de ubicación en mapa — reemplaza "usar mi GPS tal cual" por
 * "centrar en mi GPS y dejar que la persona ajuste el pin a mano" (tocando
 * o arrastrando), para no depender de que el técnico esté parado exactamente
 * en la puerta del cliente al momento de registrar. */
export function UbicacionPickerModal({ visible, coordsIniciales, onCancel, onConfirm }: {
  visible: boolean;
  coordsIniciales: Coords | null;
  onCancel: () => void;
  onConfirm: (coords: Coords) => void;
}) {
  const [centroInicial, setCentroInicial] = useState<Coords | null>(coordsIniciales);
  const [actual, setActual] = useState<Coords | null>(coordsIniciales);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!visible) return;
    setActual(coordsIniciales);
    if (coordsIniciales) {
      setCentroInicial(coordsIniciales);
      return;
    }
    // Sin ubicación previa (cliente nuevo): centra en el GPS del técnico para
    // no obligarlo a buscar manualmente dónde está parado.
    setBuscandoGps(true);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCentroInicial(coords);
          setActual(coords);
        } else {
          setCentroInicial({ lat: -12.0464, lng: -77.0428 });
        }
      } catch {
        setCentroInicial({ lat: -12.0464, lng: -77.0428 });
      } finally {
        setBuscandoGps(false);
      }
    })();
  }, [visible]);

  const html = useMemo(() => (centroInicial ? buildPickerHtml(centroInicial) : null), [centroInicial]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const { lat, lng } = JSON.parse(e.nativeEvent.data);
      setActual({ lat, lng });
    } catch {}
  }

  async function centrarEnMiGps() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      webViewRef.current?.injectJavaScript(`moverA(${pos.coords.latitude}, ${pos.coords.longitude}); true;`);
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {buscandoGps || !html ? (
          <ActivityIndicator style={{ flex: 1 }} color={COLORS.white} />
        ) : (
          <WebView ref={webViewRef} source={{ html }} style={{ flex: 1 }} onMessage={onMessage} />
        )}

        <View style={s.hint}>
          <Ionicons name="hand-left-outline" size={14} color="#fff" />
          <Text style={s.hintText}>Toca o arrastra el pin hasta la vivienda del cliente</Text>
        </View>

        <TouchableOpacity style={s.gpsBtn} onPress={centrarEnMiGps}>
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={s.bottomBar}>
          <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
            <Text style={s.cancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.confirmBtn, !actual && { opacity: 0.5 }]}
            disabled={!actual}
            onPress={() => actual && onConfirm(actual)}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
            <Text style={s.confirmText}>Confirmar ubicación</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  hint: {
    position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  hintText: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  gpsBtn: {
    position: 'absolute', right: 16, bottom: 104, width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
  },
  bottomBar: {
    position: 'absolute', left: 16, right: 16, bottom: 28, flexDirection: 'row', gap: 10,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  cancelText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    flex: 2, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 14, backgroundColor: COLORS.primary,
  },
  confirmText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});
