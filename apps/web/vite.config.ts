import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5147,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/billing': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/webhooks': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/admin': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/health': { target: 'http://localhost:3001', changeOrigin: true, timeout: 8_000 },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
