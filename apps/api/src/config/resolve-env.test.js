import { describe, expect, it } from 'vitest'
import { envBool, resolveAppEnv, resolvePaymentsMode, resolveWebOrigins } from './resolve-env.js'

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
