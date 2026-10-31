import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const apiProxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3001',
    changeOrigin: true,
  },
};

// Tunnels (npx localtunnel, cloudflared, ngrok) for trying the dev servers on a
// phone over https: camera and location need a secure address.
const allowedHosts = ['.loca.lt', '.trycloudflare.com', '.ngrok-free.app'];

// The office QR display (display.html) is served at /display, as on Vercel.
const displayRoute = {
  name: 'display-route',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/display' || req.url.startsWith('/display?')) req.url = '/display.html';
      next();
    });
  },
};

// Builds into the repository's dist/ (the admin dashboard goes to dist/admin).
export default defineConfig({
  plugins: [react(), displayRoute],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        display: fileURLToPath(new URL('./display.html', import.meta.url)),
      },
    },
  },
  server: { port: 5173, proxy: apiProxy, allowedHosts },
  preview: { port: 4173, proxy: apiProxy, allowedHosts },
});
