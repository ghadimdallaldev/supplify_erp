import { describe, expect, it } from 'vitest'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  normalizeInviteType,
} from './invitationTokens.js'

describe('invitationTokens', () => {
  it('generateInviteToken returns 96-char hex', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[a-f0-9]{96}$/)
  })

  it('normalizeInviteType accepts aliases', () => {
    expect(normalizeInviteType('rb')).toBe('restaurant_branch')
    expect(normalizeInviteType('rm')).toBe('restaurant_member')
    expect(normalizeInviteType('sb')).toBe('supplier_branch')
  })

  it('buildInviteUrl includes token and short type', () => {
    const url = buildInviteUrl('abc123', 'restaurant_member')
    expect(url).toContain('token=abc123')
    expect(url).toContain('type=rm')
  })

  it('evaluateInvitationState marks expired invitations', () => {
    const state = evaluateInvitationState({
      status: 'pending',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    expect(state.valid).toBe(false)
    expect(state.reason).toBe('expired')
  })
})
