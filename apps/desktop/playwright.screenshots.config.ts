import { defineConfig } from '@playwright/test';

// Dedicated config for regenerating the marketing screenshots and the demo
// recording from the live web UI. Kept separate from the e2e smoke config so
// `just e2e` stays fast and side-effect free. Run with `just screenshots`.
export default defineConfig({
  testDir: './media',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  },
  webServer: {
    command: 'pnpm dev',
    port: 1420,
    reuseExistingServer: true
  }
});
