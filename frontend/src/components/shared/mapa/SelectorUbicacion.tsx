import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@iconify/react';
import {
  AjustarTamanoMapa,
  ControlesCapa,
  ControlesZoom,
  LeyendaMapa,
  MapaShell,
} from './ControlesMapa';
import type { Coordenadas } from 'src/lib/coordenadas';

// Mismo tope que el mapa de infraestructura: pasado z17, Esri devuelve el
// cartel gris de "Map data not yet available" en toda esta zona del Perú.
const MAX_ZOOM_SATELITE = 17;
const MAX_ZOOM_CALLE = 21;

type CapaMapa = 'calle' | 'satelite';

const CAPAS: Record<CapaMapa, { url: string; attribution: string }> = {
  calle: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};

const casaIcon = L.divIcon({
  html: `<div style="background:#fa896b;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>
  </div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const cajaIcon = L.divIcon({
  html: `<div style="background:#13deb9;width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:9px;font-weight:800">N</div>`,
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function ClickHandler({ onClick }: { onClick: (c: Coordenadas) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function LimiteDeZoom({ max }: { max: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(max);
    if (map.getZoom() > max) map.setZoom(max);
  }, [map, max]);
  return null;
}

/** Al marcar la casa desde el campo de texto, el mapa va a verla. */
function IrA({ punto }: { punto: Coordenadas | null }) {
  const map = useMap();
  useEffect(() => {
    if (punto) map.panTo([punto.lat, punto.lng]);
  }, [punto?.lat, punto?.lng]);
  return null;
}

export type CajaCercana = {
  id: number;
  codigo: string;
  lat?: number | null;
  lng?: number | null;
  /** Bornes libres, para saber si además de cerca tiene sitio */
  libres?: number;
};

/**
 * Marcar dónde está la casa de un cliente.
 *
 * Se toca el mapa o se arrastra el punto. Las cajas NAP de la zona se pintan
 * con su alcance práctico alrededor, que es el criterio de "¿acá hay
 * cobertura?": si la casa cae dentro de alguno de esos círculos, el drop
 * llega; si no, hay que tender más o buscar otra caja.
 */
const SelectorUbicacion = ({
  valor,
  onChange,
  cajas = [],
  radioCobertura = 150,
  centroInicial,
  alto = 420,
}: {
  valor: Coordenadas | null;
  onChange: (c: Coordenadas) => void;
  cajas?: CajaCercana[];
  /** Hasta dónde se estira el drop desde una caja, en metros */
  radioCobertura?: number;
  /** Dónde abrir el mapa cuando todavía no hay nada marcado */
  centroInicial?: Coordenadas | null;
  alto?: number;
}) => {
  const [capa, setCapa] = useState<CapaMapa>('calle');
  const topeZoom = capa === 'satelite' ? MAX_ZOOM_SATELITE : MAX_ZOOM_CALLE;

  const cajasUbicadas = cajas.filter((c) => c.lat != null && c.lng != null);

  const centro: [number, number] = valor
    ? [valor.lat, valor.lng]
    : centroInicial
    ? [centroInicial.lat, centroInicial.lng]
    : cajasUbicadas[0]
    ? [cajasUbicadas[0].lat!, cajasUbicadas[0].lng!]
    : [-15.4997, -70.1337]; // Juliaca, si no hay ninguna referencia

  return (
    <MapaShell alto={alto}>
      {!valor && (
        <div className="bg-lightprimary text-primary text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:map-pin" height={16} />
          Toca el mapa donde está la casa — después puedes arrastrar el punto
        </div>
      )}

      <ControlesCapa
        valor={capa}
        onChange={setCapa}
        opciones={[
          { valor: 'calle', etiqueta: 'Calle' },
          { valor: 'satelite', etiqueta: 'Satélite' },
        ] as const}
      />

      <MapContainer
        center={centro}
        zoom={valor || centroInicial ? 17 : 14}
        maxZoom={MAX_ZOOM_CALLE}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution={CAPAS[capa].attribution}
          url={CAPAS[capa].url}
          maxNativeZoom={capa === 'satelite' ? MAX_ZOOM_SATELITE : 19}
          maxZoom={topeZoom}
        />
        <ClickHandler onClick={onChange} />
        <AjustarTamanoMapa />
        <ControlesZoom volverA={{ centro, zoom: 16 }} />
        <LimiteDeZoom max={topeZoom} />
        <IrA punto={valor} />

        {cajasUbicadas.map((c) => (
          <Circle
            key={`cob-${c.id}`}
            center={[c.lat!, c.lng!]}
            radius={radioCobertura}
            pathOptions={{ color: '#13deb9', weight: 1, fillOpacity: 0.08 }}
          />
        ))}

        {cajasUbicadas.map((c) => (
          <Marker key={c.id} position={[c.lat!, c.lng!]} icon={cajaIcon}>
            <Tooltip direction="top" offset={[0, -10]}>
              <b>{c.codigo}</b>
              {c.libres != null && ` · ${c.libres} borne${c.libres === 1 ? '' : 's'} libre${c.libres === 1 ? '' : 's'}`}
            </Tooltip>
          </Marker>
        ))}

        {valor && (
          <Marker
            position={[valor.lat, valor.lng]}
            icon={casaIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange({ lat: p.lat, lng: p.lng });
              },
            }}
          />
        )}
      </MapContainer>

      <LeyendaMapa
        items={[
          { color: '#fa896b', texto: 'Casa del cliente' },
          ...(cajasUbicadas.length > 0 ? [{ color: '#13deb9', texto: 'Caja NAP' }] : []),
        ]}
        nota={
          cajasUbicadas.length > 0
            ? `El círculo es el alcance de ${radioCobertura} m desde cada caja`
            : undefined
        }
      />
    </MapaShell>
  );
};

export default SelectorUbicacion;
