import { useState, useEffect, useMemo, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getMufas, getCajasNap, Mufa, CajaNap } from '@/services/api';
import { COLORS } from '@/theme/colors';

type ClientePin = { lat: number; lng: number; nombre: string };

function buildMapHtml(mufas: Mufa[], cajas: CajaNap[], clientePin: ClientePin | null): string {
  const mufaMarcadores = mufas
    .filter(m => m.lat != null && m.lng != null)
    .map(m => ({ lat: m.lat, lng: m.lng, codigo: m.codigo, cajas: m.total_cajas }));

  const cajaMarcadores = cajas
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({ lat: c.lat, lng: c.lng, codigo: c.codigo, libres: c.bornes.filter(b => b.estado === 'libre').length }));

  const centro = clientePin
    ?? (mufaMarcadores[0] ? { lat: mufaMarcadores[0].lat, lng: mufaMarcadores[0].lng } : { lat: -12.0464, lng: -77.0428 });

  const nombreSeguro = (clientePin?.nombre ?? '').replace(/'/g, "\\'");

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    .capa-toggle { position: absolute; top: 10px; right: 10px; z-index: 1000; background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.25); overflow: hidden; display: flex; font-family: sans-serif; }
    .capa-toggle button { border: none; background: white; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #64748B; }
    .capa-toggle button.activo { background: ${COLORS.primary}; color: white; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="capa-toggle">
    <button id="btnCalle" class="activo" onclick="cambiarCapa('calle')">Calle</button>
    <button id="btnSatelite" onclick="cambiarCapa('satelite')">Satélite</button>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { maxZoom: 21 }).setView([${centro.lat}, ${centro.lng}], 15);

    // maxNativeZoom evita el tile de "Map data not yet available" que Esri
    // muestra en zonas rurales sin imagen satelital de alta resolución —
    // Leaflet escala el último nivel real en vez de pedir uno que no existe.
    const calle = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxNativeZoom: 19, maxZoom: 21
    }).addTo(map);
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri', maxNativeZoom: 18, maxZoom: 21
    });

    function cambiarCapa(cual) {
      document.getElementById('btnCalle').classList.toggle('activo', cual === 'calle');
      document.getElementById('btnSatelite').classList.toggle('activo', cual === 'satelite');
      if (cual === 'satelite') { map.removeLayer(calle); satelite.addTo(map); }
      else { map.removeLayer(satelite); calle.addTo(map); }
    }

    const mufaIcon = L.divIcon({
      html: '<div style="background:${COLORS.info};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:12px;font-weight:800">M</div>',
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    });
    const cajaIcon = L.divIcon({
      html: '<div style="background:${COLORS.success};width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:10px;font-weight:800">N</div>',
      className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    });
    const clienteIcon = L.divIcon({
      html: '<div style="background:${COLORS.error};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.35);color:white;font-size:13px;font-weight:800">C</div>',
      className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    });
    const meIcon = L.divIcon({
      html: '<div style="background:${COLORS.success};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(19,222,185,0.35)"></div>',
      className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    });

    const mufas = ${JSON.stringify(mufaMarcadores)};
    mufas.forEach(function(m) {
      L.marker([m.lat, m.lng], { icon: mufaIcon }).addTo(map)
        .bindPopup('<b>' + m.codigo + '</b><br/>' + m.cajas + ' caja(s) NAP');
    });

    const cajas = ${JSON.stringify(cajaMarcadores)};
    cajas.forEach(function(c) {
      L.marker([c.lat, c.lng], { icon: cajaIcon }).addTo(map)
        .bindPopup('<b>' + c.codigo + '</b><br/>' + c.libres + ' borne(s) libres');
    });

    const clientePunto = ${clientePin ? `[${clientePin.lat}, ${clientePin.lng}]` : 'null'};
    ${clientePin ? `L.marker(clientePunto, { icon: clienteIcon }).addTo(map).bindPopup('<b>${nombreSeguro}</b><br/>Cliente a instalar').openPopup();` : ''}

    // Se llama desde React (injectJavaScript) cada vez que llega una nueva
    // lectura del GPS mientras el técnico camina — mueve el marcador sin
    // recargar el mapa ni perder el zoom/paneo que haya hecho el usuario.
    let meMarker = null;
    function actualizarMiUbicacion(lat, lng) {
      if (meMarker) {
        meMarker.setLatLng([lat, lng]);
      } else {
        meMarker = L.marker([lat, lng], { icon: meIcon }).addTo(map).bindPopup('Tu ubicación');
        if (clientePunto) {
          map.fitBounds([clientePunto, [lat, lng]], { padding: [50, 50] });
        } else {
          map.setView([lat, lng], 16);
        }
      }
    }
    window.actualizarMiUbicacion = actualizarMiUbicacion;

    function centrarEnMi() {
      if (meMarker) map.setView(meMarker.getLatLng(), 17);
    }
    window.centrarEnMi = centrarEnMi;
  </script>
</body>
</html>`;
}

export default function TecnicoMapaScreen() {
  const params = useLocalSearchParams<{ clienteLat?: string; clienteLng?: string; clienteNombre?: string }>();
  const clientePin: ClientePin | null =
    params.clienteLat && params.clienteLng
      ? { lat: Number(params.clienteLat), lng: Number(params.clienteLng), nombre: params.clienteNombre ?? 'Cliente' }
      : null;

  const [mufas, setMufas] = useState<Mufa[]>([]);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, c] = await Promise.all([getMufas(), getCajasNap()]);
        setMufas(m);
        setCajas(c);
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Seguimiento de GPS en vivo mientras el técnico camina — se actualiza el
  // marcador dentro del WebView por JS, nunca se reconstruye el HTML del mapa.
  useEffect(() => {
    let subscripcion: Location.LocationSubscription | null = null;
    let cancelado = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelado) return;
      subscripcion = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (pos) => {
          webViewRef.current?.injectJavaScript(
            `actualizarMiUbicacion(${pos.coords.latitude}, ${pos.coords.longitude}); true;`,
          );
        },
      );
    })();
    return () => {
      cancelado = true;
      subscripcion?.remove();
    };
  }, []);

  const html = useMemo(
    () => buildMapHtml(mufas, cajas, clientePin),
    [mufas, cajas, params.clienteLat, params.clienteLng, params.clienteNombre],
  );

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;
  }

  return (
    <View style={s.container}>
      <WebView ref={webViewRef} source={{ html }} style={{ flex: 1 }} />
      <TouchableOpacity style={s.centrarBtn} onPress={() => webViewRef.current?.injectJavaScript('centrarEnMi(); true;')}>
        <Ionicons name="locate" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centrarBtn: {
    position: 'absolute', left: 16, bottom: 24, width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 5,
  },
});
