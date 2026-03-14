import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? join(tmpdir(), 'battlegrid-playwright-results');

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  reporter: 'line',
  outputDir,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: 'make dev',
        url: baseURL,
        cwd: '..',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
