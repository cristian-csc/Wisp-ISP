import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AjustarTamanoMapa,
  ControlesCapa,
  ControlesZoom,
  LeyendaMapa,
  MapaShell,
  type ItemLeyenda,
} from 'src/components/shared/mapa/ControlesMapa';
import type { Jornada, JornadaRecorrido } from 'src/lib/jornadas';

// react-leaflet solo usa `center`/`zoom` al montar el mapa — cambiarlos luego
// (p.ej. al pasar de la vista en vivo al recorrido de una jornada en otra
// zona) no mueve la vista sola. Este componente la recentra a mano, pero solo
// cuando cambia la *selección* (clave), no en cada refresco del polling en
// vivo — si no, el mapa le quitaría el control al admin cada 20s mientras
// está explorando la vista en vivo.
function RecentrarMapa({ centro, zoom, clave }: { centro: [number, number]; zoom: number; clave: string }) {
  const map = useMap();
  useEffect(() => {
    map.setView(centro, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return null;
}

const vendedorIcon = L.divIcon({
  html: `<div style="position:relative;width:26px;height:26px;">
    <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(16,185,129,0.35);animation:jornadaPulse 2s ease-out infinite;"></div>
    <div style="position:relative;background:#10B981;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 2a5 5 0 110 10 5 5 0 010-10zm0 12c4.97 0 9 2.24 9 5v1H3v-1c0-2.76 4.03-5 9-5z"/></svg>
    </div>
    <style>@keyframes jornadaPulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }</style>
  </div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const inicioIcon = L.divIcon({
  html: `<div style="background:#5d87ff;width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const finIcon = L.divIcon({
  html: `<div style="background:#64748B;width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

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

function horaCorta(fecha: string) {
  return new Date(fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function MapaJornadas({
  activas = [],
  recorrido = null,
  alto = 560,
}: {
  activas?: Jornada[];
  recorrido?: JornadaRecorrido | null;
  /** Alto del mapa en píxeles — el módulo decide cuánto protagonismo darle */
  alto?: number;
}) {
  const [capa, setCapa] = useState<CapaMapa>('calle');

  const puntosRecorrido = recorrido?.puntos ?? [];
  const jornadaSeleccionada = recorrido?.jornada ?? null;

  /** El recorrido completo: desde dónde salió, por dónde pasó y dónde terminó. */
  const trazo: [number, number][] = jornadaSeleccionada
    ? [
        [jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio],
        ...puntosRecorrido.map((p) => [p.lat, p.lng] as [number, number]),
        ...(jornadaSeleccionada.lat_fin != null && jornadaSeleccionada.lng_fin != null
          ? [[jornadaSeleccionada.lat_fin, jornadaSeleccionada.lng_fin] as [number, number]]
          : []),
      ]
    : [];

  /** Cuánto caminó, sumando tramo por tramo. Sirve para contrastar el pasaje
   *  del día con lo que de verdad recorrió. */
  const metrosRecorridos = trazo.reduce((total, punto, i) => {
    if (i === 0) return 0;
    const [lat1, lng1] = trazo[i - 1];
    const [lat2, lng2] = punto;
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return total + 2 * R * Math.asin(Math.sqrt(a));
  }, 0);

  const distanciaTexto =
    metrosRecorridos >= 1000
      ? `${(metrosRecorridos / 1000).toFixed(1)} km`
      : `${Math.round(metrosRecorridos)} m`;

  const centro: [number, number] =
    jornadaSeleccionada
      ? [jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio]
      : activas[0]
      ? [activas[0].ultima_ubicacion?.lat ?? activas[0].lat_inicio, activas[0].ultima_ubicacion?.lng ?? activas[0].lng_inicio]
      : [-15.8402, -70.0219]; // Juliaca, fallback

  const zoom = jornadaSeleccionada ? 15 : 13;
  const claveRecentrado = jornadaSeleccionada ? `jornada-${jornadaSeleccionada.id}` : `vivo-${activas.length > 0 ? 'con-datos' : 'sin-datos'}`;

  /** Lo que explica la leyenda según lo que se esté mirando. */
  const itemsLeyenda: ItemLeyenda[] = jornadaSeleccionada
    ? [
        { color: '#5d87ff', texto: 'Inicio' },
        { color: '#64748B', texto: 'Fin' },
        { color: '#FF842A', texto: `Recorrido · ${distanciaTexto}`, linea: true },
      ]
    : [{ color: '#10B981', texto: 'Vendedora en ruta' }];

  const notaLeyenda = jornadaSeleccionada
    ? puntosRecorrido.length === 0
      ? 'Sin puntos intermedios: solo inicio y fin'
      : `${puntosRecorrido.length} punto${puntosRecorrido.length === 1 ? '' : 's'} en el camino`
    : undefined;

  return (
    <MapaShell alto={alto}>
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
        zoom={zoom}
        maxZoom={21}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution={CAPAS[capa].attribution} url={CAPAS[capa].url} maxZoom={21} />
        <RecentrarMapa centro={centro} zoom={zoom} clave={claveRecentrado} />
        <AjustarTamanoMapa />
        <ControlesZoom volverA={{ centro, zoom }} />

        {!jornadaSeleccionada &&
          activas
            .filter((j) => j.ultima_ubicacion || (j.lat_inicio != null && j.lng_inicio != null))
            .map((j) => {
              const pos = j.ultima_ubicacion
                ? [j.ultima_ubicacion.lat, j.ultima_ubicacion.lng]
                : [j.lat_inicio, j.lng_inicio];
              return (
                <Marker key={j.id} position={pos as [number, number]} icon={vendedorIcon}>
                  <Popup>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                      <b className="text-sm">{j.vendedor?.nombre ?? 'Vendedor'}</b>
                      <span className="text-xs text-muted-foreground">
                        En ruta desde las {horaCorta(j.iniciado_en)}
                      </span>
                      {j.zona && <span className="text-xs text-muted-foreground">Zona: {j.zona.nombre}</span>}
                      {j.ultima_ubicacion && (
                        <span className="text-xs text-muted-foreground">
                          Último reporte: {horaCorta(j.ultima_ubicacion.registrado_en)}
                        </span>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

        {jornadaSeleccionada && (
          <>
            <Marker position={[jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio]} icon={inicioIcon}>
              <Popup>Inicio — {horaCorta(jornadaSeleccionada.iniciado_en)}</Popup>
            </Marker>
            {jornadaSeleccionada.lat_fin != null && jornadaSeleccionada.lng_fin != null && (
              <Marker position={[jornadaSeleccionada.lat_fin, jornadaSeleccionada.lng_fin]} icon={finIcon}>
                <Popup>Fin{jornadaSeleccionada.finalizado_en ? ` — ${horaCorta(jornadaSeleccionada.finalizado_en)}` : ''}</Popup>
              </Marker>
            )}
            {/* El recorrido en naranja, por encima del mapa: con un solo punto
                igual se ve el tramo de ida y vuelta. Los puntos intermedios se
                marcan para saber por dónde pasó y a qué hora. */}
            {trazo.length > 1 && (
              <Polyline
                positions={trazo}
                pathOptions={{ color: '#FF842A', weight: 5, opacity: 0.9 }}
              />
            )}
            {puntosRecorrido.map((p, i) => (
              <CircleMarker
                key={`${p.lat}-${p.lng}-${i}`}
                center={[p.lat, p.lng]}
                radius={4}
                pathOptions={{ color: '#FF842A', fillColor: '#FF842A', fillOpacity: 1, weight: 1 }}
              >
                <Popup>Pasó por aquí — {horaCorta(p.registrado_en)}</Popup>
              </CircleMarker>
            ))}
          </>
        )}
      </MapContainer>

      <LeyendaMapa items={itemsLeyenda} nota={notaLeyenda} />
    </MapaShell>
  );
}
