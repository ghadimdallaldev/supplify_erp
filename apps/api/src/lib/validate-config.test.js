import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  APP_ENV: 'prod',
  NODE_ENV: 'production',
  SESSION_SECRET: 'a'.repeat(48),
  IMPERSONATION_SECRET: 'b'.repeat(48),
  ACTIVE_TENANT_SECRET: 'c'.repeat(48),
  ACTIVE_TENANT_SECRET_IS_FALLBACK: false,
  KEYCLOAK_CLIENT_SECRET: 'kc-secret-32-chars-minimum-ok!!',
  DATABASE_URL: 'postgresql://user:strongpass@db.example.com:5432/supplify',
  DATABASE_SSL: true,
  WEB_ORIGINS: ['https://app.example.com'],
  SMTP_HOST: 'smtp.example.com',
  SMTP_PASS: 'smtp-secret',
  PAYMENTS_MODE: 'live',
  BILLING_GATEWAY: 'manual',
  BILLING_GATEWAY_EXPLICIT: true,
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
  REDIS_URL: 'redis://localhost:6379',
  ALLOW_AUTO_SUPER_ADMIN: false,
  OAUTH_CALLBACK_BASE_URL: 'https://app.example.com',
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
      BILLING_GATEWAY: 'manual',
      BILLING_GATEWAY_EXPLICIT: true,
      STORAGE_DRIVER: 's3',
      WEB_ORIGINS: ['https://app.example.com'],
      ENABLE_DEBUG_ROUTES: false,
      ENABLE_SEED_ROUTES: false,
      ALLOW_DB_RESET: false,
      SEED_DEMO_DATA: false,
      E2E_SECRET: '',
      COOKIE_SECURE: true,
      RATE_LIMIT_ENABLED: true,
      ALLOW_AUTO_SUPER_ADMIN: false,
      OAUTH_CALLBACK_BASE_URL: 'https://app.example.com',
    })
  })

  it('requires OAUTH_CALLBACK_BASE_URL in prod', async () => {
    mockConfig.OAUTH_CALLBACK_BASE_URL = ''
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/OAUTH_CALLBACK_BASE_URL/)
  })

  it('requires OAUTH_CALLBACK_BASE_URL in preprod', async () => {
    mockConfig.APP_ENV = 'preprod'
    mockConfig.PAYMENTS_MODE = 'test'
    mockConfig.OAUTH_CALLBACK_BASE_URL = ''
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/OAUTH_CALLBACK_BASE_URL/)
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

  it('rejects ALLOW_AUTO_SUPER_ADMIN in prod', async () => {
    mockConfig.ALLOW_AUTO_SUPER_ADMIN = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/ALLOW_AUTO_SUPER_ADMIN/)
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

  it('allows PAYMENTS_MODE=live in prod with manual gateway', async () => {
    mockConfig.PAYMENTS_MODE = 'live'
    mockConfig.BILLING_GATEWAY = 'manual'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })

  it('rejects an implicit (defaulted) BILLING_GATEWAY with PAYMENTS_MODE=live in prod', async () => {
    mockConfig.PAYMENTS_MODE = 'live'
    mockConfig.BILLING_GATEWAY = 'manual'
    mockConfig.BILLING_GATEWAY_EXPLICIT = false
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/BILLING_GATEWAY must be set explicitly/)
  })

  it('rejects BILLING_GATEWAY=stub with PAYMENTS_MODE=live in prod', async () => {
    mockConfig.PAYMENTS_MODE = 'live'
    mockConfig.BILLING_GATEWAY = 'stub'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/BILLING_GATEWAY=stub/)
  })

  it('rejects SEED_DEMO_DATA in prod', async () => {
    mockConfig.SEED_DEMO_DATA = true
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/SEED_DEMO_DATA/)
  })
})

describe('validateProductionConfig dev (Railway)', () => {
  const hostedDev = {
    APP_ENV: 'dev',
    NODE_ENV: 'production',
    KEYCLOAK_CLIENT_SECRET: 'changeme',
    SESSION_SECRET: 'short-but-not-default',
    IMPERSONATION_SECRET: 'short-but-not-default-2',
    ACTIVE_TENANT_SECRET: 'short-but-not-default-3',
    CONSUMER_AUTH_SECRET: 'short-but-not-default-4',
    RATE_LIMIT_ENABLED: true,
    OAUTH_CALLBACK_BASE_URL: '',
    SMTP_HOST: '',
    SMTP_PASS: '',
  }

  it('skips strict checks when APP_ENV=dev even if NODE_ENV=production', async () => {
    Object.assign(mockConfig, hostedDev)
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })

  it('refuses disabled rate limiting on a hosted dev image', async () => {
    Object.assign(mockConfig, hostedDev, { RATE_LIMIT_ENABLED: false })
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/RATE_LIMIT_ENABLED/)
  })

  it('refuses default or empty signing secrets on a hosted dev image', async () => {
    Object.assign(mockConfig, hostedDev, {
      SESSION_SECRET: 'dev-session-secret-change-me',
      CONSUMER_AUTH_SECRET: 'dev-consumer-auth-secret',
      ACTIVE_TENANT_SECRET: '',
    })
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/SESSION_SECRET/)
    expect(() => validateProductionConfig()).toThrow(/CONSUMER_AUTH_SECRET/)
    expect(() => validateProductionConfig()).toThrow(/ACTIVE_TENANT_SECRET/)
  })

  it('stays relaxed for local dev (NODE_ENV=development)', async () => {
    Object.assign(mockConfig, hostedDev, {
      NODE_ENV: 'development',
      RATE_LIMIT_ENABLED: false,
      SESSION_SECRET: 'dev-session-secret-change-me',
    })
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow()
  })
})

describe('validateProductionConfig email provider', () => {
  beforeEach(() => {
    Object.assign(mockConfig, {
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      PAYMENTS_MODE: 'live',
      BILLING_GATEWAY: 'manual',
      BILLING_GATEWAY_EXPLICIT: true,
      STORAGE_DRIVER: 's3',
      WEB_ORIGINS: ['https://app.example.com'],
      COOKIE_SECURE: true,
      RATE_LIMIT_ENABLED: true,
      OAUTH_CALLBACK_BASE_URL: 'https://app.example.com',
      EMAIL_ENABLED: true,
      EMAIL_LOG_ONLY: false,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      SMTP_HOST: '',
      SMTP_PASS: '',
    })
  })

  afterEach(() => {
    delete mockConfig.EMAIL_ENABLED
    delete mockConfig.EMAIL_LOG_ONLY
    delete mockConfig.EMAIL_PROVIDER
    delete mockConfig.RESEND_API_KEY
    mockConfig.SMTP_HOST = 'smtp.example.com'
    mockConfig.SMTP_PASS = 'smtp-secret'
  })

  it('accepts resend with RESEND_API_KEY and no SMTP vars', async () => {
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow(/EMAIL/)
  })

  it('accepts resend with SMTP_PASS when SMTP_HOST is smtp.resend.com', async () => {
    mockConfig.RESEND_API_KEY = ''
    mockConfig.SMTP_HOST = 'smtp.resend.com'
    mockConfig.SMTP_PASS = 're_from_smtp_pass'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).not.toThrow(/EMAIL/)
  })

  it('rejects resend without any key', async () => {
    mockConfig.RESEND_API_KEY = ''
    mockConfig.SMTP_HOST = 'smtp.example.com'
    mockConfig.SMTP_PASS = 'smtp-secret'
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/EMAIL_PROVIDER=resend requires/)
  })

  it('keeps the SMTP rule for the smtp provider', async () => {
    mockConfig.EMAIL_PROVIDER = 'smtp'
    mockConfig.RESEND_API_KEY = ''
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/SMTP_HOST\+SMTP_PASS/)
  })
})

describe('validateProductionConfig REDIS_URL', () => {
  beforeEach(() => {
    Object.assign(mockConfig, {
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      SESSION_SECRET: 'a'.repeat(48),
      IMPERSONATION_SECRET: 'b'.repeat(48),
      ACTIVE_TENANT_SECRET: 'c'.repeat(48),
      ACTIVE_TENANT_SECRET_IS_FALLBACK: false,
      KEYCLOAK_CLIENT_SECRET: 'kc-secret-32-chars-minimum-ok!!',
      DATABASE_URL: 'postgresql://user:strongpass@db.example.com:5432/supplify',
      DATABASE_SSL: true,
      WEB_ORIGINS: ['https://app.example.com'],
      PAYMENTS_MODE: 'live',
      BILLING_GATEWAY: 'manual',
      STORAGE_DRIVER: 's3',
      STORAGE_ACCESS_KEY_ID: 'access-key-prod',
      STORAGE_SECRET_ACCESS_KEY: 'secret-key-prod-32chars-min',
      COOKIE_SECURE: true,
      RATE_LIMIT_ENABLED: true,
      ENABLE_DEBUG_ROUTES: false,
      ENABLE_SEED_ROUTES: false,
      ALLOW_DB_RESET: false,
      SEED_DEMO_DATA: false,
      E2E_SECRET: '',
      PAYMENTS_WEBHOOK_SECRET: 'whsec_test',
      REDIS_URL: '',
    })
  })

  it('rejects missing REDIS_URL in prod', async () => {
    const { validateProductionConfig } = await import('./validate-config.js')
    expect(() => validateProductionConfig()).toThrow(/REDIS_URL/)
  })
})
