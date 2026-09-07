import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['packages/sdk/src/test/setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      'templates/**/examples/**/*.test.ts',
    ],
  },
});
