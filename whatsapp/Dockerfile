# Servicio de WhatsApp. Ya no instala Chromium: Baileys habla el protocolo
# por WebSocket, sin navegador. Eso quita del orden de 400 MB de la imagen y,
# sobre todo, los ~176 procesos que levantaba el navegador en el servidor.
#
# Se mantiene node:20-slim (Debian) y no se pasa a alpine a propósito: alpine
# usa musl en vez de glibc, y eso puede romper paquetes con partes nativas de
# formas difíciles de diagnosticar. Lo que pesaba era Chromium, no la base.
FROM node:20-slim

WORKDIR /app

# Las dependencias en su propia capa: mientras package.json no cambie, Docker
# reutiliza esta capa y la construcción es casi instantánea.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3001
CMD ["node", "server.js"]
