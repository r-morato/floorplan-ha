import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset URL relative so the app works under
// Home Assistant ingress (/api/hassio_ingress/<token>/) as well as at '/'.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8099', ws: true },
      '/media': 'http://localhost:8099',
    },
  },
});
