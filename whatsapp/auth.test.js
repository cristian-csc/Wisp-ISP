/**
 * La cabecera X-API-Token del bot de WhatsApp.
 *
 * Hallazgo A-2 de AUDITORIA_SEGURIDAD.md: el middleware fallaba ABIERTO.
 * La primera linea era
 *
 *     if (!API_TOKEN) return next()
 *
 * de modo que con WHATSAPP_API_TOKEN vacio —que es como estaba en el .env—
 * toda peticion pasaba sin credencial. El bot escucha en 127.0.0.1:3001, pero
 * el backend corre con network_mode: host en la misma maquina, asi que
 * cualquier ejecucion de codigo o SSRF en el backend llegaba al bot sin nada
 * que mostrar, pedia /qr y se quedaba con el WhatsApp de la empresa.
 *
 * Correr:  npm test   (en whatsapp/)
 */
const test = require('node:test')
const assert = require('node:assert')

const { tokenValido, middlewareToken, exigirToken } = require('./auth')

/** Ejecuta el middleware con una cabecera dada y cuenta que paso. */
function llamar(mw, cabecera, ruta = '/send') {
  const req = {
    path: ruta,
    get: (nombre) => (nombre === 'X-API-Token' ? cabecera : undefined),
  }
  let estado = null
  let cuerpo = null
  const res = {
    status(codigo) { estado = codigo; return this },
    json(datos) { cuerpo = datos; return this },
  }
  let siguio = false
  mw(req, res, () => { siguio = true })
  return { siguio, estado, cuerpo }
}

test('sin token configurado, el middleware RECHAZA en vez de dejar pasar', () => {
  const mw = middlewareToken('')
  const r = llamar(mw, undefined)
  assert.equal(r.siguio, false, 'paso una peticion sin credencial: falla abierto')
  assert.equal(r.estado, 401)
})

test('sin token configurado, tampoco se entra inventandose una cabecera', () => {
  const r = llamar(middlewareToken(''), 'lo-que-sea')
  assert.equal(r.siguio, false)
  assert.equal(r.estado, 401)
})

test('con token configurado, la cabecera correcta pasa', () => {
  const r = llamar(middlewareToken('s3cr3to-largo-de-verdad'), 's3cr3to-largo-de-verdad')
  assert.equal(r.siguio, true)
  assert.equal(r.estado, null)
})

test('con token configurado, una cabecera equivocada no pasa', () => {
  const r = llamar(middlewareToken('s3cr3to-largo-de-verdad'), 'otro-token')
  assert.equal(r.siguio, false)
  assert.equal(r.estado, 401)
})

test('sin cabecera no se pasa', () => {
  const r = llamar(middlewareToken('s3cr3to-largo-de-verdad'), undefined)
  assert.equal(r.siguio, false)
  assert.equal(r.estado, 401)
})

test('/salud sigue abierto: es la sonda de vida y no revela nada', () => {
  const r = llamar(middlewareToken('s3cr3to-largo-de-verdad'), undefined, '/salud')
  assert.equal(r.siguio, true)
})

test('tokenValido no revienta con valores raros', () => {
  assert.equal(tokenValido(undefined, 'abc'), false)
  assert.equal(tokenValido(null, 'abc'), false)
  assert.equal(tokenValido('abc', ''), false)
  assert.equal(tokenValido('', ''), false)
  assert.equal(tokenValido(12345, 'abc'), false)
})

test('exigirToken falla si no esta definido, y dice por que', () => {
  assert.throws(() => exigirToken({}), /WHATSAPP_API_TOKEN/)
  assert.throws(() => exigirToken({ WHATSAPP_API_TOKEN: '   ' }), /WHATSAPP_API_TOKEN/)
})

test('exigirToken rechaza un token demasiado corto para servir de algo', () => {
  assert.throws(() => exigirToken({ WHATSAPP_API_TOKEN: 'corto' }), /16/)
})

test('exigirToken devuelve el token ya limpio de espacios', () => {
  assert.equal(
    exigirToken({ WHATSAPP_API_TOKEN: '  un-token-suficientemente-largo  ' }),
    'un-token-suficientemente-largo',
  )
})
