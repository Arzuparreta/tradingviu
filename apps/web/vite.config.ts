import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, repoRoot, '');
  const webPort = Number(env.WEB_PORT ?? 5187);
  const apiPort = env.API_PORT ?? '3101';
  const apiTarget = `http://localhost:${apiPort}`;
  const wsTarget = `ws://localhost:${apiPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // Shims for Node built-in modules pulled in via @tv/core barrel exports.
        // These are only used server-side; the shims are dead code in the browser.
        'node:async_hooks': path.resolve(__dirname, 'src/shims/async-hooks.ts'),
        'node:fs': path.resolve(__dirname, 'src/shims/node-fs.ts'),
        'node:path': path.resolve(__dirname, 'src/shims/node-path.ts'),
      },
    },
    server: {
      port: webPort,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, timeout: 8_000 },
        '/auth': { target: apiTarget, changeOrigin: true, timeout: 8_000 },
        '/admin': { target: apiTarget, changeOrigin: true, timeout: 8_000 },
        '/health': { target: apiTarget, changeOrigin: true, timeout: 8_000 },
        '/ws': { target: wsTarget, ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  };
});
