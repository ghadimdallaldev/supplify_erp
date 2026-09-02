import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.js'],
    include: ['**/*.test.js', '../../tests/e2e/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '**/*.config.js',
        '**/scripts/**',
        '**/test/**',
        '**/tests/**',
        '**/migrations/**',
        '**/seed/**',
        '**/coverage/**',
        '**/dist/**',
      ],
      include: ['src/**/*.js'],
      all: true,
    },
  },
})
