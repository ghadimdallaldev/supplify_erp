import { describe, expect, it } from 'vitest'
import {
  envBool,
  resolveAppEnv,
  resolvePaymentsMode,
  resolveBillingGatewayId,
  validateBillingGatewayPaymentsMode,
  resolveWebOrigins,
} from './resolve-env.js'
import { resolveNativeDatabaseUrl } from './resolve-database-url.js'

describe('resolve-env', () => {
  it('resolveAppEnv respects APP_ENV', () => {
    expect(resolveAppEnv('production')).toBe('prod')
    expect(resolveAppEnv('development')).toBe('dev')
  })

  it('resolvePaymentsMode defaults by app env', () => {
    expect(resolvePaymentsMode('dev', 'development')).toBe('mock')
    expect(resolvePaymentsMode('preprod', 'production')).toBe('test')
    expect(resolvePaymentsMode('prod', 'production')).toBe('live')
  })

  it('resolveBillingGatewayId defaults to manual for live (never silent stub)', () => {
    const prev = process.env.BILLING_GATEWAY
    const prevProv = process.env.PAYMENTS_PROVIDER
    delete process.env.BILLING_GATEWAY
    delete process.env.PAYMENTS_PROVIDER
    expect(resolveBillingGatewayId('live')).toBe('manual')
    expect(resolveBillingGatewayId('mock')).toBe('stub')
    expect(resolveBillingGatewayId('test')).toBe('stub')
    if (prev == null) delete process.env.BILLING_GATEWAY
    else process.env.BILLING_GATEWAY = prev
    if (prevProv == null) delete process.env.PAYMENTS_PROVIDER
    else process.env.PAYMENTS_PROVIDER = prevProv
  })

  it('validateBillingGatewayPaymentsMode rejects stub+live', () => {
    expect(
      validateBillingGatewayPaymentsMode({ paymentsMode: 'live', billingGateway: 'stub' })
    ).toMatch(/stub/)
    expect(
      validateBillingGatewayPaymentsMode({ paymentsMode: 'live', billingGateway: 'manual' })
    ).toBeNull()
    expect(
      validateBillingGatewayPaymentsMode({ paymentsMode: 'test', billingGateway: 'stub' })
    ).toBeNull()
  })

  it('resolveWebOrigins rejects wildcard', () => {
    const prev = process.env.CORS_ORIGIN
    process.env.CORS_ORIGIN = 'https://app.example.com,*'
    const origins = resolveWebOrigins({ appEnv: 'preprod', nodeEnv: 'production' })
    expect(origins).toEqual(['https://app.example.com'])
    if (prev == null) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = prev
  })

  it('envBool parses common truthy values', () => {
    expect(envBool('true', false)).toBe(true)
    expect(envBool('0', true)).toBe(false)
  })
})

describe('resolveNativeDatabaseUrl', () => {
  const railwayUrl = 'postgresql://user:pass@postgres.railway.internal:5432/railway'

  it('returns DATABASE_URL unchanged in production', () => {
    const prevNodeEnv = process.env.NODE_ENV
    const prevDb = process.env.DATABASE_URL
    const prevOverride = process.env.SUPPLIFY_DATABASE_URL
    process.env.NODE_ENV = 'production'
    delete process.env.SUPPLIFY_DATABASE_URL

    expect(resolveNativeDatabaseUrl(railwayUrl)).toBe(railwayUrl)

    process.env.NODE_ENV = prevNodeEnv
    if (prevDb == null) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = prevDb
    if (prevOverride == null) delete process.env.SUPPLIFY_DATABASE_URL
    else process.env.SUPPLIFY_DATABASE_URL = prevOverride
  })

  it('prefers SUPPLIFY_DATABASE_URL override', () => {
    const prev = process.env.SUPPLIFY_DATABASE_URL
    process.env.SUPPLIFY_DATABASE_URL = 'postgresql://override/db'
    expect(resolveNativeDatabaseUrl(railwayUrl)).toBe('postgresql://override/db')
    if (prev == null) delete process.env.SUPPLIFY_DATABASE_URL
    else process.env.SUPPLIFY_DATABASE_URL = prev
  })
})
