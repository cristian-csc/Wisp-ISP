import { COLORS } from '@/theme/colors';

export type ClientePin = { lat: number; lng: number; nombre: string };

/** Lo que el mapa necesita saber de una mufa. */
export type MufaMapa = { lat: number | null; lng: number | null; codigo: string; total_cajas: number };

/** Lo que el mapa necesita saber de una caja NAP. */
export type CajaMapa = {
  lat: number | null;
  lng: number | null;
  codigo: string;
  bornes: { estado: string }[];
};

/** Hasta dónde se puede estirar el drop desde una caja NAP, en metros. Es el
 *  criterio práctico de "¿acá hay cobertura?" que usa la vendedora; si la
 *  empresa trabaja con otra distancia, se cambia este número. */
export const RADIO_COBERTURA_M = 150;

export function buildMapHtml(
  mufas: MufaMapa[],
  cajas: CajaMapa[],
  clientePin: ClientePin | null,
  cobertura: boolean,
  radioM: number,
): string {
  const mufaMarcadores = mufas
    .filter((m) => m.lat != null && m.lng != null)
    .map((m) => ({ lat: m.lat, lng: m.lng, codigo: m.codigo, cajas: m.total_cajas }));

  const cajaMarcadores = cajas
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({
      lat: c.lat,
      lng: c.lng,
      codigo: c.codigo,
      libres: c.bornes.filter((b) => b.estado === 'libre').length,
      total: c.bornes.length,
    }));

  const centro =
    clientePin ??
    (cajaMarcadores[0]
      ? { lat: cajaMarcadores[0].lat, lng: cajaMarcadores[0].lng }
      : mufaMarcadores[0]
        ? { lat: mufaMarcadores[0].lat, lng: mufaMarcadores[0].lng }
        : { lat: -15.4997, lng: -70.1333 }); // Juliaca, por si todavía no hay nada cargado

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
    .leyenda { position: absolute; bottom: 10px; right: 10px; z-index: 1000; background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.25); padding: 8px 10px; font-family: sans-serif; font-size: 11px; color: #334155; line-height: 1.7; }
    .leyenda i { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="capa-toggle">
    <button id="btnCalle" class="activo" onclick="cambiarCapa('calle')">Calle</button>
    <button id="btnSatelite" onclick="cambiarCapa('satelite')">Satélite</button>
  </div>
  ${
    cobertura
      ? `<div class="leyenda">
    <div><i style="background:${COLORS.success}"></i>Con bornes libres</div>
    <div><i style="background:${COLORS.error}"></i>Caja llena</div>
    <div style="color:#64748B">Círculo = ${radioM} m de alcance</div>
  </div>`
      : ''
  }
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
    const cajaLlenaIcon = L.divIcon({
      html: '<div style="background:${COLORS.error};width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:10px;font-weight:800">N</div>',
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

    const conCobertura = ${cobertura ? 'true' : 'false'};
    const radio = ${radioM};
    const cajas = ${JSON.stringify(cajaMarcadores)};
    cajas.forEach(function(c) {
      const hayCupo = c.libres > 0;
      if (conCobertura) {
        // El alcance se dibuja antes que el pin para que el pin quede encima
        L.circle([c.lat, c.lng], {
          radius: radio,
          color: hayCupo ? '${COLORS.success}' : '${COLORS.error}',
          weight: 1.5,
          fillColor: hayCupo ? '${COLORS.success}' : '${COLORS.error}',
          fillOpacity: hayCupo ? 0.14 : 0.07,
        }).addTo(map);
      }
      L.marker([c.lat, c.lng], { icon: hayCupo || !conCobertura ? cajaIcon : cajaLlenaIcon }).addTo(map)
        .bindPopup(
          '<b>' + c.codigo + '</b><br/>' +
          (hayCupo
            ? c.libres + ' de ' + c.total + ' bornes libres<br/><b style="color:${COLORS.success}">Se puede instalar</b>'
            : 'Sin bornes libres (' + c.total + ' ocupados)<br/><b style="color:${COLORS.error}">No se puede instalar</b>')
        );
    });

    const clientePunto = ${clientePin ? `[${clientePin.lat}, ${clientePin.lng}]` : 'null'};
    ${clientePin ? `L.marker(clientePunto, { icon: clienteIcon }).addTo(map).bindPopup('<b>${nombreSeguro}</b><br/>Cliente a instalar').openPopup();` : ''}

    // Se llama desde React (injectJavaScript) cada vez que llega una nueva
    // lectura del GPS mientras se camina — mueve el marcador sin recargar el
    // mapa ni perder el zoom/paneo que haya hecho el usuario.
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
