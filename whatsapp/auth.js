/**
 * La credencial compartida entre el backend y el bot.
 *
 * Esta en su propio archivo por dos razones. La primera es que server.js
 * arranca un socket contra WhatsApp en cuanto se carga, asi que no se puede
 * importar desde una prueba; aqui no hay efectos de carga y se prueba entero
 * (ver auth.test.js). La segunda es que es la unica puerta del servicio: quien
 * pase por aqui puede escribir como la empresa y leer lo que contesten los
 * clientes, y eso merece estar a la vista en vez de disuelto en 278 lineas.
 *
 * Regla de la casa: FALLA CERRADO. Un bot sin credencial no se queda abierto
 * «hasta que alguien lo configure»; no arranca. Antes del 2026-11-26 era lo
 * contrario —`if (!API_TOKEN) return next()`— y el .env tenia el token vacio,
 * asi que el servicio llevaba todo ese tiempo aceptando a cualquiera que
 * alcanzara el puerto (hallazgo A-2).
 */
const crypto = require('crypto')

// Por debajo de esto el token no da trabajo a nadie que lo quiera adivinar.
const MINIMO = 16

/**
 * Lee la credencial del entorno y se niega a seguir si no sirve.
 * @throws {Error} si falta o es demasiado corta.
 */
function exigirToken(env) {
  const token = String((env && env.WHATSAPP_API_TOKEN) || '').trim()
  if (!token) {
    throw new Error(
      'WHATSAPP_API_TOKEN no esta definido. Sin esa credencial, cualquiera ' +
      'que alcance este puerto puede pedir el QR de vinculacion y enviar ' +
      'mensajes como la empresa, asi que el servicio no arranca. Pon el ' +
      'mismo valor en el .env del backend y en el de este servicio.',
    )
  }
  if (token.length < MINIMO) {
    throw new Error(
      `WHATSAPP_API_TOKEN es demasiado corto (${token.length} caracteres; ` +
      `hacen falta ${MINIMO} o mas). Generalo con: openssl rand -hex 32`,
    )
  }
  return token
}

/**
 * Compara en tiempo constante, para no filtrar el token midiendo cuanto tarda
 * la respuesta en fallar.
 */
function tokenValido(recibido, esperado) {
  const a = Buffer.from(String(recibido == null ? '' : recibido))
  const b = Buffer.from(String(esperado == null ? '' : esperado))
  if (b.length === 0) return false
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * El guardia de todas las rutas menos /salud, que es la sonda de vida y no
 * cuenta nada de la sesion.
 *
 * Con `esperado` vacio rechaza todo, en vez de dejar pasar todo. En la
 * practica no deberia llegar a construirse asi —exigirToken() para el arranque
 * antes—, pero es la pieza que fallaba abierta y el valor por defecto correcto
 * es el seguro.
 */
function middlewareToken(esperado) {
  return (req, res, next) => {
    if (req.path === '/salud') return next()
    if (!tokenValido(req.get('X-API-Token'), esperado)) {
      return res.status(401).json({ error: 'No autorizado' })
    }
    next()
  }
}

module.exports = { exigirToken, tokenValido, middlewareToken, MINIMO }
