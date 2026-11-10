# Servicio de WhatsApp. Ya no instala Chromium: Baileys habla el protocolo
# por WebSocket, sin navegador. Eso quita del orden de 400 MB de la imagen y,
# sobre todo, los ~176 procesos que levantaba el navegador en el servidor.
#
# Se mantiene node:20-slim (Debian) y no se pasa a alpine a propósito: alpine
# usa musl en vez de glibc, y eso puede romper paquetes con partes nativas de
# formas difíciles de diagnosticar. Lo que pesaba era Chromium, no la base.

# ── Etapa 1: instalar dependencias ───────────────────────────────────────────
# Baileys depende de `libsignal`, que no está publicada en npm sino en GitHub.
# Instalarla necesita git, que la imagen base no trae — de ahí esta etapa
# aparte: git se usa para instalar y se queda aquí, fuera de la imagen final.
FROM node:20-slim AS dependencias

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

# El package-lock apunta a libsignal por ssh (git+ssh://git@github.com/...),
# que es como lo guarda npm cuando quien generó el lock tiene git configurado
# con llave. Dentro del contenedor no hay ninguna llave, así que se reescribe
# a https, que no necesita credenciales para un repositorio público.
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ \
 && npm ci --omit=dev --no-audit --no-fund

# ── Etapa 2: la imagen que corre ─────────────────────────────────────────────
# Sin git, sin caché de npm y sin herramientas de compilación: solo Node, las
# dependencias ya resueltas y el código.
FROM node:20-slim

WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

EXPOSE 3001
CMD ["node", "server.js"]
