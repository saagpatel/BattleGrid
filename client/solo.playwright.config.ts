import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const staticRoot = process.env.BATTLEGRID_STATIC_ROOT ?? join(tmpdir(), 'battlegrid-solo-static');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/battlegrid/';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'solo.spec.ts',
  timeout: 120_000,
  reporter: 'line',
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? join(tmpdir(), 'battlegrid-solo-playwright-results'),
  use: {
    baseURL,
    headless: true,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `VITE_BASE_PATH=/battlegrid/ VITE_OUT_DIR=${staticRoot}/battlegrid pnpm vite build && python3 -m http.server 4173 --bind 127.0.0.1 --directory ${staticRoot}`,
    url: baseURL,
    cwd: '.',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
