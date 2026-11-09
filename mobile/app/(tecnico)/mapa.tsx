import { useLocalSearchParams } from 'expo-router';
import MapaInfraestructura, { ClientePin } from '@/components/MapaInfraestructura';

/**
 * Mapa de planta externa para el técnico: mufas, cajas NAP y —cuando llega
 * desde una instalación— la casa del cliente al que va.
 */
export default function TecnicoMapaScreen() {
  const params = useLocalSearchParams<{ clienteLat?: string; clienteLng?: string; clienteNombre?: string }>();
  const clientePin: ClientePin | null =
    params.clienteLat && params.clienteLng
      ? { lat: Number(params.clienteLat), lng: Number(params.clienteLng), nombre: params.clienteNombre ?? 'Cliente' }
      : null;

  return <MapaInfraestructura clientePin={clientePin} />;
}
