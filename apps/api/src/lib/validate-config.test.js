import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  APP_ENV: 'prod',
  NODE_ENV: 'production',
  SESSION_SECRET: 'a'.repeat(48),
  IMPERSONATION_SECRET: 'b'.repeat(48),
  KEYCLOAK_CLIENT_SECRET: 'kc-secret-32-chars-minimum-ok!!',
  DATABASE_URL: 'postgresql://user:strongpass@db.example.com:5432/supplify',
  DATABASE_SSL: true,
  WEB_ORIGINS: ['https://app.example.com'],
  SENDGRID_API_KEY: 'sg-test',
  PAYMENTS_MODE: 'live',
  STORAGE_DRIVER: 's3',
  STORAGE_ACCESS_KEY_ID: 'access-key-prod',
  STORAGE_SECRET_ACCESS_KEY: 'secret-key-prod-32chars-min',
  COOKIE_SECURE: true,
  RATE_LIMIT_ENABLED: true,
  ENABLE_SWAGGER: false,
  ENABLE_DEBUG_ROUTES: false,
  ENABLE_SEED_ROUTES: false,
  ALLOW_DB_RESET: false,
  SEED_DEMO_DATA: false,
  E2E_SECRET: '',
  PAYMENTS_WEBHOOK_SECRET: 'whsec_test',
}))

vi.mock('../config/env.js', () => ({
  config: mockConfig,
}))

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe('validateProductionConfig prod safety', () => {
  beforeEach(() => {
    Object.assign(mockConfig, {
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      PAYMENTS_MODE: 'live',
      STORAGE_DRIVER: 's3',
      WEB_ORIGINS: ['https://app.example.com'],
      ENABLE_DEBUG_ROUTES: false,
      ENABLE_SEED_ROUTES: false,
      ALLOW_DB_RESET: false,
      SEED_DEMO_DATA: false,
      E2E_SECRET: '',
      COOKIE_SECURE: true,
      RATE_LIMIT_ENABLED: true,
    })
  })

  it('accepts a valid prod configuration', async () => {
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })

  it('rejects PAYMENTS_MODE=mock in prod', async () => {
    mockConfig.PAYMENTS_MODE = 'mock'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/mock/)
  })

  it('rejects STORAGE_DRIVER=local in prod', async () => {
    mockConfig.STORAGE_DRIVER = 'local'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/STORAGE_DRIVER=local/)
  })

  it('rejects wildcard CORS origins in prod', async () => {
    mockConfig.WEB_ORIGINS = ['*']
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/wildcards/)
  })

  it('rejects ENABLE_DEBUG_ROUTES in prod', async () => {
    mockConfig.ENABLE_DEBUG_ROUTES = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/ENABLE_DEBUG_ROUTES/)
  })

  it('rejects ENABLE_SEED_ROUTES in prod', async () => {
    mockConfig.ENABLE_SEED_ROUTES = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/ENABLE_SEED_ROUTES/)
  })

  it('rejects ALLOW_DB_RESET in prod', async () => {
    mockConfig.ALLOW_DB_RESET = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/ALLOW_DB_RESET/)
  })

  it('allows PAYMENTS_MODE=live in prod', async () => {
    mockConfig.PAYMENTS_MODE = 'live'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })

  it('rejects SEED_DEMO_DATA in prod', async () => {
    mockConfig.SEED_DEMO_DATA = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/SEED_DEMO_DATA/)
  })
})

describe('validateProductionConfig dev (Railway)', () => {
  it('skips strict checks when APP_ENV=dev even if NODE_ENV=production', async () => {
    Object.assign(mockConfig, {
      APP_ENV: 'dev',
      NODE_ENV: 'production',
      KEYCLOAK_CLIENT_SECRET: 'changeme',
      SESSION_SECRET: 'short',
      SENDGRID_API_KEY: '',
      SMTP_HOST: '',
    })
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })
})
