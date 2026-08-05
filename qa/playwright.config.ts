import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const rootDir = process.cwd();

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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm --prefix web run preview -- --host 127.0.0.1 --port 4173',
    cwd: rootDir,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
