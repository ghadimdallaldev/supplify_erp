import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { baseURL, apiURL } from './e2e/utils/env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, 'e2e', '.auth')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  globalSetup: path.join(__dirname, 'e2e', 'auth.setup.ts'),
  projects: [
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /suites\/smoke\/.*\.spec\.ts/,
    },
    {
      name: 'critical_e2e_restaurant',
      use: { ...devices['Desktop Chrome'], storageState: path.join(authDir, 'restaurant.json') },
      testMatch: /suites\/critical_e2e\/.*\.spec\.ts/,
    },
    {
      name: 'critical_e2e_admin',
      use: { ...devices['Desktop Chrome'], storageState: path.join(authDir, 'admin.json') },
      testMatch: /suites\/critical_e2e\/.*\.spec\.ts/,
    },
    {
      name: 'critical_e2e_supplier',
      use: { ...devices['Desktop Chrome'], storageState: path.join(authDir, 'supplier.json') },
      testMatch: /suites\/critical_e2e\/.*\.spec\.ts/,
    },
    {
      name: 'nightly',
      use: { ...devices['Desktop Chrome'], storageState: path.join(authDir, 'restaurant.json') },
      testMatch: /suites\/nightly\/.*\.spec\.ts/,
    },
    {
      name: 'api',
      testDir: './api',
      use: { ...devices['Desktop Chrome'], baseURL: apiURL },
    },
  ],
  outputDir: 'test-results',
  timeout: 60000,
  expect: { timeout: 10000 },
})
