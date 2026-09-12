import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateBranchInviteToken,
  evaluateInvitationPublicState,
  expireOldBranchInvitations,
} from './branch-invitations.js'

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('./keycloak-admin.js', () => ({
  createKeycloakUserWithPassword: vi.fn().mockResolvedValue({ userId: 'kc-1', created: true }),
}))

describe('branch-invitations lib', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('generateBranchInviteToken produces unique 96-char hex strings', () => {
    const a = generateBranchInviteToken()
    const b = generateBranchInviteToken()
    expect(a).toHaveLength(96)
    expect(b).toHaveLength(96)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]+$/)
  })

  it('evaluateInvitationPublicState marks expired invitations', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const state = evaluateInvitationPublicState({
      status: 'pending',
      expires_at: past,
      branch_name: 'North',
      organization_name: 'Org',
      role_name: 'Manager',
    })
    expect(state.valid).toBe(false)
    expect(state.reason).toBe('expired')
  })

  it('evaluateInvitationPublicState rejects revoked invitations', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    const state = evaluateInvitationPublicState({
      status: 'revoked',
      expires_at: future,
    })
    expect(state.valid).toBe(false)
    expect(state.reason).toBe('invalid')
  })

  it('expireOldBranchInvitations updates pending expired rows', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 3 })
    const count = await expireOldBranchInvitations()
    expect(count).toBe(3)
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("status = 'expired'"))
  })

  it('token entropy is not guessable (high uniqueness sample)', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateBranchInviteToken()))
    expect(tokens.size).toBe(50)
  })
})
