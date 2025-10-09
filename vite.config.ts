import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/frontend',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: [
      'webview.ngrok.dev',
      '.ngrok.dev',
      'localhost'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8040',
        changeOrigin: true
      },
      '/webview': {
        target: 'http://localhost:8040',
        changeOrigin: true
      },
      '/webhook': {
        target: 'http://localhost:8040',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
