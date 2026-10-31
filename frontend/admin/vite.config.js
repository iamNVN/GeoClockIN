import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3001',
    changeOrigin: true,
  },
  // The default logo lives in the employee app (/brand); its dev server serves it locally.
  '/brand': { target: process.env.EMPLOYEE_URL ?? 'http://localhost:5173', changeOrigin: true },
};

// Tunnels (npx localtunnel, cloudflared, ngrok) for trying the dev servers on a
// phone over https: camera and location need a secure address.
const allowedHosts = ['.loca.lt', '.trycloudflare.com', '.ngrok-free.app'];

// Served from /admin on the same domain as the employee app, so both share
// the API and its cookies.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: { outDir: '../../dist/admin', emptyOutDir: true },
  server: { port: 5174, proxy: apiProxy, allowedHosts },
  preview: { port: 4174, proxy: apiProxy, allowedHosts },
});
