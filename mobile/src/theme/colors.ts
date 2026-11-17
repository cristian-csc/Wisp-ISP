/**
 * La paleta de la app, la misma que el panel web.
 *
 * Hasta ahora eran dos paletas distintas sin querer: el panel se actualizó a
 * un azul más oscuro (#2563eb) y a unos semánticos con mejor contraste, y la
 * app se quedó con los de antes. Abrir las dos seguidas se notaba.
 *
 * Y faltaba lo principal: el naranja de WISP no aparecía en ninguna parte
 * salvo el logo. En el panel sí vive —es el color de la barra lateral y del
 * elemento activo— así que acá hace lo mismo en la barra de abajo, que es su
 * equivalente. El naranja identifica, el azul ejecuta.
 *
 * Si se cambia algo acá, hay que cambiarlo también en
 * frontend/src/css/globals.css. Son dos archivos a propósito —uno es CSS y el
 * otro TypeScript— pero los valores son los mismos.
 */
export const COLORS = {
  // ── Azul de navegación y acciones ──────────────────────────────────────
  primary: '#2563eb',
  primaryEmphasis: '#1d4ed8',
  secondary: '#0ea5e9',

  // ── Naranja WISP: marca y elemento activo ──────────────────────────────
  brand: '#ff842a',
  /** Sobre el naranja va tinta oscura: el blanco daría 2,45:1 y no se leería */
  brandForeground: '#0f172a',
  /** Naranja para TEXTO sobre fondo claro, donde el de relleno no contrasta */
  brandStrong: '#b23b0b',

  // ── Semánticos ─────────────────────────────────────────────────────────
  info: '#7c4ddc',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',

  /** Variantes para texto pequeño sobre tinte claro */
  primaryText: '#1d4ed8',
  successText: '#157a3a',
  warningText: '#a44a08',
  errorText: '#b91c1c',
  infoText: '#6d28d9',

  dark: '#0f172a',
  sidebarText: '#2a3547',
  white: '#ffffff',

  // ── Superficies oscuras ────────────────────────────────────────────────
  // La barra de abajo y las cabeceras. Sobre oscuro el naranja de la marca
  // resalta de verdad; sobre blanco se apaga y hay que recurrir al tono
  // fuerte para que se lea.
  /** Fondo de la barra inferior y de las cabeceras */
  surfaceDark: '#0f172a',
  /** Un escalon mas claro, para lo que se apoya encima del oscuro */
  surfaceDarkSoft: '#1e293b',
  /** Texto principal sobre oscuro */
  onDark: '#f8fafc',
  /** Texto secundario sobre oscuro. Da 7:1 contra #0f172a. */
  onDarkMuted: '#94a3b8',
  /** Lineas y separadores sobre oscuro */
  borderDark: '#1e293b',

  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  muted: '#eef2f9',
  mutedForeground: '#475569',
  placeholder: '#94a3b8',

  // ── Tintes ─────────────────────────────────────────────────────────────
  lightprimary: 'rgba(37,99,235,0.12)',
  lightbrand: 'rgba(255,132,42,0.16)',
  lightsecondary: 'rgba(14,165,233,0.12)',
  lightinfo: 'rgba(124,77,220,0.12)',
  lightsuccess: 'rgba(22,163,74,0.12)',
  lightwarning: 'rgba(217,119,6,0.12)',
  lighterror: 'rgba(220,38,38,0.12)',

  // Opaco: para fondos de pantalla completa. Un color rgba() ahí se ve bien en
  // Expo Go (host blanco detrás) pero se mezcla con negro en el build nativo.
  authBg: '#eef3ff',
} as const;
