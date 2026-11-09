import { useState, useEffect, useMemo, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getMufas, getCajasNap, Mufa, CajaNap } from '@/services/api';
import { COLORS } from '@/theme/colors';
import { buildMapHtml, RADIO_COBERTURA_M, type ClientePin } from './mapaInfraestructuraHtml';

export type { ClientePin } from './mapaInfraestructuraHtml';
export { RADIO_COBERTURA_M } from './mapaInfraestructuraHtml';

type Props = {
  /** Marca además la casa de un cliente (para el técnico que va a instalar) */
  clientePin?: ClientePin | null;
  /** Dibuja el alcance de cada caja NAP: para saber dónde se puede vender */
  cobertura?: boolean;
  radioM?: number;
};

/**
 * Mapa de la planta externa (mufas y cajas NAP) con la ubicación en vivo de
 * quien lo mira. Con `cobertura` dibuja además el alcance de cada caja, que es
 * lo que la vendedora necesita para saber dónde puede ofrecer el servicio.
 */
export default function MapaInfraestructura({
  clientePin = null,
  cobertura = false,
  radioM = RADIO_COBERTURA_M,
}: Props) {
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

  // Seguimiento de GPS en vivo mientras se camina — se actualiza el marcador
  // dentro del WebView por JS, nunca se reconstruye el HTML del mapa.
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
    () => buildMapHtml(mufas, cajas, clientePin, cobertura, radioM),
    [mufas, cajas, clientePin?.lat, clientePin?.lng, clientePin?.nombre, cobertura, radioM],
  );

  if (loading) {
    return (
      <ActivityIndicator
        style={{ flex: 1, backgroundColor: COLORS.background }}
        color={COLORS.primary}
        size="large"
      />
    );
  }

  return (
    <View style={s.container}>
      <WebView ref={webViewRef} source={{ html }} style={{ flex: 1 }} />
      <TouchableOpacity
        style={s.centrarBtn}
        onPress={() => webViewRef.current?.injectJavaScript('centrarEnMi(); true;')}
      >
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
