import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  assertAcceptingEmailMatchesInvitation,
  assertInvitationRoleForTenant,
  keycloakRealmRoleForWorkspace,
  normalizeInvitationEmail,
  resolveInvitationAcceptIdentity,
} from './invitation-accept.js'

describe('invitation-accept helpers', () => {
  it('normalizeInvitationEmail lowercases and trims', () => {
    expect(normalizeInvitationEmail('  Alex@Example.COM ')).toBe('alex@example.com')
  })

  it('requires email match when invitation has invited_email', () => {
    expect(() =>
      assertAcceptingEmailMatchesInvitation(
        { invited_email: 'viewer@test.com' },
        { email: 'other@test.com' }
      )
    ).toThrow(ValidationError)
  })

  it('allows match when emails align', () => {
    expect(() =>
      assertAcceptingEmailMatchesInvitation(
        { invited_email: 'viewer@test.com' },
        { email: 'viewer@test.com' }
      )
    ).not.toThrow()
  })

  it('rejects logged-in user with wrong session email', () => {
    expect(() =>
      assertAcceptingEmailMatchesInvitation(
        { invited_email: 'viewer@test.com' },
        { email: 'viewer@test.com', existingUserEmail: 'owner@test.com' }
      )
    ).toThrow(ValidationError)
  })

  it('skips email check when invitation has no invited_email', () => {
    expect(() => assertAcceptingEmailMatchesInvitation({}, { email: 'any@test.com' })).not.toThrow()
  })

  it('resolveInvitationAcceptIdentity drops session when signup email differs', () => {
    const resolved = resolveInvitationAcceptIdentity(
      { id: 'user-1', email: 'owner@test.com' },
      { email: 'invitee@test.com', password: 'password123' }
    )
    expect(resolved).toEqual({ existingUserId: null, existingUserEmail: null })
  })

  it('resolveInvitationAcceptIdentity keeps session when signup email matches', () => {
    const resolved = resolveInvitationAcceptIdentity(
      { id: 'user-1', email: 'Invitee@Test.com' },
      { email: 'invitee@test.com', password: 'password123' }
    )
    expect(resolved).toEqual({
      existingUserId: 'user-1',
      existingUserEmail: 'Invitee@Test.com',
    })
  })

  it('keycloakRealmRoleForWorkspace uses lowercase realm roles', () => {
    expect(keycloakRealmRoleForWorkspace('RESTAURANT')).toBe('restaurant')
    expect(keycloakRealmRoleForWorkspace('SUPPLIER')).toBe('supplier')
  })
})

describe('assertInvitationRoleForTenant', () => {
  const client = { query: vi.fn() }

  beforeEach(() => {
    client.query.mockReset()
  })

  it('rejects role from another tenant', async () => {
    client.query.mockResolvedValueOnce({ rows: [] })
    await expect(
      assertInvitationRoleForTenant(client, {
        roleId: 'role-1',
        tenantId: 'tenant-1',
        tenantType: 'RESTAURANT',
      })
    ).rejects.toMatchObject({ code: 'invalid_role' })
  })

  it('returns role row when valid', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: 'role-1', name: 'Viewer' }] })
    const role = await assertInvitationRoleForTenant(client, {
      roleId: 'role-1',
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
    })
    expect(role.name).toBe('Viewer')
  })
})
