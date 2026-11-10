import { describe, it, expect } from 'vitest'
import { resolveCallbackOrigin } from './oauth-callback-origin.js'

const base = {
  configured: '',
  forwardedHost: '',
  forwardedProto: '',
  host: 'api.internal:4000',
  protocol: 'http',
  allowedOrigins: ['https://app.example.com', 'https://api.example.com'],
  fallbackOrigin: 'https://app.example.com',
  allowUnlistedHost: false,
}

describe('resolveCallbackOrigin', () => {
  it('prefers the explicit OAUTH_CALLBACK_BASE_URL (trailing slash trimmed)', () => {
    expect(
      resolveCallbackOrigin({
        ...base,
        configured: 'https://app.example.com/',
        forwardedHost: 'evil.test',
      })
    ).toBe('https://app.example.com')
  })

  it('accepts an X-Forwarded-Host that is in the allowlist', () => {
    expect(
      resolveCallbackOrigin({ ...base, forwardedHost: 'app.example.com', forwardedProto: 'https' })
    ).toBe('https://app.example.com')
  })

  it('ignores an attacker-supplied X-Forwarded-Host and falls back to the configured web origin', () => {
    expect(
      resolveCallbackOrigin({ ...base, forwardedHost: 'evil.test', forwardedProto: 'https' })
    ).toBe('https://app.example.com')
  })

  it('uses only the first value of a comma-separated forwarded host', () => {
    expect(resolveCallbackOrigin({ ...base, forwardedHost: 'evil.test, app.example.com' })).toBe(
      'https://app.example.com'
    )
    expect(resolveCallbackOrigin({ ...base, forwardedHost: 'api.example.com, evil.test' })).toBe(
      'https://api.example.com'
    )
  })

  it('takes the scheme from the allowlisted origin, not the forwarded proto', () => {
    expect(
      resolveCallbackOrigin({
        ...base,
        forwardedHost: 'app.example.com',
        forwardedProto: 'javascript',
      })
    ).toBe('https://app.example.com')
  })

  it('does not trust an unlisted Host header outside local dev', () => {
    expect(resolveCallbackOrigin({ ...base, host: 'evil.test' })).toBe('https://app.example.com')
  })

  it('keeps the request Host fallback in local dev', () => {
    expect(
      resolveCallbackOrigin({ ...base, host: 'localhost:4000', allowUnlistedHost: true })
    ).toBe('http://localhost:4000')
  })
})
