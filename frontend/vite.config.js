import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // Permite abrir la tienda desde el túnel público de ngrok (necesario para Mercado Pago).
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'],
    https: {
      key: fs.readFileSync(path.resolve('../backend/certificados/localhost-key.pem')),
      cert: fs.readFileSync(path.resolve('../backend/certificados/localhost-cert.pem'))
    },
    proxy: {
      '/api': {
        target: 'https://localhost:3443',
        changeOrigin: true,
        secure: false
      }
    }
  }
});