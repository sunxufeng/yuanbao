import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import chromeManifest from './src/manifest';
import firefoxManifest from './src/manifest.firefox';

// T10 多浏览器：BUILD_TARGET=firefox 时切换为 Firefox 专用 manifest
const manifest = process.env.BUILD_TARGET === 'firefox' ? firefoxManifest : chromeManifest;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/chunk-[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
} as any);
