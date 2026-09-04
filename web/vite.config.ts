/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { assertProductionBackendUrl } from './src/config/buildEnvironment';

const VENDOR_CHUNKS: Array<{ name: string; test: RegExp }> = [
  { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
  { name: 'firebase-vendor', test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/ },
  { name: 'charts-vendor', test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory-vector-icon|internmap|delaunator|robust-predicates)[\\/]/ },
  { name: 'scanner-vendor', test: /[\\/]node_modules[\\/]html5-qrcode[\\/]/ },
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  assertProductionBackendUrl(mode, env.VITE_BACKEND_URL);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icons/*.png'],
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const match = VENDOR_CHUNKS.find((chunk) => chunk.test.test(id));
            return match?.name;
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});
