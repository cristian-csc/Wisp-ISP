import { useEffect, useRef } from 'react';

/**
 * Vuelve a pedir los datos cuando regresas a la ventana.
 *
 * Cada pantalla del panel pregunta al servidor una sola vez, al abrirse, y
 * después solo si haces algo en ella misma. Eso deja fuera todo lo que pasa
 * por otro lado: el técnico cerrando una instalación desde el móvil, Atención
 * al Cliente registrando a alguien, u otra pestaña tuya. La pantalla se queda
 * con lo que vio al principio y hay que recargar a mano para enterarse.
 *
 * Con esto, el gesto natural —irte al WhatsApp, volver al panel— ya trae los
 * datos al día.
 *
 * No es sondeo: no pregunta cada pocos segundos. Pregunta cuando vuelves,
 * que es justo cuando vas a mirar. El servidor es una PC de oficina y no hay
 * que hacerle trabajar de más por nada.
 */

/** Dos eventos distintos avisan de lo mismo, y a veces los dos a la vez.
 *  Sin este freno, cambiar de pestaña rápido dispararía varias recargas
 *  seguidas de la misma pantalla. */
const MINIMO_ENTRE_RECARGAS = 10_000;

export function useRefrescoAlVolver(recargar: () => void, activo = true) {
  // La función se guarda en una referencia para no volver a suscribirse en
  // cada render: estas pantallas la recrean cada vez, y sin esto se estarían
  // montando y desmontando los escuchadores continuamente.
  const fn = useRef(recargar);
  fn.current = recargar;

  const ultima = useRef(Date.now());

  useEffect(() => {
    if (!activo) return;

    function alVolver() {
      // `focus` también salta al pulsar dentro de la ventana; el estado de
      // visibilidad es lo que de verdad distingue «estaba fuera».
      if (document.visibilityState !== 'visible') return;

      const ahora = Date.now();
      if (ahora - ultima.current < MINIMO_ENTRE_RECARGAS) return;
      ultima.current = ahora;
      fn.current();
    }

    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [activo]);
}

export default useRefrescoAlVolver;
