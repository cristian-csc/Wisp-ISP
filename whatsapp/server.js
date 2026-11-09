const express = require('express')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const qrcode = require('qrcode')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json({ limit: '25mb' }))

const PORT = process.env.PORT || 3001
// Por defecto escucha SOLO en la propia máquina. Antes escuchaba en todas las
// interfaces: en un servidor con IP pública eso dejaba /qr y /send al alcance
// de cualquiera en internet, es decir, el WhatsApp de la empresa en manos
// ajenas. Si algún día el bot debe vivir en otro equipo, se cambia con BIND_HOST
// y se protege con cortafuegos además del token.
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'
const CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'

// Clave compartida con el backend. Si está definida, toda petición debe
// traerla en la cabecera X-API-Token. Se deja opcional para no romper una
// instalación existente al actualizar, pero el arranque avisa si falta.
const API_TOKEN = (process.env.WHATSAPP_API_TOKEN || '').trim()

/** Comparación en tiempo constante: evita adivinar el token midiendo cuánto
 *  tarda la respuesta en fallar. */
function tokenValido(recibido) {
  const a = Buffer.from(String(recibido || ''))
  const b = Buffer.from(API_TOKEN)
  if (a.length !== b.length) return false
  return require('crypto').timingSafeEqual(a, b)
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

let qrDataUrl = null
let isConnected = false
let connectedPhone = null
let client = null

const AUTH_PATH = '/app/.wwebjs_auth'

function cleanChromiumLocks() {
  const lockNames = ['SingletonLock', 'SingletonSocket', 'SingletonCookie']
  try {
    const entries = fs.readdirSync(AUTH_PATH)
    for (const entry of entries) {
      const sessionDir = path.join(AUTH_PATH, entry)
      for (const lock of lockNames) {
        const p = path.join(sessionDir, lock)
        try { fs.unlinkSync(p); console.log(`Lock eliminado: ${p}`) } catch {}
      }
    }
  } catch {}
}

function initClient() {
  cleanChromiumLocks()
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: {
      executablePath: CHROMIUM,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    },
  })

  client.on('qr', async (qr) => {
    console.log('QR generado — escanear en /whatsapp del panel')
    try {
      qrDataUrl = await qrcode.toDataURL(qr)
    } catch (e) {
      console.error('Error generando QR:', e)
    }
    isConnected = false
  })

  client.on('ready', () => {
    console.log('WhatsApp conectado ✓')
    isConnected = true
    qrDataUrl = null
    connectedPhone = client.info?.wid?.user || 'activo'
  })

  client.on('auth_failure', (msg) => {
    console.error('Fallo de autenticación:', msg)
    isConnected = false
  })

  client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason)
    isConnected = false
    connectedPhone = null
    qrDataUrl = null
    setTimeout(initClient, 8000)
  })

  client.initialize().catch(err => {
    console.error('Error al inicializar:', err.message)
    setTimeout(initClient, 15000)
  })
}

/* ── Endpoints ────────────────────────────────────────────────────── */

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
    const number = phone.replace(/[^0-9]/g, '')
    const fullNumber = number.startsWith('51') ? number : `51${number}`

    // Verificar que el número existe en WhatsApp y obtener el chatId real (maneja LIDs)
    const numberId = await client.getNumberId(fullNumber)
    if (!numberId) {
      return res.status(404).json({ error: `El número ${fullNumber} no tiene WhatsApp` })
    }

    await client.sendMessage(numberId._serialized, message)
    res.json({ ok: true, to: numberId._serialized })
  } catch (err) {
    // Frame detached o error interno de Puppeteer — reinicializar cliente
    const isPuppeteerError = err.message && (
      err.message.includes('detached Frame') ||
      err.message.includes('Target closed') ||
      err.message.includes('Session closed') ||
      err.message.includes('Protocol error')
    )
    if (isPuppeteerError) {
      console.error('Error Puppeteer detectado, reiniciando cliente WhatsApp:', err.message)
      isConnected = false
      connectedPhone = null
      try { await client.destroy() } catch {}
      setTimeout(initClient, 5000)
    }
    res.status(500).json({ error: err.message })
  }
})

/* Envia un archivo (el recibo en PDF) con un texto de descripcion. El archivo
   llega en base64 para no depender de rutas compartidas entre contenedores. */
app.post('/send-file', async (req, res) => {
  const { phone, base64, filename, mimetype, caption } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp no conectado' })
  if (!phone || !base64 || !filename) {
    return res.status(400).json({ error: 'Faltan: phone, base64 y filename' })
  }

  try {
    const number = phone.replace(/[^0-9]/g, '')
    const fullNumber = number.startsWith('51') ? number : `51${number}`

    const numberId = await client.getNumberId(fullNumber)
    if (!numberId) {
      return res.status(404).json({ error: `El numero ${fullNumber} no tiene WhatsApp` })
    }

    const media = new MessageMedia(mimetype || 'application/pdf', base64, filename)
    await client.sendMessage(numberId._serialized, media, { caption: caption || '' })
    res.json({ ok: true, to: numberId._serialized, filename })
  } catch (err) {
    const isPuppeteerError = err.message && (
      err.message.includes('detached Frame') ||
      err.message.includes('Target closed') ||
      err.message.includes('Session closed') ||
      err.message.includes('Protocol error')
    )
    if (isPuppeteerError) {
      console.error('Error Puppeteer al enviar archivo, reiniciando cliente:', err.message)
      isConnected = false
      connectedPhone = null
      try { await client.destroy() } catch {}
      setTimeout(initClient, 5000)
    }
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
  initClient()
})
