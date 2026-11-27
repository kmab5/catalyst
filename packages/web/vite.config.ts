import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { catalystMockPlugin } from './mock/plugin';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'mock' ? [catalystMockPlugin()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@catalyst/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    proxy:
      mode === 'mock'
        ? undefined
        : {
            '/api': {
              target: 'http://127.0.0.1:4321',
              changeOrigin: true,
            },
          },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
