import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/colors';

/**
 * Los avisos y confirmaciones, con la cara de la app.
 *
 * Antes se usaba el Alert del sistema. Funciona, pero se ve como una ventana
 * de Android cualquiera: tipografía distinta, botones azules de fábrica,
 * esquinas ajenas. En una app que por lo demás está cuidada, canta — y lo que
 * transmite es que el aviso no es tuyo.
 *
 * La forma de llamarla es la misma que la del sistema a propósito, para que
 * cambiar las 65 llamadas que había fuera sustituir el nombre y nada más:
 *
 *     alerta('Título', 'Mensaje')
 *     alerta('Título', 'Mensaje', [{ text: 'Borrar', style: 'destructive', onPress: ... }])
 *
 * Vive fuera de React (una variable de módulo) porque se llama desde sitios
 * que no son componentes —services/fotos.ts, por ejemplo— igual que el Alert
 * al que reemplaza.
 */

export type BotonAviso = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type Peticion = {
  titulo: string;
  mensaje?: string;
  botones: BotonAviso[];
  alCerrar?: () => void;
};

let mostrar: ((p: Peticion) => void) | null = null;

export function alerta(
  titulo: string,
  mensaje?: string,
  botones?: BotonAviso[],
  opciones?: { cancelable?: boolean; onDismiss?: () => void },
) {
  const p: Peticion = {
    titulo,
    mensaje,
    botones: botones?.length ? botones : [{ text: 'Entendido' }],
    alCerrar: opciones?.onDismiss,
  };
  if (mostrar) {
    mostrar(p);
  } else {
    // Si el host todavía no se montó, el aviso se perdería en silencio. Pasa
    // solo en los primeros milisegundos de arranque; se reintenta una vez.
    setTimeout(() => mostrar?.(p), 120);
  }
}

const TONOS: Record<string, { color: string; fondo: string; icono: keyof typeof Ionicons.glyphMap }> = {
  default: { color: COLORS.info, fondo: COLORS.lightinfo, icono: 'information-circle' },
  destructive: { color: COLORS.error, fondo: COLORS.lighterror, icono: 'alert-circle' },
};

/** Se monta una sola vez, en el layout raíz. */
export function AvisoHost() {
  const [cola, setCola] = useState<Peticion[]>([]);
  const actual = cola[0] ?? null;

  useEffect(() => {
    mostrar = (p) => setCola((prev) => [...prev, p]);
    return () => {
      mostrar = null;
    };
  }, []);

  function cerrar(boton?: BotonAviso) {
    setCola((prev) => prev.slice(1));
    // El onPress va después de cerrar: si abre otro aviso, la cola lo toma en
    // orden en vez de pisarse con el que se está yendo.
    setTimeout(() => {
      if (boton) boton.onPress?.();
      else actual?.alCerrar?.();
    }, 0);
  }

  if (!actual) return null;

  // El tono lo marca el botón más fuerte: si hay uno destructivo, el aviso
  // entero se lee como una advertencia.
  const hayDestructivo = actual.botones.some((b) => b.style === 'destructive');
  const tono = TONOS[hayDestructivo ? 'destructive' : 'default'];
  const soloUno = actual.botones.length === 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => cerrar()}>
      <Pressable style={a.fondo} onPress={() => cerrar()}>
        {/* El toque dentro de la tarjeta no cierra: solo el de fuera. */}
        <Pressable style={a.tarjeta} onPress={() => {}}>
          <View style={[a.iconoCaja, { backgroundColor: tono.fondo }]}>
            <Ionicons name={tono.icono} size={26} color={tono.color} />
          </View>

          <Text style={a.titulo}>{actual.titulo}</Text>

          {!!actual.mensaje && (
            <ScrollView style={{ maxHeight: 220 }} bounces={false}>
              <Text style={a.mensaje}>{actual.mensaje}</Text>
            </ScrollView>
          )}

          <View style={[a.botones, soloUno && { flexDirection: 'row' }]}>
            {actual.botones.map((b, i) => {
              const esCancelar = b.style === 'cancel';
              const esBorrar = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[
                    a.boton,
                    esCancelar && a.botonCancelar,
                    esBorrar && a.botonBorrar,
                    soloUno && { flex: 1 },
                  ]}
                  onPress={() => cerrar(b)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      a.botonTexto,
                      esCancelar && a.botonTextoCancelar,
                    ]}
                  >
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const a = StyleSheet.create({
  fondo: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  tarjeta: {
    width: '100%', maxWidth: 400, backgroundColor: COLORS.card,
    borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  iconoCaja: {
    width: 54, height: 54, borderRadius: 27, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  titulo: {
    fontSize: 18, fontWeight: '900', color: COLORS.dark,
    textAlign: 'center', marginBottom: 6,
  },
  mensaje: {
    fontSize: 14.5, lineHeight: 21, color: COLORS.mutedForeground,
    textAlign: 'center', marginBottom: 4,
  },
  botones: { marginTop: 18, gap: 9 },
  boton: {
    backgroundColor: COLORS.primary, borderRadius: 13,
    paddingVertical: 14, alignItems: 'center',
  },
  botonCancelar: { backgroundColor: 'transparent' },
  botonBorrar: { backgroundColor: COLORS.error },
  botonTexto: { fontSize: 15.5, fontWeight: '800', color: COLORS.white },
  botonTextoCancelar: { color: COLORS.mutedForeground },
});
