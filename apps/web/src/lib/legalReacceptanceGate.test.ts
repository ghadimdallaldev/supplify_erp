import { describe, expect, it } from 'vitest'
import { needsLegalReacceptance, isLegalReacceptanceSatisfied } from './legalReacceptanceGate'
import type { User } from '../types'

const baseUser: User = {
  id: 'u1',
  email: 'a@b.com',
  displayName: 'Test',
  role: 'RESTAURANT',
  createdAt: new Date().toISOString(),
}

describe('legalReacceptanceGate', () => {
  it('requires reacceptance when legalStatus.needsReacceptance is true', () => {
    expect(
      needsLegalReacceptance({
        ...baseUser,
        legalStatus: {
          needsReacceptance: true,
          currentPackVersion: '2026-06-09',
          acceptedPackVersion: '2026-05-28',
          requiredDocuments: ['terms_and_conditions'],
          missingDocuments: ['terms_and_conditions'],
          variant: 'registration',
          accountType: 'RESTAURANT',
        },
      })
    ).toBe(true)
  })

  it('skips reacceptance for PENDING users', () => {
    expect(
      needsLegalReacceptance({
        ...baseUser,
        role: 'PENDING',
        legalStatus: {
          needsReacceptance: true,
          currentPackVersion: '2026-06-09',
          acceptedPackVersion: null,
          requiredDocuments: [],
          missingDocuments: ['terms_and_conditions'],
          variant: 'invite',
          accountType: null,
        },
      })
    ).toBe(false)
  })

  it('is satisfied when needsReacceptance is false', () => {
    expect(
      isLegalReacceptanceSatisfied({
        needsReacceptance: false,
        currentPackVersion: '2026-06-09',
        acceptedPackVersion: '2026-06-09',
        requiredDocuments: [],
        missingDocuments: [],
        variant: 'invite',
        accountType: null,
      })
    ).toBe(true)
  })
})
