import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
}: {
  activas?: Jornada[];
  recorrido?: JornadaRecorrido | null;
}) {
  const [capa, setCapa] = useState<CapaMapa>('calle');

  const puntosRecorrido = recorrido?.puntos ?? [];
  const jornadaSeleccionada = recorrido?.jornada ?? null;

  const centro: [number, number] =
    jornadaSeleccionada
      ? [jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio]
      : activas[0]
      ? [activas[0].ultima_ubicacion?.lat ?? activas[0].lat_inicio, activas[0].ultima_ubicacion?.lng ?? activas[0].lng_inicio]
      : [-15.8402, -70.0219]; // Juliaca, fallback

  const zoom = jornadaSeleccionada ? 15 : 13;
  const claveRecentrado = jornadaSeleccionada ? `jornada-${jornadaSeleccionada.id}` : `vivo-${activas.length > 0 ? 'con-datos' : 'sin-datos'}`;

  return (
    <div className="rounded-xl overflow-hidden border border-ld relative isolate" style={{ height: 480 }}>
      <div className="absolute top-2 right-2 z-[1000] flex bg-white dark:bg-dark rounded-lg shadow-md overflow-hidden border border-ld">
        <button
          type="button"
          className={`px-3 py-1.5 text-xs font-medium ${capa === 'calle' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
          onClick={() => setCapa('calle')}
        >
          Calle
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 text-xs font-medium ${capa === 'satelite' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
          onClick={() => setCapa('satelite')}
        >
          Satélite
        </button>
      </div>

      <MapContainer center={centro} zoom={zoom} maxZoom={21} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={CAPAS[capa].attribution} url={CAPAS[capa].url} maxZoom={21} />
        <RecentrarMapa centro={centro} zoom={zoom} clave={claveRecentrado} />

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
            {puntosRecorrido.length > 0 && (
              <Polyline
                positions={[
                  [jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio],
                  ...puntosRecorrido.map((p) => [p.lat, p.lng] as [number, number]),
                  ...(jornadaSeleccionada.lat_fin != null && jornadaSeleccionada.lng_fin != null
                    ? [[jornadaSeleccionada.lat_fin, jornadaSeleccionada.lng_fin] as [number, number]]
                    : []),
                ]}
                pathOptions={{ color: '#5d87ff', weight: 4, opacity: 0.8 }}
              />
            )}
          </>
        )}
      </MapContainer>

      <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1.5 rounded-lg border border-ld bg-white dark:bg-dark px-3 py-2 text-xs shadow-md">
        {!jornadaSeleccionada && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#10B981' }} />
            <span className="text-muted-foreground">Vendedor en ruta</span>
          </div>
        )}
        {jornadaSeleccionada && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#5d87ff' }} />
              <span className="text-muted-foreground">Inicio</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#64748B' }} />
              <span className="text-muted-foreground">Fin</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
