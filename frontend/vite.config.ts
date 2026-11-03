import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, extname } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';

/** En produccion Nginx sirve el sitio publico (carpeta `web/`) en la raiz y el
 * panel bajo /app/. El servidor de desarrollo imita ese mismo reparto para que
 * el recorrido completo -- portada, ingresar, panel, cerrar sesion -- se pueda
 * probar en local igual que en el dominio. Sin esto, salir del panel lleva a
 * una raiz que Vite devuelve al propio panel, y la redireccion entra en bucle. */
function sitioPublicoEnDesarrollo() {
  const raiz = resolve(__dirname, '../web');
  const tipos: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  return {
    name: 'sitio-publico-dev',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const ruta = (req.url || '/').split('?')[0];
        // Todo lo que pertenece al panel o a Vite sigue su camino normal.
        const reservado = ['/app', '/api', '/@', '/node_modules', '/src'];
        if (reservado.some((pre) => ruta === pre || ruta.startsWith(pre + '/'))) return next();

        const archivo = resolve(raiz, ruta === '/' ? 'index.html' : ruta.slice(1));
        // No servir nada fuera de web/, aunque la URL traiga ../
        if (!archivo.startsWith(raiz)) return next();
        if (!existsSync(archivo) || !statSync(archivo).isFile()) return next();

        res.setHeader('Content-Type', tipos[extname(archivo).toLowerCase()] || 'application/octet-stream');
        createReadStream(archivo).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // El panel se sirve bajo /app/; la raíz del dominio es el sitio público.
  base: '/app/',
  resolve: {
    alias: {
      src: resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), sitioPublicoEnDesarrollo()],
});
