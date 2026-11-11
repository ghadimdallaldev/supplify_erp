import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'demo.spec.ts',
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: '../../test-results/horeca-browser',
  use: {
    baseURL: process.env.DEMO_BASE_URL || 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
  },
})
