import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const rootDir = process.cwd();
const requestedPort = Number(process.env.QA_PORT || 4173);
const qaPort = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
  ? requestedPort
  : 4173;
const qaBaseUrl = `http://127.0.0.1:${qaPort}`;

export default defineConfig({
  testDir: path.resolve(rootDir, 'qa/tests'),
  outputDir: path.resolve(rootDir, 'qa/test-results'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(rootDir, 'qa/reports'), open: 'never' }],
  ],
  use: {
    baseURL: qaBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Teléfono Android típico de caja (412x915, táctil, DPR 2.6).
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
      testMatch: /responsive-smoke\.spec\.ts/,
    },
    {
      // Tablet en horizontal, el formato habitual de un POS de mostrador.
      name: 'tablet-chromium',
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
      testMatch: /responsive-smoke\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm --prefix web run preview -- --host 127.0.0.1 --port ${qaPort}`,
    cwd: rootDir,
    url: qaBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
