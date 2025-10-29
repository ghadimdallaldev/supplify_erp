import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'Supplify E2E Tests',
    globals: true,
    environment: 'node',
    include: ['**/*.test.js'],
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 30000,
    teardownTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '**/*.config.js',
        '**/setup.js'
      ]
    }
  }
});

