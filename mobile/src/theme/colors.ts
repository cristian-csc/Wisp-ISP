/**
 * Paleta compartida con el frontend web (frontend-v2/src/css/globals.css).
 * El naranja de la marca WISP es solo para el logo — la UI del sistema
 * interno (web y móvil) usa siempre esta paleta azul de referencia.
 */
export const COLORS = {
  primary: '#5d87ff',
  primaryEmphasis: '#4a6ccc',
  secondary: '#49beff',
  info: '#8754ec',
  success: '#13deb9',
  warning: '#f6b51e',
  error: '#ef4444',
  dark: '#1c2536',
  sidebarText: '#2a3547',
  white: '#ffffff',

  background: '#f8fafc',
  card: '#ffffff',
  border: '#dfe5ef',
  muted: '#f5f5f5',
  mutedForeground: '#5a6a85',
  placeholder: '#94a3b8',

  lightprimary: 'rgba(93,135,255,0.12)',
  lightsecondary: 'rgba(73,190,255,0.12)',
  lightinfo: 'rgba(135,84,236,0.12)',
  lightsuccess: 'rgba(19,222,185,0.12)',
  lightwarning: 'rgba(246,181,30,0.12)',
  lighterror: 'rgba(239,68,68,0.12)',
} as const;
