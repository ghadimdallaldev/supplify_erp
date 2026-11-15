import { getTokenExpiry, isAccessTokenExpired } from './session'

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

describe('session token helpers', () => {
  it('reads exp from JWT', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = makeJwt({ exp })
    expect(getTokenExpiry(token)).toBe(exp)
  })

  it('returns null for malformed token', () => {
    expect(getTokenExpiry('not-a-jwt')).toBeNull()
  })

  it('detects expired access token with skew', () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    const token = makeJwt({ exp })
    expect(isAccessTokenExpired(token)).toBe(true)
  })

  it('treats valid token as not expired', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = makeJwt({ exp })
    expect(isAccessTokenExpired(token)).toBe(false)
  })
})
