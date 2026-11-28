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
import {
  procesarRecorrido,
  formatearDistancia,
  type PuntoRecorrido,
} from 'src/lib/recorrido';

// Colores del recorrido. El naranja corporativo WISP se reserva para botones y
// navegación; el trazado usa una gama turquesa para que se lea como un dato de
// campo y no como un elemento de la interfaz.
const COLOR = {
  recorrido: '#0E7490', // turquesa — tramo caminado con evidencia GPS
  punto: '#0891B2',     // turquesa claro — cada punto registrado
  estimado: '#6366F1',  // violeta azulado — recorrido estimado por calles
  inicio: '#16A34A',    // verde — inicio de jornada
  fin: '#DC2626',       // rojo — fin de jornada
  reciente: '#0891B2',  // turquesa — última ubicación recibida
  sinDatos: '#9CA3AF',  // gris — tramo sin información
};

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

/** Marcador turquesa con pulso — la ubicación más reciente (en vivo o el
 *  último punto de una jornada activa). */
const recienteIcon = L.divIcon({
  html: `<div style="position:relative;width:26px;height:26px;">
    <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(8,145,178,0.30);animation:jornadaPulse 2s ease-out infinite;"></div>
    <div style="position:relative;background:${COLOR.reciente};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 2a5 5 0 110 10 5 5 0 010-10zm0 12c4.97 0 9 2.24 9 5v1H3v-1c0-2.76 4.03-5 9-5z"/></svg>
    </div>
    <style>@keyframes jornadaPulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }</style>
  </div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function puntoIcon(color: string) {
  return L.divIcon({
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.35);"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const inicioIcon = puntoIcon(COLOR.inicio);
const finIcon = puntoIcon(COLOR.fin);

// Hasta donde Esri tiene foto de verdad en Puno. Medido pidiendo los tiles de
// Juliaca, de una zona rural al noroeste, de Capachica y de Pucara: de z15 a
// z17 pesan entre 12 y 30 KB (foto) y de z18 en adelante pesan 2.5 KB en los
// cuatro sitios, que es el cartel gris de "Map data not yet available". Esri
// lo sirve como un JPEG valido, por eso Leaflet lo pinta en vez de fallar.
// El mismo numero esta en el mapa de la ficha de zona.
const MAX_ZOOM_SATELITE = 17;
const MAX_ZOOM_CALLE = 21;

type CapaMapa = 'calle' | 'satelite';
type ModoRecorrido = 'reales' | 'estimado';

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

function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function duracionTexto(desde: string, hasta: string | null): string {
  const fin = hasta ? new Date(hasta).getTime() : Date.now();
  const ms = fin - new Date(desde).getTime();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  return horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
}

/** Tope de zoom segun la capa: en satelite no se deja pasar de donde Esri
 *  tiene imagen, y si se venia mas cerca desde calle, se aleja hasta el tope. */
function LimiteDeZoom({ max }: { max: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(max);
    if (map.getZoom() > max) map.setZoom(max);
  }, [map, max]);
  return null;
}

/** Una celda de la barra de información del recorrido. */
function DatoRecorrido({ etiqueta, valor, titulo, acento }: {
  etiqueta: string; valor: string; titulo?: string; acento?: boolean;
}) {
  return (
    <div className="flex flex-col" title={titulo}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <span className={`text-sm font-semibold ${acento ? 'text-warning-text' : ''}`}>{valor}</span>
    </div>
  );
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
  const [modo, setModo] = useState<ModoRecorrido>('reales');

  const puntosRecorrido = recorrido?.puntos ?? [];
  const jornadaSeleccionada = recorrido?.jornada ?? null;
  const activa = jornadaSeleccionada?.estado === 'activa';

  // Puntos con su hora real, listos para limpiar y partir en segmentos. El
  // inicio y el fin de la jornada son anclas con hora propia.
  const entrada: PuntoRecorrido[] = jornadaSeleccionada
    ? [
        {
          lat: jornadaSeleccionada.lat_inicio,
          lng: jornadaSeleccionada.lng_inicio,
          t: Date.parse(jornadaSeleccionada.iniciado_en),
          tipo: 'inicio',
          i: -1,
        },
        ...puntosRecorrido.map((p, idx): PuntoRecorrido => ({
          lat: p.lat,
          lng: p.lng,
          t: Date.parse(p.registrado_en),
          tipo: 'punto',
          i: idx,
        })),
        ...(jornadaSeleccionada.lat_fin != null && jornadaSeleccionada.lng_fin != null
          ? [
              {
                lat: jornadaSeleccionada.lat_fin,
                lng: jornadaSeleccionada.lng_fin,
                t: Date.parse(jornadaSeleccionada.finalizado_en ?? jornadaSeleccionada.iniciado_en),
                tipo: 'fin' as const,
                i: Number.MAX_SAFE_INTEGER,
              },
            ]
          : []),
      ]
    : [];

  const procesado = procesarRecorrido(entrada);
  const distanciaTexto = formatearDistancia(procesado.metros);

  // Puntos intermedios reales (ni inicio ni fin). El último, en una jornada
  // activa, es la "ubicación reciente" y se destaca aparte.
  const intermedios = procesado.puntos.filter((p) => p.tipo === 'punto');
  const reciente = activa ? intermedios[intermedios.length - 1] : undefined;
  const huecosTiempo = procesado.huecos.filter((h) => h.razon === 'tiempo');
  const nPuntosGps = intermedios.length;
  const atenuar = modo === 'estimado';

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
        { color: COLOR.inicio, texto: 'Inicio' },
        ...(jornadaSeleccionada.lat_fin != null ? [{ color: COLOR.fin, texto: 'Fin' }] : []),
        { color: COLOR.punto, texto: 'Puntos GPS' },
        { color: COLOR.recorrido, texto: `Recorrido · ${distanciaTexto}`, linea: true },
        ...(huecosTiempo.length > 0 ? [{ color: COLOR.sinDatos, texto: 'Tramo sin datos', linea: true }] : []),
        ...(modo === 'estimado' ? [{ color: COLOR.estimado, texto: 'Recorrido estimado (pendiente)', linea: true }] : []),
      ]
    : [{ color: COLOR.reciente, texto: 'Ubicación reciente' }];

  const notaLeyenda = jornadaSeleccionada
    ? nPuntosGps === 0
      ? 'Sin puntos intermedios: solo inicio y fin'
      : `${nPuntosGps} punto${nPuntosGps === 1 ? '' : 's'} GPS registrado${nPuntosGps === 1 ? '' : 's'}`
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {jornadaSeleccionada && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-ld bg-muted/40 px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              activa ? 'bg-lightsuccess text-success-text' : 'bg-lightsecondary text-secondary'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${activa ? 'animate-pulse bg-success' : 'bg-muted-foreground'}`} />
            {activa ? 'En curso' : 'Finalizada'}
          </span>
          <DatoRecorrido etiqueta="Fecha" valor={fechaCorta(jornadaSeleccionada.iniciado_en)} />
          <DatoRecorrido etiqueta="Inicio" valor={horaCorta(jornadaSeleccionada.iniciado_en)} />
          <DatoRecorrido
            etiqueta="Fin"
            valor={jornadaSeleccionada.finalizado_en ? horaCorta(jornadaSeleccionada.finalizado_en) : '—'}
          />
          <DatoRecorrido
            etiqueta="Duración"
            valor={duracionTexto(jornadaSeleccionada.iniciado_en, jornadaSeleccionada.finalizado_en)}
          />
          <DatoRecorrido etiqueta="Puntos GPS" valor={String(nPuntosGps)} />
          <DatoRecorrido
            etiqueta="Distancia aprox."
            valor={distanciaTexto}
            titulo="En línea recta (Haversine) entre puntos válidos; no cruza tramos sin datos."
          />
          {huecosTiempo.length > 0 && (
            <DatoRecorrido
              etiqueta="Tramos sin datos"
              valor={String(huecosTiempo.length)}
              acento
              titulo="Lapsos sin registro GPS; no se dibuja línea por esos tramos."
            />
          )}
          <DatoRecorrido
            etiqueta={activa ? 'Última ubicación' : 'Último punto'}
            valor={
              jornadaSeleccionada.ultima_ubicacion
                ? horaCorta(jornadaSeleccionada.ultima_ubicacion.registrado_en)
                : intermedios.length
                ? horaCorta(new Date(intermedios[intermedios.length - 1].t).toISOString())
                : '—'
            }
          />
        </div>
      )}

      <MapaShell alto={alto}>
        <ControlesCapa
          valor={capa}
          onChange={setCapa}
          opciones={[
            { valor: 'calle', etiqueta: 'Calle' },
            { valor: 'satelite', etiqueta: 'Satélite' },
          ] as const}
        />

        {/* Selector de modo: solo tiene sentido viendo un recorrido. */}
        {jornadaSeleccionada && (
          <div className="absolute right-3 top-14 z-[1000] flex overflow-hidden rounded-xl border border-ld bg-card/95 shadow-md backdrop-blur-sm">
            {([
              { valor: 'reales' as const, etiqueta: 'Puntos GPS' },
              { valor: 'estimado' as const, etiqueta: 'Por calles' },
            ]).map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setModo(o.valor)}
                aria-pressed={modo === o.valor}
                className={`transition-ui px-3 py-1.5 text-xs font-semibold ${
                  modo === o.valor
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-lightprimary hover:text-primary-text'
                }`}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        )}

        {/* En modo "Por calles" la reconstrucción real exige un servicio de map
            matching (OSRM), que todavía no está activado. Para no mostrar un
            trazo estimado como si fuera comprobado, se avisa y se dejan los
            puntos GPS reales como referencia. */}
        {jornadaSeleccionada && modo === 'estimado' && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] w-[min(92%,420px)] -translate-x-1/2 rounded-xl border border-ld bg-card/95 px-3.5 py-2.5 text-center shadow-md backdrop-blur-sm">
            <p className="text-xs font-semibold text-foreground">Recorrido estimado por calles</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Requiere activar el servicio de rutas (OSRM), pendiente de aprobación. Debajo se muestran los puntos GPS reales como referencia.
            </p>
          </div>
        )}

        <MapContainer
          center={centro}
          zoom={zoom}
          maxZoom={MAX_ZOOM_CALLE}
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution={CAPAS[capa].attribution}
            url={CAPAS[capa].url}
            maxNativeZoom={capa === 'satelite' ? MAX_ZOOM_SATELITE : 19}
            maxZoom={capa === 'satelite' ? MAX_ZOOM_SATELITE : MAX_ZOOM_CALLE}
          />
          <LimiteDeZoom max={capa === 'satelite' ? MAX_ZOOM_SATELITE : MAX_ZOOM_CALLE} />
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
                  <Marker key={j.id} position={pos as [number, number]} icon={recienteIcon}>
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
              {/* Tramos continuos con evidencia GPS. Cada segmento es una
                  polilínea aparte: nunca se unen dos segmentos a través de un
                  hueco, así no se dibujan rectas que atraviesan manzanas. */}
              {procesado.segmentos.map((seg, idx) => (
                <Polyline
                  key={`seg-${idx}`}
                  positions={seg.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: COLOR.recorrido, weight: 5, opacity: atenuar ? 0.35 : 0.9 }}
                />
              ))}

              {/* Tramos sin datos: línea gris discontinua para que se vea que
                  ahí NO hay evidencia, en vez de dejar un salto confuso. */}
              {huecosTiempo.map((h, idx) => (
                <Polyline
                  key={`hueco-${idx}`}
                  positions={[[h.desde.lat, h.desde.lng], [h.hasta.lat, h.hasta.lng]]}
                  pathOptions={{ color: COLOR.sinDatos, weight: 2.5, opacity: 0.7, dashArray: '4 8' }}
                >
                  <Popup>Tramo sin datos — {h.minutos} min sin registro GPS</Popup>
                </Polyline>
              ))}

              {/* Puntos GPS intermedios (sin el reciente, que va destacado). */}
              {intermedios
                .filter((p) => p !== reciente)
                .map((p) => (
                  <CircleMarker
                    key={`pt-${p.i}`}
                    center={[p.lat, p.lng]}
                    radius={4}
                    pathOptions={{
                      color: COLOR.punto,
                      fillColor: COLOR.punto,
                      fillOpacity: atenuar ? 0.4 : 1,
                      opacity: atenuar ? 0.4 : 1,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <div className="flex flex-col gap-0.5 min-w-[150px]">
                        <b className="text-xs">Punto GPS</b>
                        <span className="text-xs text-muted-foreground">
                          Hora: {horaCorta(new Date(p.t).toISOString())}
                        </span>
                        <span className="text-xs text-muted-foreground">Precisión: no disponible</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

              {/* Puntos descartados por salto imposible: aparte, en gris hueco,
                  para diagnóstico — no cuentan como recorrido. */}
              {procesado.descartados.map((p) => (
                <CircleMarker
                  key={`desc-${p.i}`}
                  center={[p.lat, p.lng]}
                  radius={5}
                  pathOptions={{ color: COLOR.sinDatos, fillColor: 'transparent', weight: 2, dashArray: '2 3' }}
                >
                  <Popup>
                    <div className="flex flex-col gap-0.5 min-w-[160px]">
                      <b className="text-xs">Punto descartado</b>
                      <span className="text-xs text-muted-foreground">
                        Salto improbable — excluido del recorrido
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Hora: {horaCorta(new Date(p.t).toISOString())}
                      </span>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {/* Inicio (verde) y fin (rojo). */}
              <Marker position={[jornadaSeleccionada.lat_inicio, jornadaSeleccionada.lng_inicio]} icon={inicioIcon}>
                <Popup>Inicio — {horaCorta(jornadaSeleccionada.iniciado_en)}</Popup>
              </Marker>
              {jornadaSeleccionada.lat_fin != null && jornadaSeleccionada.lng_fin != null && (
                <Marker position={[jornadaSeleccionada.lat_fin, jornadaSeleccionada.lng_fin]} icon={finIcon}>
                  <Popup>Fin{jornadaSeleccionada.finalizado_en ? ` — ${horaCorta(jornadaSeleccionada.finalizado_en)}` : ''}</Popup>
                </Marker>
              )}

              {/* Ubicación reciente de una jornada activa: turquesa destacado. */}
              {reciente && (
                <Marker position={[reciente.lat, reciente.lng]} icon={recienteIcon}>
                  <Popup>
                    Última ubicación — {horaCorta(new Date(reciente.t).toISOString())}
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>

        <LeyendaMapa items={itemsLeyenda} nota={notaLeyenda} />
      </MapaShell>
    </div>
  );
}
