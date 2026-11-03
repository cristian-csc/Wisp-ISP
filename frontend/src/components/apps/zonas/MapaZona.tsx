import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';
import type { Mufa, TrazadoPunto } from 'src/lib/mufas';
import type { CajaNap } from 'src/lib/cajasnap';

// Fix del ícono default de Leaflet: con bundlers como Vite las rutas
// relativas a los PNG no resuelven solas, hay que apuntarlas a mano.
const serverIcon = L.divIcon({
  html: `<div style="position:relative;width:30px;height:30px;">
    <div style="position:absolute;inset:-7px;border-radius:50%;background:rgba(93,135,255,0.35);animation:napServerPulse 2s ease-out infinite;"></div>
    <div style="position:relative;background:#5d87ff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M4 1h16a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm0 10h16a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6a1 1 0 011-1zm2 2v2h2v-2H6zm0-9v2h2V4H6z"/></svg>
    </div>
    <style>@keyframes napServerPulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }</style>
  </div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const mufaIcon = L.divIcon({
  html: `<div style="background:#8754ec;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:11px;font-weight:800">M</div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const cajaIcon = L.divIcon({
  html: `<div style="background:#13deb9;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:9px;font-weight:800">N</div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Esri no tiene imagen satelital en máxima resolución para todas las zonas
// rurales — sin este tope, al acercar el zoom más allá de lo que Esri cubre
// ahí, muestra un tile con "Map data not yet available for this region".
// Con maxNativeZoom, Leaflet sigue dejando acercar (maxZoom) pero escala el
// último nivel de tile real en vez de pedir uno que no existe.
const MAX_NATIVE_ZOOM_SATELITE = 18;
const MAX_ZOOM_MAPA = 21;

type PinPendiente = { lat: number; lng: number } | null;
type CapaMapa = 'calle' | 'satelite';

const CAPAS: Record<CapaMapa, { url: string; attribution: string }> = {
  calle: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satelite: {
    // Esri World Imagery — gratis, sin API key.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapaZona({
  serverLat,
  serverLng,
  mufas,
  cajas = [],
  onMufaClick,
  modoColocar,
  onColocarPin,
  dibujandoTrazadoMufa,
  puntosTrazado = [],
  onAgregarPuntoTrazado,
}: {
  serverLat: number | null;
  serverLng: number | null;
  mufas: Mufa[];
  cajas?: CajaNap[];
  onMufaClick: (mufa: Mufa) => void;
  modoColocar: 'servidor' | 'mufa' | 'caja' | null;
  onColocarPin: (lat: number, lng: number) => void;
  /** Mientras no sea null, cada click en el mapa agrega un punto al trazado
   * en vez de disparar onColocarPin — es un modo de "dibujar línea", no de
   * "un solo click y listo" como los demás. */
  dibujandoTrazadoMufa?: Mufa | null;
  puntosTrazado?: TrazadoPunto[];
  onAgregarPuntoTrazado?: (lat: number, lng: number) => void;
}) {
  const [pinTemporal, setPinTemporal] = useState<PinPendiente>(null);
  const [capa, setCapa] = useState<CapaMapa>('calle');

  const centro: [number, number] =
    serverLat != null && serverLng != null
      ? [serverLat, serverLng]
      : mufas[0]?.lat != null && mufas[0]?.lng != null
      ? [mufas[0].lat!, mufas[0].lng!]
      : [-12.0464, -77.0428]; // Lima, fallback si no hay nada ubicado todavía

  function handleMapClick(lat: number, lng: number) {
    if (dibujandoTrazadoMufa) {
      onAgregarPuntoTrazado?.(lat, lng);
      return;
    }
    if (!modoColocar) return;
    setPinTemporal({ lat, lng });
    onColocarPin(lat, lng);
  }

  return (
    // isolate: los panes internos de Leaflet usan z-index hasta 700 — sin esto
    // se montan por encima de los Dialog (z-50) que abren "Nueva mufa"/"Nueva
    // caja NAP" sobre este mismo mapa, tapándolos o mezclándose con ellos.
    <div className="rounded-xl overflow-hidden border border-ld relative isolate" style={{ height: 480 }}>
      {dibujandoTrazadoMufa ? (
        <div className="bg-lightinfo text-info text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:route" height={16} />
          Toca el servidor, las mufas o cajas NAP en orden para unirlas — o toca un punto libre del mapa para un tramo intermedio ({puntosTrazado.length} punto{puntosTrazado.length !== 1 ? 's' : ''})
        </div>
      ) : modoColocar && (
        <div className="bg-lightprimary text-primary text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:map-pin" height={16} />
          Toca el mapa para marcar{' '}
          {modoColocar === 'servidor' ? 'dónde está el servidor' : modoColocar === 'mufa' ? 'la ubicación de la mufa' : 'la ubicación de la caja NAP'}
        </div>
      )}

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

      <MapContainer center={centro} zoom={15} maxZoom={MAX_ZOOM_MAPA} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution={CAPAS[capa].attribution}
          url={CAPAS[capa].url}
          maxNativeZoom={capa === 'satelite' ? MAX_NATIVE_ZOOM_SATELITE : 19}
          maxZoom={MAX_ZOOM_MAPA}
        />
        <ClickHandler onClick={handleMapClick} />

        {serverLat != null && serverLng != null && (
          <Marker
            position={[serverLat, serverLng]}
            icon={serverIcon}
            eventHandlers={dibujandoTrazadoMufa ? { click: () => onAgregarPuntoTrazado?.(serverLat, serverLng) } : undefined}
          >
            {!dibujandoTrazadoMufa && (
              <Popup>
                <b>Servidor de fibra</b>
              </Popup>
            )}
          </Marker>
        )}

        {mufas
          .filter((m) => m.lat != null && m.lng != null)
          .map((m) => (
            <Marker
              key={m.id}
              position={[m.lat!, m.lng!]}
              icon={mufaIcon}
              eventHandlers={dibujandoTrazadoMufa ? { click: () => onAgregarPuntoTrazado?.(m.lat!, m.lng!) } : undefined}
            >
              {!dibujandoTrazadoMufa && (
                <Popup>
                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info/10 text-info text-xs font-bold">M</span>
                      <b className="text-sm">{m.codigo}</b>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full bg-lightinfo text-info text-[11px] font-medium px-2 py-0.5">
                      {m.total_cajas} caja{m.total_cajas === 1 ? '' : 's'} NAP
                    </span>
                    {m.descripcion && <span className="text-xs text-muted-foreground">{m.descripcion}</span>}
                    <Button size="sm" className="mt-1" onClick={() => onMufaClick(m)}>
                      Ver cajas
                    </Button>
                  </div>
                </Popup>
              )}
            </Marker>
          ))}

        {mufas
          .filter((m) => m.trazado && m.trazado.length > 1)
          .map((m) => (
            <Polyline
              key={`trazado-${m.id}`}
              positions={m.trazado!.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: '#8754ec', weight: 3, dashArray: '6 6' }}
            />
          ))}

        {dibujandoTrazadoMufa && puntosTrazado.length > 0 && (
          <Polyline
            positions={puntosTrazado.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#5d87ff', weight: 3, dashArray: '4 8' }}
          />
        )}

        {cajas
          .filter((c) => c.lat != null && c.lng != null)
          .map((c) => (
            <Marker
              key={c.id}
              position={[c.lat!, c.lng!]}
              icon={cajaIcon}
              eventHandlers={dibujandoTrazadoMufa ? { click: () => onAgregarPuntoTrazado?.(c.lat!, c.lng!) } : undefined}
            >
              {!dibujandoTrazadoMufa && (
                <Popup>
                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-success/10 text-success text-xs font-bold">N</span>
                      <b className="text-sm">{c.codigo}</b>
                    </div>
                    {(() => {
                      const libres = c.bornes.filter((b) => b.estado === 'libre').length;
                      return (
                        <span className={`inline-flex w-fit items-center rounded-full text-[11px] font-medium px-2 py-0.5 ${libres > 0 ? 'bg-lightsuccess text-success' : 'bg-lighterror text-error'}`}>
                          {libres} borne{libres === 1 ? '' : 's'} libre{libres === 1 ? '' : 's'}
                        </span>
                      );
                    })()}
                  </div>
                </Popup>
              )}
            </Marker>
          ))}

        {pinTemporal && (
          <Marker position={[pinTemporal.lat, pinTemporal.lng]}>
            <Popup>Nueva ubicación (sin guardar)</Popup>
          </Marker>
        )}
      </MapContainer>

      {(serverLat != null || mufas.length > 0 || cajas.length > 0) && (
        <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1.5 rounded-lg border border-ld bg-white dark:bg-dark px-3 py-2 text-xs shadow-md">
          {serverLat != null && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#5d87ff' }} />
              <span className="text-muted-foreground">Servidor</span>
            </div>
          )}
          {mufas.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#8754ec' }} />
              <span className="text-muted-foreground">Mufa</span>
            </div>
          )}
          {cajas.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: '#13deb9' }} />
              <span className="text-muted-foreground">Caja NAP</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
