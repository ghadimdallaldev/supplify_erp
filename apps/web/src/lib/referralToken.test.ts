import { afterEach, describe, expect, it } from 'vitest'
import {
  clearReferralToken,
  getRegisterCompletePath,
  peekReferralToken,
  storeReferralToken,
} from './referralToken'

describe('referralToken', () => {
  afterEach(() => {
    clearReferralToken()
  })

  it('stores and peeks referral token', () => {
    storeReferralToken('abc123')
    expect(peekReferralToken()).toBe('abc123')
  })

  it('clears referral token', () => {
    storeReferralToken('abc123')
    clearReferralToken()
    expect(peekReferralToken()).toBeUndefined()
  })

  it('builds register complete path with ref when stored', () => {
    storeReferralToken('tok/en')
    expect(getRegisterCompletePath()).toBe('/register/complete?ref=tok%2Fen')
  })

  it('builds register complete path without ref when absent', () => {
    expect(getRegisterCompletePath()).toBe('/register/complete')
  })
})
