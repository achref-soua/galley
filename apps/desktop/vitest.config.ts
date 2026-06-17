import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [
    // Under Vitest, keep TypeScript script preprocessing but skip Vite's CSS
    // preprocessing (plain `<style>` is handled by the Svelte compiler, and the
    // CSS path is not initialised in the Vitest environment).
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
      exclude: ['src/main.ts', 'src/vite-env.d.ts'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
});
