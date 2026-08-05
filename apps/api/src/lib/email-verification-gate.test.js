import { describe, expect, it } from 'vitest'
import { mustBlockUnverifiedEmail } from './email-verification-gate.js'

describe('mustBlockUnverifiedEmail', () => {
  it('blocks when OTP is enabled and email is not verified', () => {
    expect(mustBlockUnverifiedEmail({ otpEnabled: true, emailVerified: false })).toBe(true)
    expect(mustBlockUnverifiedEmail({ otpEnabled: true, emailVerified: undefined })).toBe(true)
  })

  it('allows when email is verified', () => {
    expect(mustBlockUnverifiedEmail({ otpEnabled: true, emailVerified: true })).toBe(false)
  })

  it('allows when OTP is disabled even if unverified', () => {
    expect(mustBlockUnverifiedEmail({ otpEnabled: false, emailVerified: false })).toBe(false)
  })
})
