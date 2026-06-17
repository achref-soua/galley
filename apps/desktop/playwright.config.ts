import { defineConfig } from '@playwright/test';

// Smoke-level end-to-end check against the web UI served by Vite. The native
// Tauri-window WebDriver harness arrives once there is real native interaction
// to drive (see docs/adr/0002).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420'
  },
  webServer: {
    command: 'pnpm dev',
    port: 1420,
    reuseExistingServer: !process.env.CI
  }
});
