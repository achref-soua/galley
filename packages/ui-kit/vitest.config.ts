import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [
    // Keep TypeScript preprocessing but skip Vite's CSS path under Vitest — the
    // Svelte compiler handles plain `<style>`, and the CSS pipeline is not
    // initialised in the test environment (see apps/desktop/vitest.config.ts).
    svelte({ configFile: false, hot: false, preprocess: vitePreprocess({ style: false }) }),
    svelteTesting()
  ],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/**/*.stories.*'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
});
