/**
 * Servicio de WhatsApp de WISP.
 *
 * Habla el protocolo de WhatsApp directamente por WebSocket (Baileys), sin
 * navegador. Antes usaba whatsapp-web.js, que automatiza un Chromium completo:
 * en el servidor de la oficina eso eran 1,17 GB de memoria y 176 procesos con
 * 8 minutos encendido, suficiente para poner lento el equipo entero y tumbar
 * el túnel de Cloudflare.
 *
 * La interfaz HTTP es EXACTAMENTE la misma que antes (/salud, /status, /qr,
 * /send, /send-file, cabecera X-API-Token): el backend y el panel no se
 * enteran del cambio.
 *
 * Aviso que conviene no olvidar: Baileys, igual que whatsapp-web.js, es una
 * librería no oficial. El riesgo de que WhatsApp bloquee el número no baja por
 * cambiar de una a otra; lo que baja es el consumo del servidor.
 */
const express = require('express')
const qrcode = require('qrcode')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys')

const app = express()
app.use(express.json({ limit: '25mb' }))

const PORT = process.env.PORT || 3001
// Por defecto escucha SOLO en la propia máquina. Quien alcance este puerto
// puede pedir el QR de vinculación y escribir como la empresa.
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'
// Carpeta de la sesión, en un volumen de Docker para que sobreviva a los
// reinicios y no haya que escanear el QR cada vez.
const SESSION_PATH = process.env.SESSION_PATH || '/app/sesion'

// Clave compartida con el backend. Si está definida, toda petición debe
// traerla en la cabecera X-API-Token.
const API_TOKEN = (process.env.WHATSAPP_API_TOKEN || '').trim()

/** Comparación en tiempo constante: evita adivinar el token midiendo cuánto
 *  tarda la respuesta en fallar. */
function tokenValido(recibido) {
  const a = Buffer.from(String(recibido || ''))
  const b = Buffer.from(API_TOKEN)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

app.use((req, res, next) => {
  if (!API_TOKEN) return next()
  if (req.path === '/salud') return next()
  if (!tokenValido(req.get('X-API-Token'))) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  next()
})

// Sonda para saber si el servicio está vivo sin revelar nada.
app.get('/salud', (req, res) => res.json({ ok: true }))

/* ── Estado de la conexión ──────────────────────────────────────────── */

let qrDataUrl = null
let isConnected = false
let connectedPhone = null
let sock = null
// Evita que dos reconexiones a la vez levanten dos sockets contra WhatsApp.
let arrancando = false

/** Borra la sesión guardada. Se usa solo cuando WhatsApp dice que la sesión
 *  ya no vale (cerraron sesión desde el celular, o caducó): conservarla
 *  dejaría al bot reintentando para siempre con credenciales muertas, sin
 *  llegar a mostrar un QR nuevo — que es justo lo que pasaba antes. */
function borrarSesion() {
  try {
    fs.rmSync(SESSION_PATH, { recursive: true, force: true })
    console.log('Sesión borrada: hay que volver a escanear el QR')
  } catch (e) {
    console.error('No se pudo borrar la sesión:', e.message)
  }
}

async function iniciar() {
  if (arrancando) return
  arrancando = true

  try {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)

    // La versión del protocolo que usa WhatsApp Web cambia cada tanto. Se
    // consulta al arrancar; si no hay internet en ese momento, Baileys usa la
    // que trae de fábrica en vez de quedarse sin arrancar.
    let version
    try {
      ({ version } = await fetchLatestBaileysVersion())
    } catch {
      console.warn('No se pudo consultar la versión de WhatsApp — se usa la incluida')
    }

    sock = makeWASocket({
      version,
      auth: state,
      // Sin esto Baileys escribe cientos de líneas por minuto y llena el log.
      logger: pino({ level: 'silent' }),
      // No marcar el teléfono como "en línea": así las notificaciones siguen
      // llegando al celular de la empresa como siempre.
      markOnlineOnConnect: false,
      // Lo que se ve en "Dispositivos vinculados" del celular.
      browser: ['WISP Control', 'Chrome', '1.0.0'],
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          qrDataUrl = await qrcode.toDataURL(qr)
          console.log('QR generado — escanear desde el panel, en Configuración → WhatsApp')
        } catch (e) {
          console.error('Error generando el QR:', e.message)
        }
        isConnected = false
      }

      if (connection === 'open') {
        isConnected = true
        qrDataUrl = null
        connectedPhone = (sock.user?.id || '').split(':')[0] || 'activo'
        console.log('WhatsApp conectado ✓')
      }

      if (connection === 'close') {
        isConnected = false
        connectedPhone = null
        arrancando = false

        const codigo = lastDisconnect?.error?.output?.statusCode
        // Distinguir por qué se cayó es la diferencia entre reconectar solo o
        // quedarse colgado: si la sesión murió hay que empezar de cero, y si
        // fue un corte de red hay que reconectar con la misma.
        const sesionMuerta =
          codigo === DisconnectReason.loggedOut ||
          codigo === DisconnectReason.badSession

        if (sesionMuerta) {
          console.log('La sesión ya no es válida (cerrada desde el celular o caducada)')
          qrDataUrl = null
          borrarSesion()
          setTimeout(iniciar, 2000)
        } else {
          console.log(`Conexión cerrada (código ${codigo ?? 'desconocido'}), reconectando…`)
          setTimeout(iniciar, 5000)
        }
      }
    })
  } catch (e) {
    arrancando = false
    console.error('Error al iniciar:', e.message)
    setTimeout(iniciar, 15000)
  }
}

/* ── Utilidades de envío ────────────────────────────────────────────── */

/** El número tal como lo espera WhatsApp, y la comprobación de que existe.
 *  Devuelve el jid, o null si ese número no tiene WhatsApp. Es el equivalente
 *  al getNumberId() de antes. */
async function jidDe(phone) {
  const numero = String(phone).replace(/[^0-9]/g, '')
  const completo = numero.startsWith('51') ? numero : `51${numero}`
  const [resultado] = await sock.onWhatsApp(completo)
  if (!resultado?.exists) return { jid: null, completo }
  return { jid: resultado.jid, completo }
}

/* ── Endpoints ──────────────────────────────────────────────────────── */

app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    status: isConnected ? 'conectado' : 'desconectado',
    phone: connectedPhone,
    has_qr: !!qrDataUrl,
  })
})

app.get('/qr', (req, res) => {
  res.json({ qr: qrDataUrl })
})

app.post('/send', async (req, res) => {
  const { phone, message } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp no conectado' })
  if (!phone || !message) return res.status(400).json({ error: 'Faltan: phone y message' })

  try {
    const { jid, completo } = await jidDe(phone)
    if (!jid) return res.status(404).json({ error: `El número ${completo} no tiene WhatsApp` })

    await sock.sendMessage(jid, { text: message })
    res.json({ ok: true, to: jid })
  } catch (err) {
    console.error('Error enviando texto:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/* Envía un archivo (el recibo en PDF) con un texto de descripción. El archivo
   llega en base64 para no depender de rutas compartidas entre contenedores. */
app.post('/send-file', async (req, res) => {
  const { phone, base64, filename, mimetype, caption } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp no conectado' })
  if (!phone || !base64 || !filename) {
    return res.status(400).json({ error: 'Faltan: phone, base64 y filename' })
  }

  try {
    const { jid, completo } = await jidDe(phone)
    if (!jid) return res.status(404).json({ error: `El numero ${completo} no tiene WhatsApp` })

    await sock.sendMessage(jid, {
      document: Buffer.from(base64, 'base64'),
      mimetype: mimetype || 'application/pdf',
      fileName: filename,
      caption: caption || '',
    })
    res.json({ ok: true, to: jid, filename })
  } catch (err) {
    console.error('Error enviando archivo:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, BIND_HOST, () => {
  console.log(`WhatsApp API escuchando en ${BIND_HOST}:${PORT}`)
  if (!API_TOKEN) {
    console.warn(
      '  AVISO DE SEGURIDAD: WHATSAPP_API_TOKEN no está definido.\n' +
      '  Sin token, cualquiera que alcance este puerto puede pedir el QR de\n' +
      '  vinculación y enviar mensajes como la empresa. Defínelo en el .env\n' +
      '  (el mismo valor en el backend) antes de publicar el sistema.'
    )
  }
  iniciar()
})
