import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke test for the reading loop. Runs against `vite preview` of
// the Pages build (`npm run build:pages` first), on desktop and phone
// Chromium. The preview adds `Accept-Ranges: bytes` like GitHub Pages does,
// so the PDF transport under test matches production.
const PORT = 4173;

export default defineConfig({
  testDir: 'scripts/e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --config vite.pages.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // iPhone 15 descriptor: touch, coarse pointer, 3× density; Chromium
      // instead of WebKit because the suite is Chromium-only.
      name: 'phone',
      use: {
        ...devices['iPhone 15'],
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
      },
    },
  ],
});
