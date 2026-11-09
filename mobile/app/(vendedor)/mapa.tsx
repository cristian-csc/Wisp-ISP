import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapaInfraestructura, { RADIO_COBERTURA_M } from '@/components/MapaInfraestructura';
import { VendedorNav } from '@/components/VendedorNav';
import { COLORS } from '@/theme/colors';

/**
 * Hasta dónde llega la fibra, para la vendedora: las mismas cajas NAP y mufas
 * que ve el panel, con el alcance de cada caja dibujado. Donde hay círculo
 * verde se puede ofrecer el servicio; donde la caja está llena, no.
 */
export default function VendedorMapaScreen() {
  return (
    <View style={s.container}>
      <View style={s.aviso}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
        <Text style={s.avisoText}>
          Dentro del círculo verde hay fibra a menos de {RADIO_COBERTURA_M} m: ahí se puede
          instalar. Toca una caja para ver cuántos bornes le quedan.
        </Text>
      </View>
      <MapaInfraestructura cobertura />
      <VendedorNav />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.lightinfo,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avisoText: { flex: 1, fontSize: 12, color: '#334155', lineHeight: 17 },
});
