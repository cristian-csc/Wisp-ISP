/**
 * Paleta negro y naranja de la app móvil.
 *
 * El naranja es el del logo. Con el negro se combina en los dos sentidos:
 * naranja sobre negro en barras y cabeceras, y tinta negra sobre naranja en los
 * botones principales. El panel web conserva su propia paleta
 * (frontend/src/css/globals.css).
 *
 * Verde, rojo y ámbar se quedan solo para estados: activo, error y aviso.
 */
export const COLORS = {
  // ── Negro: navegación y acciones con texto blanco ──────────────────────
  primary: '#000000',
  primaryEmphasis: '#262626',
  secondary: '#C2410C',

  // ── Naranja WISP: marca y elemento activo ──────────────────────────────
  brand: '#FF842A',
  /** Sobre el naranja va tinta negra: el blanco no se leería */
  brandForeground: '#000000',
  /** Naranja para TEXTO sobre fondo claro, donde el de relleno no contrasta */
  brandStrong: '#C2410C',
  /** Naranja claro: brillos y detalles sobre negro */
  brandSoft: '#FFB066',

  // ── Semánticos ─────────────────────────────────────────────────────────
  info: '#404040',
  success: '#15803D',
  warning: '#B45309',
  error: '#C81E1E',

  /** Variantes para texto pequeño sobre tinte claro */
  primaryText: '#000000',
  successText: '#166534',
  warningText: '#92400E',
  errorText: '#A61B1B',
  infoText: '#262626',

  dark: '#000000',
  sidebarText: '#262626',
  white: '#ffffff',

  // ── Superficies negras ─────────────────────────────────────────────────
  /** Fondo de la barra inferior y de las cabeceras */
  surfaceDark: '#000000',
  /** Un escalón más claro, para lo que se apoya encima del negro */
  surfaceDarkSoft: '#1F1F1F',
  /** Texto principal sobre negro */
  onDark: '#FFFFFF',
  /** Texto secundario sobre negro */
  onDarkMuted: '#BDBDBD',
  /** Líneas y separadores sobre negro */
  borderDark: '#2E2E2E',

  background: '#F5F5F5',
  card: '#ffffff',
  border: '#E5E5E5',
  muted: '#FFF0E5',
  mutedForeground: '#525252',
  placeholder: '#737373',

  /** Velo detrás de los avisos y ventanas */
  overlay: 'rgba(0,0,0,0.6)',

  // ── Tintes ─────────────────────────────────────────────────────────────
  lightprimary: 'rgba(0,0,0,0.08)',
  lightbrand: 'rgba(255,132,42,0.18)',
  lightsecondary: 'rgba(255,132,42,0.12)',
  lightinfo: 'rgba(0,0,0,0.08)',
  lightsuccess: 'rgba(21,128,61,0.12)',
  lightwarning: 'rgba(180,83,9,0.12)',
  lighterror: 'rgba(200,30,30,0.12)',

  // Opaco: para fondos de pantalla completa. Un color rgba() ahí se ve bien en
  // Expo Go (host blanco detrás) pero se mezcla con negro en el build nativo.
  authBg: '#F5F5F5',
} as const;
