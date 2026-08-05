import { describe, expect, it } from 'vitest'
import {
  identityConflictResponse,
  isReservedUsername,
  isUniqueViolation,
  normalizeConsumerUsername,
  normalizeIdentityEmail,
  normalizePhoneE164,
} from './identity-normalize.js'

describe('identity normalization', () => {
  it('normalizes email without provider-specific aliasing', () => {
    expect(normalizeIdentityEmail('  User+tag@Example.COM ')).toBe('user+tag@example.com')
  })

  it('rejects malformed emails', () => {
    expect(() => normalizeIdentityEmail('not-an-email')).toThrow('valid email')
  })

  it('normalizes and reserves consumer usernames', () => {
    expect(normalizeConsumerUsername('  My_User ')).toBe('my_user')
    expect(isReservedUsername('Admin')).toBe(true)
    expect(() => normalizeConsumerUsername('admin')).toThrow('Username')
  })

  it('requires an international phone country code', () => {
    expect(normalizePhoneE164('00961 3 123 456')).toBe('+9613123456')
    expect(normalizePhoneE164('03123456', '961')).toBe('+9613123456')
    expect(() => normalizePhoneE164('03123456')).toThrow('international')
  })

  it('detects unique violations without exposing SQL', () => {
    expect(isUniqueViolation({ code: '23505', detail: 'sensitive SQL detail' })).toBe(true)
    const res = { req: { requestId: 'r1' }, status: () => res, json: (body) => body }
    expect(identityConflictResponse(res).error.message).toContain('email')
  })
})
