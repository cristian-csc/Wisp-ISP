import * as ImagePicker from 'expo-image-picker';
import { alerta } from '@/components/Aviso';

/**
 * Pedir una foto: con la cámara o de la galería.
 *
 * Hasta ahora todas las pantallas abrían la cámara directamente. Funciona
 * para el caso normal, pero deja sin salida dos situaciones que pasan todo el
 * tiempo en campo: la foto salió movida y ya se tomó otra con la cámara del
 * teléfono, o se fotografió el poste antes de abrir la app. Ahí la única
 * opción era volver a subir al poste.
 *
 * Se pregunta con el aviso de la app (components/Aviso) y no con el del
 * sistema: son dos opciones, se ven grandes, y la ventana tiene la cara del
 * resto de la aplicación en vez de la de Android.
 *
 * Devuelve la ruta de la imagen, o null si se cerró sin elegir.
 */
export function elegirFoto(titulo = 'Agregar foto'): Promise<string | null> {
  return new Promise((resolve) => {
    alerta(
      titulo,
      undefined,
      [
        {
          text: 'Tomar foto',
          onPress: async () => resolve(await conLaCamara()),
        },
        {
          text: 'Elegir de la galería',
          onPress: async () => resolve(await deLaGaleria()),
        },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      // Al tocar fuera también se cierra: sin esto la promesa quedaría
      // colgada y el botón de la pantalla no volvería a responder.
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function conLaCamara(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    alerta('Permiso necesario', 'Activa el permiso de cámara para tomar la foto.');
    return null;
  }
  // Calidad 0.6: la foto se sube por datos móviles desde el campo, y a
  // calidad máxima una sola imagen puede pasar de varios megas.
  const r = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
  return !r.canceled && r.assets?.[0] ? r.assets[0].uri : null;
}

async function deLaGaleria(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    alerta('Permiso necesario', 'Activa el permiso de fotos para elegir una de la galería.');
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
  return !r.canceled && r.assets?.[0] ? r.assets[0].uri : null;
}
