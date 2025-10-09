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
        target: 'http://localhost:3002',
        changeOrigin: true,
        // Special handling for SSE
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] 📡 Proxying:', req.method, req.url, '→', proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] ✅ Response:', req.url, '→', proxyRes.statusCode);
          });
        }
      },
      '/webview': {
        target: 'http://localhost:3002',
        changeOrigin: true
      },
      '/webhook': {
        target: 'http://localhost:3002',
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
