import { describe, it, expect } from 'vitest'
import {
  extractBearerToken,
  extractAccessToken,
  extractRefreshToken,
  extractActiveTenantToken,
  isBearerAuthRequest,
  ACTIVE_TENANT_TOKEN_HEADER,
} from './mobile-auth.js'

describe('mobile-auth helpers', () => {
  it('extractBearerToken parses Authorization header', () => {
    const req = { headers: { authorization: 'Bearer abc.def.ghi' } }
    expect(extractBearerToken(req)).toBe('abc.def.ghi')
  })

  it('extractBearerToken returns null for missing header', () => {
    expect(extractBearerToken({ headers: {} })).toBeNull()
    expect(extractBearerToken({ headers: { authorization: 'Basic x' } })).toBeNull()
  })

  it('extractAccessToken prefers Bearer over cookie', () => {
    const req = {
      headers: { authorization: 'Bearer bearer-token' },
      cookies: { access_token: 'cookie-token' },
    }
    expect(extractAccessToken(req)).toBe('bearer-token')
  })

  it('extractAccessToken falls back to cookie', () => {
    const req = { headers: {}, cookies: { access_token: 'cookie-token' } }
    expect(extractAccessToken(req)).toBe('cookie-token')
  })

  it('extractRefreshToken reads body for mobile', () => {
    const req = {
      body: { refresh_token: ' mobile-refresh ' },
      cookies: { refresh_token: 'cookie' },
    }
    expect(extractRefreshToken(req)).toBe('mobile-refresh')
  })

  it('extractRefreshToken falls back to cookie', () => {
    const req = { body: {}, cookies: { refresh_token: 'cookie-refresh' } }
    expect(extractRefreshToken(req)).toBe('cookie-refresh')
  })

  it('extractActiveTenantToken reads header', () => {
    const req = { headers: { [ACTIVE_TENANT_TOKEN_HEADER]: ' tenant-jwt ' } }
    expect(extractActiveTenantToken(req)).toBe('tenant-jwt')
  })

  it('isBearerAuthRequest detects bearer requests', () => {
    expect(isBearerAuthRequest({ headers: { authorization: 'Bearer tok' } })).toBe(true)
    expect(isBearerAuthRequest({ headers: {}, cookies: { access_token: 'c' } })).toBe(false)
  })
})
