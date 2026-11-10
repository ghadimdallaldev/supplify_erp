import { describe, expect, it } from 'vitest'
import { loginPathWithReturnTo, sanitizeReturnTo } from './returnTo'

describe('sanitizeReturnTo', () => {
  it('accepts same-origin relative paths', () => {
    expect(sanitizeReturnTo('/app/orders?status=PLACED#top')).toBe('/app/orders?status=PLACED#top')
  })

  it('rejects absolute, protocol-relative and scheme URLs', () => {
    expect(sanitizeReturnTo('https://evil.example/app')).toBeNull()
    expect(sanitizeReturnTo('//evil.example/app')).toBeNull()
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull()
    expect(sanitizeReturnTo('app/orders')).toBeNull()
  })

  it('rejects backslash and control character tricks', () => {
    expect(sanitizeReturnTo('/\\evil.example')).toBeNull()
    expect(sanitizeReturnTo('/app\r\nSet-Cookie: x=1')).toBeNull()
  })

  it('rejects empty values and the login page itself', () => {
    expect(sanitizeReturnTo(null)).toBeNull()
    expect(sanitizeReturnTo('')).toBeNull()
    expect(sanitizeReturnTo('/login?returnTo=/app')).toBeNull()
  })
})

describe('loginPathWithReturnTo', () => {
  it('encodes a safe path', () => {
    expect(loginPathWithReturnTo('/app/orders?x=1')).toBe(
      `/login?returnTo=${encodeURIComponent('/app/orders?x=1')}`
    )
  })

  it('falls back to plain /login for unsafe values', () => {
    expect(loginPathWithReturnTo('//evil.example')).toBe('/login')
  })
})
