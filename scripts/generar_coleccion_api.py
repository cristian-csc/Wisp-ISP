"""Genera la documentación de la API de WISP a partir de su OpenAPI.

Salidas en docs/api/:
  - openapi.json                 la especificación (Swagger / OpenAPI 3.1)
  - WISP.postman_collection.json colección de Postman, con el login que guarda
                                 el token solo
  - swagger.html                 Swagger UI en un solo archivo, sin servidor

Uso (con el backend de desarrollo arriba, que expone /openapi.json):
    python scripts/generar_coleccion_api.py [URL o archivo del OpenAPI]
Por defecto lee http://localhost:8000/openapi.json.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'docs' / 'api'
ORIGEN = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/openapi.json'

DESCRIPCION = """API de **WISP Control**: clientes, pagos, red (zonas, cajas NAP, ONUs, WireGuard y MikroTik), inventario, WhatsApp y permisos.

### Cómo autenticarse
1. `POST /api/auth/login` con un formulario `username` + `password` (el personal del panel).
   La app del cliente usa `POST /api/auth/cliente/login` con su DNI.
2. La respuesta trae `access_token`, un JWT válido por 8 horas.
3. En cada petición se envía la cabecera `Authorization: Bearer <access_token>`.

En Swagger, el botón **Authorize** hace el login por ti. En Postman, la petición
*Auth › Login* guarda el token en la variable `token` y el resto lo usa solo.

### Permisos
Además del tipo de cuenta, cada endpoint pide los módulos del rol (los de *Roles y módulos*).
Sin sesión se responde **401**; con sesión pero sin el módulo, **403**.

### Efectos externos
Cortar, reactivar, aprobar o instalar un cliente ejecuta comandos en el MikroTik de su zona
(por SSH, a través del túnel WireGuard) y puede mandar WhatsApp. No los pruebes contra
un entorno con routers y clientes reales.
"""

TAGS = {
    'Auth': 'Inicio de sesión, perfil propio y usuarios del personal.',
    'Dashboard': 'Cifras del panel principal.',
    'Clientes': 'Alta, aprobación, instalación, corte, pausa y reactivación (actúan sobre el MikroTik).',
    'Zonas': 'Zonas de cobertura, túnel WireGuard, estado de los routers y terminal RouterOS.',
    'Pagos': 'Cobros, comprobantes, recibos PDF y reportes de caja.',
    'Gastos': 'Gastos de la empresa por zona y categoría.',
    'WhatsApp': 'Sesión del bot, avisos de cobro y mensajería masiva.',
    'Planes': 'Planes de internet y su perfil PPPoE en cada router.',
    'Admin': 'Copias de seguridad y tareas de administración.',
    'App Cliente': 'Lo que consume la app móvil del cliente.',
    'Cajas NAP': 'Cajas de distribución, bornes y precintos.',
    'Mufas': 'Mufas de empalme y corridas de fibra.',
    'ONUs': 'Registro de ONUs por serie, con su recorrido.',
    'Averías': 'Reportes de avería y su atención.',
    'Órdenes de retiro': 'Retiro de equipos de clientes dados de baja.',
    'Evidencias': 'Fotos de instalaciones, averías y retiros.',
    'Jornadas': 'Jornadas y recorridos de las vendedoras de campo.',
    'Consultas': 'Consulta de DNI y RUC.',
    'Roles y módulos': 'Roles, módulos padre y qué módulo tiene cada rol.',
    'Inventario': 'Stock de materiales, movimientos, piezas con etiqueta y unidades de medida.',
}


def leer_openapi() -> dict:
    if re.match(r'^https?://', ORIGEN):
        with urllib.request.urlopen(ORIGEN, timeout=20) as r:
            return json.loads(r.read().decode('utf-8'))
    return json.loads(Path(ORIGEN).read_text(encoding='utf-8'))


def enriquecer(spec: dict) -> dict:
    spec['info']['title'] = 'WISP Control · API'
    spec['info']['description'] = DESCRIPCION
    spec['servers'] = [
        {'url': 'http://localhost:3000', 'description': 'Local (Docker, a través de Nginx)'},
        {'url': 'http://localhost:8000', 'description': 'Local (backend directo)'},
    ]
    usados = {t for ruta in spec['paths'].values() for op in ruta.values() for t in op.get('tags', [])}
    spec['tags'] = [{'name': n, 'description': d} for n, d in TAGS.items() if n in usados]
    # El esquema OAuth2 de FastAPI tiene tokenUrl relativo; se deja absoluto a
    # la ruta real para que el botón Authorize funcione desde cualquier origen.
    for esquema in spec.get('components', {}).get('securitySchemes', {}).values():
        flujo = esquema.get('flows', {}).get('password')
        if flujo:
            flujo['tokenUrl'] = '/api/auth/login'
    return spec


# ── Postman ──────────────────────────────────────────────────────────────────

def resolver(spec, esquema, profundidad=0):
    if not isinstance(esquema, dict) or profundidad > 6:
        return {}
    if '$ref' in esquema:
        nombre = esquema['$ref'].split('/')[-1]
        return resolver(spec, spec['components']['schemas'].get(nombre, {}), profundidad + 1)
    for clave in ('allOf', 'anyOf', 'oneOf'):
        if clave in esquema:
            opciones = [o for o in esquema[clave] if o.get('type') != 'null']
            if opciones:
                base = resolver(spec, opciones[0], profundidad + 1)
                return {**base, **{k: v for k, v in esquema.items() if k not in (clave,)}}
    return esquema


def ejemplo(spec, esquema, profundidad=0):
    """Un valor de ejemplo razonable para un esquema."""
    e = resolver(spec, esquema, profundidad)
    if not e:
        return None
    for clave in ('example', 'default'):
        if clave in e:
            return e[clave]
    if 'examples' in e and e['examples']:
        return e['examples'][0]
    if 'enum' in e:
        return e['enum'][0]
    tipo = e.get('type')
    if tipo == 'object' or 'properties' in e:
        if profundidad > 4:
            return {}
        requeridos = set(e.get('required', []))
        props = e.get('properties', {})
        # Lo obligatorio siempre; lo opcional también, hasta 14 campos, para que se vea qué se puede mandar.
        claves = [k for k in props if k in requeridos] + [k for k in props if k not in requeridos]
        return {k: ejemplo(spec, props[k], profundidad + 1) for k in claves[:max(14, len(requeridos))]}
    if tipo == 'array':
        item = ejemplo(spec, e.get('items', {}), profundidad + 1)
        return [item] if item is not None else []
    fmt = e.get('format', '')
    if tipo == 'string':
        return {'date': '2026-11-19', 'date-time': '2026-11-19T09:00:00', 'email': 'usuario@wispfibra.com',
                'binary': None}.get(fmt, 'texto')
    if tipo == 'integer':
        return max(e.get('minimum', 1), e.get('exclusiveMinimum', 0) + 1)
    if tipo == 'number':
        return 1.0
    if tipo == 'boolean':
        return True
    return None


# Valores de ejemplo por nombre de parámetro, para que la petición funcione tal cual.
EJEMPLOS = {
    'mes': '2026-11', 'mes_pagado': '2026-11', 'anio': '2026', 'desde': '2026-11-01', 'hasta': '2026-11-30',
    'ids': '1,2', 'codigo': 'ACT-000001', 'numero_serie': 'ASKY10790001', 'mac': 'A4:B1:C2:3D:4E:5F',
    'page': '1', 'per_page': '20', 'q': '', 'search': '', 'plataforma': 'panel', 'formato': 'excel',
}

NOTAS_CARPETA = {
    'App Cliente': 'Estas peticiones son de la app del cliente: corre antes **Auth › Cliente Login** con un DNI de cliente.',
    'Jornadas': 'Las de «mi jornada» son de la vendedora de campo: necesitan su sesión, no la del administrador.',
    'Clientes': 'Ojo: cortar, reactivar, pausar, aprobar e instalar mandan comandos al MikroTik y avisos por WhatsApp.',
    'Zonas': 'Ojo: la terminal y la gestión del túnel actúan sobre la VPS y los routers reales.',
    'WhatsApp': 'Ojo: los envíos llegan a clientes reales si el bot está vinculado.',
}


def peticion(spec, metodo, ruta, op):
    nombre = op.get('summary') or f'{metodo.upper()} {ruta}'
    segmentos = [re.sub(r'^\{(.+)\}$', r':\1', s) for s in ruta.strip('/').split('/')]
    url = {
        'raw': '{{baseUrl}}/' + '/'.join(segmentos),
        'host': ['{{baseUrl}}'],
        'path': segmentos,
    }
    variables, query = [], []
    for p in op.get('parameters', []):
        valor = EJEMPLOS.get(p['name'], ejemplo(spec, p.get('schema', {})))
        if p['in'] == 'path':
            variables.append({'key': p['name'], 'value': str(valor if valor is not None else 1), 'description': p.get('description', '')})
        elif p['in'] == 'query':
            query.append({'key': p['name'], 'value': '' if valor is None else str(valor),
                          'disabled': not p.get('required', False), 'description': p.get('description', '')})
    if variables:
        url['variable'] = variables
    if query:
        url['query'] = query
        url['raw'] += '?' + '&'.join(f"{q['key']}={q['value']}" for q in query if not q['disabled'])

    req = {'method': metodo.upper(), 'header': [], 'url': url}
    if op.get('description'):
        req['description'] = op['description']
    cuerpo = op.get('requestBody', {}).get('content', {})
    if 'application/json' in cuerpo:
        req['header'].append({'key': 'Content-Type', 'value': 'application/json'})
        req['body'] = {'mode': 'raw', 'raw': json.dumps(ejemplo(spec, cuerpo['application/json'].get('schema', {})), ensure_ascii=False, indent=2),
                       'options': {'raw': {'language': 'json'}}}
    elif 'application/x-www-form-urlencoded' in cuerpo or 'multipart/form-data' in cuerpo:
        tipo = 'urlencoded' if 'application/x-www-form-urlencoded' in cuerpo else 'formdata'
        esquema = resolver(spec, cuerpo.get('application/x-www-form-urlencoded', cuerpo.get('multipart/form-data', {})).get('schema', {}))
        campos = []
        requeridos = set(esquema.get('required', []))
        for k, v in esquema.get('properties', {}).items():
            # Opcionales como grant_type o scope del login OAuth2 se dejan fuera:
            # con un valor de ejemplo el servidor los rechaza.
            if tipo == 'urlencoded' and k not in requeridos:
                continue
            v = resolver(spec, v)
            es_archivo = v.get('format') == 'binary' or v.get('contentMediaType') == 'application/octet-stream'
            campo = {'key': k, 'type': 'file' if es_archivo else 'text'}
            if not es_archivo:
                campo['value'] = {'username': '{{usuario}}', 'password': '{{clave}}'}.get(k, str(ejemplo(spec, v) or ''))
            campos.append(campo)
        req['body'] = {'mode': tipo, tipo: campos}

    item = {'name': nombre, 'request': req}
    if not op.get('security'):
        req['auth'] = {'type': 'noauth'}
    if ruta in ('/api/auth/login', '/api/auth/cliente/login'):
        item['event'] = [{'listen': 'test', 'script': {'type': 'text/javascript', 'exec': [
            'const r = pm.response.json();',
            'if (r.access_token) {',
            "  pm.collectionVariables.set('token', r.access_token);",
            "  console.log('Token guardado en la variable token');",
            '}',
        ]}}]
    return item


def coleccion(spec: dict) -> dict:
    carpetas = {}
    for ruta, metodos in spec['paths'].items():
        for metodo, op in metodos.items():
            tag = (op.get('tags') or ['Otros'])[0]
            carpetas.setdefault(tag, []).append(peticion(spec, metodo, ruta, op))
    orden = list(TAGS)
    items = []
    for tag in sorted(carpetas, key=lambda t: (orden.index(t) if t in orden else 99, t)):
        reqs = carpetas[tag]
        if tag == 'Auth':
            # El login primero: es lo que hay que correr antes que todo lo demás.
            reqs.sort(key=lambda r: 0 if r['request']['url']['raw'].endswith('/auth/login') else 1)
        nota = NOTAS_CARPETA.get(tag)
        descripcion = TAGS.get(tag, '') + (' ' + nota if nota else '')
        items.append({'name': tag, 'description': descripcion, 'item': reqs})
    return {
        'info': {
            'name': 'WISP Control · API',
            'description': DESCRIPCION + '\n\nCorre primero **Auth › Login**: guarda el token y todas las demás peticiones lo usan.',
            'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        'auth': {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{token}}', 'type': 'string'}]},
        'variable': [
            {'key': 'baseUrl', 'value': 'http://localhost:3000'},
            {'key': 'usuario', 'value': 'admin'},
            {'key': 'clave', 'value': '', 'description': 'La contraseña del usuario. No se guarda en el repositorio.'},
            {'key': 'token', 'value': ''},
        ],
        'item': items,
    }


SWAGGER_HTML = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WISP Control · API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>
  body { margin: 0; background: #fff; }
  .topbar { display: none; }
  .swagger-ui .info .title { font-family: system-ui, sans-serif; }
  .aviso { font: 14px/1.5 system-ui, sans-serif; background: #fff7ed; color: #7c2d12; border-bottom: 1px solid #fed7aa; padding: 10px 20px; }
</style>
</head>
<body>
<div class="aviso">Documentación generada del código. Para probar las peticiones, el backend tiene que estar corriendo (por defecto en <b>http://localhost:3000</b>).</div>
<div id="swagger"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>
  const spec = __SPEC__;
  window.ui = SwaggerUIBundle({
    spec, dom_id: '#swagger', deepLinking: true, persistAuthorization: true,
    docExpansion: 'none', filter: true, tryItOutEnabled: true, displayRequestDuration: true,
  });
</script>
</body>
</html>
"""


def main():
    spec = enriquecer(leer_openapi())
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / 'openapi.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding='utf-8')
    col = coleccion(spec)
    (SALIDA / 'WISP.postman_collection.json').write_text(json.dumps(col, ensure_ascii=False, indent=2), encoding='utf-8')
    # </script> dentro del JSON cerraría la etiqueta antes de tiempo.
    incrustado = json.dumps(spec, ensure_ascii=False).replace('</', '<\\/')
    (SALIDA / 'swagger.html').write_text(SWAGGER_HTML.replace('__SPEC__', incrustado), encoding='utf-8')
    total = sum(len(c['item']) for c in col['item'])
    print(f"{len(spec['paths'])} rutas, {total} peticiones en {len(col['item'])} carpetas, en {SALIDA}")


if __name__ == '__main__':
    main()
