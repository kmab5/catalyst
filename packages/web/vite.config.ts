import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { catalystMockPlugin } from './mock/plugin';

const enginePort = Number(process.env.CATALYST_PORT ?? 4321);
const engineOrigin = 'http://127.0.0.1:' + enginePort;

function devLaunchToken(): Plugin {
  return {
    name: 'catalyst-dev-launch-token',
    apply: 'serve',
    async transformIndexHtml(html) {
      try {
        const index = await fetch(engineOrigin, {
          redirect: 'error',
          signal: AbortSignal.timeout(1500),
        });
        if (!index.ok) return html;
        // Reuse only the server's escaped meta tag; Vite supplies the rest of the HTML.
        const tag = (await index.text()).match(/<meta name="catalyst-token" content="[^"]*">/)?.[0];
        return tag ? html.replace('</head>', () => tag + '</head>') : html;
      } catch {
        return html;
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  // All supported browsers handle destructured parameters in React components.
  esbuild: { supported: { destructuring: true } },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'mock'
      ? [catalystMockPlugin()]
      : mode === 'development'
        ? [devLaunchToken()]
        : []),
  ],
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
              target: engineOrigin,
              changeOrigin: true,
            },
          },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'mock/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
