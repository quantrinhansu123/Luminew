import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// Express (server.js) mặc định cổng 3002 — không trùng Vite 3001.
// Ghi đè: VITE_DEV_API_PROXY=http://127.0.0.1:9999 npm run dev

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:3002';

  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
    host: '0.0.0.0', // Listen on all interfaces (IPv4 and IPv6)
    open: true,
    proxy: {
      '/api/van-don': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/sync-mkt': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // Keep /api/sync-mkt as is
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
        },
      },
      '/api/fetch-detail-reports': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // Keep /api/fetch-detail-reports as is
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
        },
      },
      '/api/baocaoVandonNvData': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('baocaoVandonNvData proxy error (chạy `npm run server` trên cổng 3002?)', err);
          });
        },
      },
      // Proxy for local API server to bypass CORS
      '/api/local': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/local/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('local API proxy error', err);
          });
        },
      }
    }
  }
};
})
