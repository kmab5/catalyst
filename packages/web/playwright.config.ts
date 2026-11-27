import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseURL = process.env.CATALYST_SMOKE_URL ?? 'http://127.0.0.1:4400';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL, browserName: 'chromium', viewport: { width: 1440, height: 980 }, trace: 'retain-on-failure' },
  webServer: process.env.CATALYST_SMOKE_URL ? undefined : {
    command: 'node scripts/browser-smoke-server.mjs',
    cwd: root, url: baseURL + '/api/health', timeout: 60_000, reuseExistingServer: false,
  },
});
