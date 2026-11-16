import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import {
  AjustarTamanoMapa,
  BOTON,
  ControlesCapa,
  ControlesZoom,
  LeyendaMapa,
  MapaShell,
  type ItemLeyenda,
} from 'src/components/shared/mapa/ControlesMapa';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';
import type { Mufa, TrazadoPunto } from 'src/lib/mufas';
import { metrosEnTexto } from 'src/lib/coordenadas';
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
// Hasta donde Esri tiene imagen de verdad. Si en alguna zona el cartel
// de "Map data not yet available" aparece antes de llegar aca, hay que
// bajar este numero: es el unico sitio donde se decide.
const MAX_ZOOM_SATELITE = 18;
const MAX_ZOOM_CALLE = 21;

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

/**
 * Al entrar en el modo de colocar, el punto nace en el centro del mapa.
 *
 * Antes habia que acertarle con el toque y lo unico que se podia hacer si
 * caia mal era borrar y repetir. Ahora nace en el medio del recuadro y se
 * arrastra hasta su sitio con el boton de mover, que es mas facil de afinar
 * que un toque: se ve el punto moverse mientras se busca.
 *
 * El servidor no pasa por aca a proposito: ya esta puesto casi siempre, y
 * colocarlo solo por pulsar el boton lo movaria de sitio sin querer.
 */
function ColocarEnElCentro({
  modo,
  onColocar,
}: {
  modo: 'servidor' | 'mufa' | 'caja' | null;
  onColocar: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (modo !== 'mufa' && modo !== 'caja') return;
    const c = map.getCenter();
    onColocar(c.lat, c.lng);
    // onColocar cambia el modo a null en cuanto corre, asi que esto pasa una
    // sola vez por cada vez que se enciende el modo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);
  return null;
}

/**
 * Tope de zoom segun la capa.
 *
 * El satelite gratuito de Esri no tiene imagen a maximo detalle en todas
 * partes: pasado su nivel, los tiles que devuelve son un cartel de "Map data
 * not yet available". Queda feo y no sirve para nada, asi que el mapa no deja
 * llegar ahi cuando se esta en satelite, y en calle sigue acercando como
 * siempre. El tope se aplica al mapa entero (no solo a la capa) porque el
 * limite de MapContainer se fija al montar y no cambia solo.
 */
function LimiteDeZoom({ max }: { max: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(max);
    if (map.getZoom() > max) map.setZoom(max);
  }, [map, max]);
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
  onCambiarModo,
  puedeGestionar = true,
  dibujandoTrazadoMufa,
  puntosTrazado = [],
  onAgregarPuntoTrazado,
  onMoverServidor,
  onMoverMufa,
  onMoverCaja,
  alto = 560,
}: {
  serverLat: number | null;
  serverLng: number | null;
  mufas: Mufa[];
  cajas?: CajaNap[];
  onMufaClick: (mufa: Mufa) => void;
  modoColocar: 'servidor' | 'mufa' | 'caja' | null;
  onColocarPin: (lat: number, lng: number) => void;
  /** Botones de "Marcar/Reubicar servidor" y "Agregar mufa" dentro del propio
   * mapa — así siguen a mano cuando el mapa entra en pantalla completa, donde
   * los botones de la cabecera de la tarjeta (fuera de este componente) ya
   * no son alcanzables. Si no se pasa, esos botones simplemente no se pintan
   * (por ejemplo, mapas de solo lectura). */
  onCambiarModo?: (modo: 'servidor' | 'mufa' | null) => void;
  puedeGestionar?: boolean;
  /** Mientras no sea null, cada click en el mapa agrega un punto al trazado
   * en vez de disparar onColocarPin — es un modo de "dibujar línea", no de
   * "un solo click y listo" como los demás. */
  dibujandoTrazadoMufa?: Mufa | null;
  puntosTrazado?: TrazadoPunto[];
  onAgregarPuntoTrazado?: (lat: number, lng: number) => void;
  /** Corregir el sitio de algo que ya está puesto, arrastrándolo. Si no se
   * pasan, el botón de mover no aparece y nada se puede arrastrar. */
  onMoverServidor?: (lat: number, lng: number) => void;
  onMoverMufa?: (mufa: Mufa, lat: number, lng: number) => void;
  onMoverCaja?: (caja: CajaNap, lat: number, lng: number) => void;
  /** Alto del mapa en píxeles — la pantalla decide cuánto espacio darle */
  alto?: number;
}) {
  const [capa, setCapa] = useState<CapaMapa>('calle');
  /** Arrastrar está apagado por defecto: si todo fuera arrastrable siempre,
   *  un gesto de paneo que empiece encima de una caja la movería de sitio sin
   *  querer. Se enciende a propósito y se apaga al terminar. */
  const [modoMover, setModoMover] = useState(false);

  const puedeMover = Boolean(
    puedeGestionar && (onMoverServidor || onMoverMufa || onMoverCaja) && !dibujandoTrazadoMufa,
  );
  const arrastrando = puedeMover && modoMover && !modoColocar;
  const topeZoom = capa === 'satelite' ? MAX_ZOOM_SATELITE : MAX_ZOOM_CALLE;

  const centro: [number, number] =
    serverLat != null && serverLng != null
      ? [serverLat, serverLng]
      : mufas[0]?.lat != null && mufas[0]?.lng != null
      ? [mufas[0].lat!, mufas[0].lng!]
      : [-12.0464, -77.0428]; // Lima, fallback si no hay nada ubicado todavía

  /** Solo se nombra lo que de verdad está en el mapa. */
  const itemsLeyenda: ItemLeyenda[] = [
    ...(serverLat != null ? [{ color: '#5d87ff', texto: 'Servidor' }] : []),
    ...(mufas.length > 0 ? [{ color: '#8754ec', texto: 'Mufa' }] : []),
    ...(cajas.length > 0 ? [{ color: '#13deb9', texto: 'Caja NAP' }] : []),
  ];

  function handleMapClick(lat: number, lng: number) {
    if (dibujandoTrazadoMufa) {
      onAgregarPuntoTrazado?.(lat, lng);
      return;
    }
    if (!modoColocar) return;
    onColocarPin(lat, lng);
  }

  return (
    // isolate: los panes internos de Leaflet usan z-index hasta 700 — sin esto
    // se montan por encima de los Dialog (z-50) que abren "Nueva mufa"/"Nueva
    // caja NAP" sobre este mismo mapa, tapándolos o mezclándose con ellos.
    <MapaShell alto={alto}>
      {dibujandoTrazadoMufa ? (
        <div className="bg-lightinfo text-info text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:route" height={16} />
          Toca las cajas NAP en el orden en que las une el cable — o un punto libre del mapa
          para un tramo intermedio ({puntosTrazado.length} punto
          {puntosTrazado.length !== 1 ? 's' : ''})
        </div>
      ) : modoColocar === 'servidor' ? (
        <div className="bg-lightprimary text-primary text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:map-pin" height={16} />
          Toca el mapa para marcar dónde está el servidor
        </div>
      ) : arrastrando ? (
        <div className="bg-lightwarning text-warning text-sm font-medium px-3 py-2 flex items-center gap-2">
          <Icon icon="tabler:drag-drop" height={16} />
          Arrastra el servidor, las mufas o las cajas para corregir su sitio — se guarda al soltar
        </div>
      ) : null}

      <ControlesCapa
        valor={capa}
        onChange={setCapa}
        opciones={[
          { valor: 'calle', etiqueta: 'Calle' },
          { valor: 'satelite', etiqueta: 'Satélite' },
        ] as const}
      />

      {((onCambiarModo && puedeGestionar) || puedeMover) && !dibujandoTrazadoMufa && (
        <div className="absolute right-3 top-14 z-[1000] flex flex-col overflow-hidden rounded-xl border border-ld bg-card/95 shadow-md backdrop-blur-sm">
          {onCambiarModo && puedeGestionar && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModoMover(false);
                  onCambiarModo(modoColocar === 'servidor' ? null : 'servidor');
                }}
                aria-label={serverLat != null ? 'Reubicar servidor' : 'Marcar servidor'}
                title={serverLat != null ? 'Reubicar servidor' : 'Marcar servidor'}
                aria-pressed={modoColocar === 'servidor'}
                className={`${BOTON} ${modoColocar === 'servidor' ? '!bg-primary !text-white hover:!bg-primary' : ''}`}
              >
                <Icon icon="tabler:server-2" width={16} />
              </button>
              <span className="h-px bg-border" />
              <button
                type="button"
                onClick={() => {
                  setModoMover(false);
                  onCambiarModo(modoColocar === 'mufa' ? null : 'mufa');
                }}
                aria-label="Agregar mufa"
                title="Agregar mufa"
                aria-pressed={modoColocar === 'mufa'}
                className={`${BOTON} ${modoColocar === 'mufa' ? '!bg-primary !text-white hover:!bg-primary' : ''}`}
              >
                <Icon icon="tabler:plus" width={16} />
              </button>
            </>
          )}
          {puedeMover && (
            <>
              <span className="h-px bg-border" />
              <button
                type="button"
                onClick={() => setModoMover((v) => !v)}
                aria-label={modoMover ? 'Dejar de mover' : 'Mover lo que ya está puesto'}
                title={modoMover ? 'Dejar de mover' : 'Mover lo que ya está puesto'}
                aria-pressed={modoMover}
                className={`${BOTON} ${modoMover ? '!bg-warning !text-white hover:!bg-warning' : ''}`}
              >
                <Icon icon="tabler:drag-drop" width={16} />
              </button>
            </>
          )}
        </div>
      )}

      <MapContainer
        center={centro}
        zoom={15}
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
        <ClickHandler onClick={handleMapClick} />
        <AjustarTamanoMapa />
        <ControlesZoom volverA={{ centro, zoom: 15 }} />
        <LimiteDeZoom max={topeZoom} />
        <ColocarEnElCentro modo={modoColocar} onColocar={onColocarPin} />

        {serverLat != null && serverLng != null && (
          <Marker
              riseOnHover
            position={[serverLat, serverLng]}
            icon={serverIcon}
            draggable={arrastrando && !!onMoverServidor}
            eventHandlers={
              dibujandoTrazadoMufa
                ? { click: () => onAgregarPuntoTrazado?.(serverLat, serverLng) }
                : arrastrando && onMoverServidor
                ? {
                    dragend: (e) => {
                      const p = (e.target as L.Marker).getLatLng();
                      onMoverServidor(p.lat, p.lng);
                    },
                  }
                : undefined
            }
          >
            {!dibujandoTrazadoMufa && (
              <Popup>
                <b>Servidor de fibra</b>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {serverLat.toFixed(6)}, {serverLng.toFixed(6)}
                </div>
              </Popup>
            )}
          </Marker>
        )}

        {mufas
          .filter((m) => m.lat != null && m.lng != null)
          .map((m) => (
            <Marker
              riseOnHover
              key={m.id}
              position={[m.lat!, m.lng!]}
              icon={mufaIcon}
              draggable={arrastrando && !!onMoverMufa}
              eventHandlers={
                dibujandoTrazadoMufa
                  ? { click: () => onAgregarPuntoTrazado?.(m.lat!, m.lng!) }
                  : arrastrando && onMoverMufa
                  ? {
                      dragend: (e) => {
                        const p = (e.target as L.Marker).getLatLng();
                        onMoverMufa(m, p.lat, p.lng);
                      },
                    }
                  : undefined
              }
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
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {m.lat!.toFixed(6)}, {m.lng!.toFixed(6)}
                    </span>
                    <Button size="sm" className="mt-1" onClick={() => onMufaClick(m)}>
                      Ver cajas
                    </Button>
                  </div>
                </Popup>
              )}
            </Marker>
          ))}

        {/* Las corridas de cada mufa, cada una con el color que le pusieron.
            Línea entera y no de puntos: así se parecen al plano del
            ingeniero, que es con el que se compara en campo. */}
        {mufas.flatMap((m) =>
          (m.corridas ?? [])
            .filter((c) => c.trazado && c.trazado.length > 1)
            .map((c) => (
              <Polyline
                key={`corrida-${c.id}`}
                positions={c.trazado!.map((p) => [p.lat, p.lng] as [number, number])}
                pathOptions={{ color: c.color, weight: 4, opacity: 0.9 }}
              >
                <Tooltip sticky>
                  <b>{c.nombre}</b>
                  {c.metros != null && ` · ${metrosEnTexto(c.metros)}`}
                  <div className="text-[11px] opacity-70">mufa {m.codigo}</div>
                </Tooltip>
              </Polyline>
            )),
        )}

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
              riseOnHover
              key={c.id}
              position={[c.lat!, c.lng!]}
              icon={cajaIcon}
              draggable={arrastrando && !!onMoverCaja}
              eventHandlers={
                dibujandoTrazadoMufa
                  ? { click: () => onAgregarPuntoTrazado?.(c.lat!, c.lng!) }
                  : arrastrando && onMoverCaja
                  ? {
                      dragend: (e) => {
                        const p = (e.target as L.Marker).getLatLng();
                        onMoverCaja(c, p.lat, p.lng);
                      },
                    }
                  : undefined
              }
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
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {c.lat!.toFixed(6)}, {c.lng!.toFixed(6)}
                    </span>
                  </div>
                </Popup>
              )}
            </Marker>
          ))}

      </MapContainer>

      <LeyendaMapa items={itemsLeyenda} />
    </MapaShell>
  );
}
