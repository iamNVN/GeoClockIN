import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3001',
    changeOrigin: true,
  },
};

// Builds into the repository's dist/ (the admin dashboard goes to dist/admin).
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
