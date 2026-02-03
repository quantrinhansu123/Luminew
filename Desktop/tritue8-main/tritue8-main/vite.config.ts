import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
    plugins: [
        tailwindcss(),
        react({
            babel: {
                plugins: [['babel-plugin-react-compiler']],
            },
        }),
    ],
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        open: true,
    },
}));
