/**
 * contact_email is editable tenant data and must never act as an ownership credential.
 * Covers userIsVerifiedTenantOwner, linked-account access, primary tenant resolution and
 * branch-account-link invitation acceptance against a small in-memory fake of the SQL used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  tenants: {},
  links: [],
  roles: [],
  legacyRoles: [],
}

function oneRow(hit) {
  return { rows: hit ? [{ '?column?': 1 }] : [] }
}

function fakeQuery(sql, params = []) {
  const text = String(sql).replace(/\s+/g, ' ')
  if (text.includes('SELECT is_branch_active')) {
    return { rows: [{ is_branch_active: true }] }
  }
  if (text.includes('FROM user_role WHERE user_id')) {
    const [userId, tenantId] = params
    return oneRow(state.legacyRoles.some((r) => r.userId === userId && r.tenantId === tenantId))
  }
  if (text.includes('FROM tenant_user_roles tur JOIN tenant_roles tr')) {
    const [userId, tenantId] = params
    return oneRow(
      state.roles.some(
        (r) => r.userId === userId && r.tenantId === tenantId && r.name === 'Owner' && r.isSystem
      )
    )
  }
  if (text.includes('FROM tenant_user_roles WHERE user_id')) {
    const [userId, tenantId] = params
    return oneRow(state.roles.some((r) => r.userId === userId && r.tenantId === tenantId))
  }
  if (text.includes('FROM user_workspace_membership')) return { rows: [] }
  if (text.includes('AS email_match')) {
    const [tenantId, , email] = params
    const tenant = state.tenants[tenantId]
    if (!tenant) return { rows: [] }
    const noMembers =
      !state.roles.some((r) => r.tenantId === tenantId) &&
      !state.legacyRoles.some((r) => r.tenantId === tenantId)
    return {
      rows: [
        {
          email_match: (tenant.contactEmail || '').trim().toLowerCase() === email,
          has_no_members: noMembers,
        },
      ],
    }
  }
  if (text.includes('FROM tenant_account_link l JOIN')) {
    const [childId] = params
    return {
      rows: state.links.filter((l) => l.childId === childId).map((l) => ({ id: l.parentId })),
    }
  }
  if (text.includes('SELECT t.id, t.name FROM')) {
    const [email] = params
    return {
      rows: Object.entries(state.tenants)
        .filter(([, t]) => (t.contactEmail || '').trim().toLowerCase() === email)
        .map(([id, t]) => ({ id, name: t.name })),
    }
  }
  if (text.includes('organization_id FROM')) {
    return { rows: [] }
  }
  throw new Error(`Unexpected query: ${text.slice(0, 120)}`)
}

vi.mock('./db.js', () => ({
  query: (...args) => fakeQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => fakeQuery(...args) }),
}))

vi.mock('../config/env.js', () => ({
  config: {
    IMPERSONATION_SECRET: 'test-secret-key-at-least-32-chars!!',
    ACTIVE_TENANT_SECRET: 'active-tenant-secret-key-at-least-32',
    COOKIE_SAME_SITE: 'lax',
    NODE_ENV: 'test',
  },
}))

vi.mock('./logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn(() => null),
  impersonationCanAccessBranch: vi.fn(),
}))

import { userIsVerifiedTenantOwner } from './tenant-roles.js'
import { userCanAccessTenant, getPrimaryTenantForUser } from './tenant-switch.js'

const OWNER = { id: 'u-owner', email: 'owner@x.com' }
const STAFF = { id: 'u-staff', email: 'staff@x.com' }

function resetState() {
  state.tenants = {}
  state.links = []
  state.roles = []
  state.legacyRoles = []
}

function seedLinkedAccount({ contactEmail }) {
  state.tenants = {
    parent: { name: 'Main', contactEmail },
    child: { name: 'Branch', contactEmail: 'branch@x.com' },
  }
  state.links = [{ parentId: 'parent', childId: 'child' }]
  state.roles = [
    { userId: OWNER.id, tenantId: 'parent', name: 'Owner', isSystem: true },
    { userId: STAFF.id, tenantId: 'parent', name: 'Restaurant Manager', isSystem: true },
  ]
  state.legacyRoles = []
}

describe('contact_email is not an ownership credential', () => {
  beforeEach(resetState)

  describe('userIsVerifiedTenantOwner', () => {
    it('accepts the system Owner role regardless of contact_email', async () => {
      seedLinkedAccount({ contactEmail: 'someone-else@x.com' })
      expect(await userIsVerifiedTenantOwner(OWNER.id, OWNER.email, 'parent', 'RESTAURANT')).toBe(
        true
      )
    })

    it('rejects a non-owner who set contact_email to their own address', async () => {
      seedLinkedAccount({ contactEmail: STAFF.email })
      expect(await userIsVerifiedTenantOwner(STAFF.id, STAFF.email, 'parent', 'RESTAURANT')).toBe(
        false
      )
    })

    it('rejects a custom role named Owner (is_system required)', async () => {
      seedLinkedAccount({ contactEmail: 'x@x.com' })
      state.roles.push({ userId: 'u-fake', tenantId: 'parent', name: 'Owner', isSystem: false })
      expect(await userIsVerifiedTenantOwner('u-fake', 'fake@x.com', 'parent', 'RESTAURANT')).toBe(
        false
      )
    })

    it('bootstrap: contact_email owner of a legacy tenant with zero members still qualifies', async () => {
      state.tenants = { legacy: { name: 'Legacy', contactEmail: 'Legacy@x.com' } }
      expect(
        await userIsVerifiedTenantOwner('u-legacy', 'legacy@x.com', 'legacy', 'RESTAURANT')
      ).toBe(true)
    })

    it('bootstrap does not apply once the tenant has any role member', async () => {
      state.tenants = { legacy: { name: 'Legacy', contactEmail: 'hijacker@x.com' } }
      state.roles = [{ userId: 'u-real', tenantId: 'legacy', name: 'Owner', isSystem: true }]
      expect(
        await userIsVerifiedTenantOwner('u-hijack', 'hijacker@x.com', 'legacy', 'RESTAURANT')
      ).toBe(false)
    })

    it('bootstrap does not apply when the tenant only has legacy user_role members', async () => {
      state.tenants = { legacy: { name: 'Legacy', contactEmail: 'hijacker@x.com' } }
      state.legacyRoles = [{ userId: 'u-real', tenantId: 'legacy' }]
      expect(
        await userIsVerifiedTenantOwner('u-hijack', 'hijacker@x.com', 'legacy', 'RESTAURANT')
      ).toBe(false)
    })
  })

  describe('userCanAccessTenant linked children', () => {
    it('denies a non-owner who edited the parent contact_email to their own address', async () => {
      seedLinkedAccount({ contactEmail: STAFF.email })
      expect(await userCanAccessTenant(STAFF.id, STAFF.email, 'child', 'RESTAURANT')).toBe(false)
    })

    it('still lets the real owner of the parent reach the linked child', async () => {
      seedLinkedAccount({ contactEmail: OWNER.email })
      expect(await userCanAccessTenant(OWNER.id, OWNER.email, 'child', 'RESTAURANT')).toBe(true)
    })

    it('keeps bootstrap access for a memberless legacy parent contact', async () => {
      seedLinkedAccount({ contactEmail: OWNER.email })
      state.roles = []
      expect(await userCanAccessTenant(OWNER.id, OWNER.email, 'child', 'RESTAURANT')).toBe(true)
    })
  })

  describe('getPrimaryTenantForUser', () => {
    it('does not return a tenant for a non-owner whose email matches contact_email', async () => {
      seedLinkedAccount({ contactEmail: STAFF.email })
      expect(await getPrimaryTenantForUser(STAFF.email, 'RESTAURANT', STAFF.id)).toBeNull()
    })

    it('fails closed when no userId is supplied', async () => {
      seedLinkedAccount({ contactEmail: OWNER.email })
      expect(await getPrimaryTenantForUser(OWNER.email, 'RESTAURANT')).toBeNull()
    })

    it('returns the verified owner primary tenant', async () => {
      seedLinkedAccount({ contactEmail: OWNER.email })
      const primary = await getPrimaryTenantForUser(OWNER.email, 'RESTAURANT', OWNER.id)
      expect(primary?.id).toBe('parent')
    })
  })
})

describe('acceptBranchAccountLinkInvitation owner authority', () => {
  beforeEach(resetState)

  async function loadWithInvitation() {
    vi.resetModules()
    const invitation = {
      id: 'inv-1',
      org_type: 'RESTAURANT',
      organization_id: 'org-1',
      target_tenant_id: 'target',
      target_owner_email: null,
      status: 'pending',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }
    const route = (sql, params) => {
      const text = String(sql).replace(/\s+/g, ' ')
      if (text.startsWith('UPDATE branch_account_link_invitations')) {
        return { rows: [], rowCount: 0 }
      }
      if (text.includes('FROM branch_account_link_invitations i')) {
        return { rows: [invitation] }
      }
      if (text.includes('FROM restaurant WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'target',
              name: 'Target',
              contact_email: state.tenants.target.contactEmail,
              organization_id: null,
              is_branch_active: true,
            },
          ],
        }
      }
      if (text.includes('FOR UPDATE')) return { rows: [] }
      return fakeQuery(sql, params)
    }
    vi.doMock('./db.js', () => ({
      query: route,
      withTransaction: async (fn) => fn({ query: route }),
    }))
    vi.doMock('./plan-enforcement.js', () => ({
      checkLinkedAccountLimit: vi.fn().mockResolvedValue({ allowed: true }),
      createAuditLog: vi.fn(),
    }))
    vi.doMock('./restaurant-org.js', () => ({
      linkRestaurantToOrganization: vi.fn().mockResolvedValue({ ok: true }),
    }))
    vi.doMock('./supplier-org.js', () => ({ linkSupplierToOrganization: vi.fn() }))
    vi.doMock('./branch-account-billing.js', () => ({
      applyOrgBillingOnLink: vi
        .fn()
        .mockResolvedValue({ snapshot: {}, billingReviewRequired: false }),
      recordBranchAccountLinkHistory: vi.fn(),
    }))
    return import('./branch-account-link-invitations.js')
  }

  it('rejects a non-owner who set the target contact_email to their own address', async () => {
    state.tenants = { target: { name: 'Target', contactEmail: STAFF.email } }
    state.roles = [{ userId: OWNER.id, tenantId: 'target', name: 'Owner', isSystem: true }]
    const { acceptBranchAccountLinkInvitation } = await loadWithInvitation()

    const result = await acceptBranchAccountLinkInvitation({
      token: 't',
      acceptingUserId: STAFF.id,
      acceptingUserEmail: STAFF.email,
    })

    expect(result).toEqual({ ok: false, reason: 'NOT_OWNER' })
  })

  it('lets the real owner accept', async () => {
    state.tenants = { target: { name: 'Target', contactEmail: STAFF.email } }
    state.roles = [{ userId: OWNER.id, tenantId: 'target', name: 'Owner', isSystem: true }]
    const { acceptBranchAccountLinkInvitation } = await loadWithInvitation()

    const result = await acceptBranchAccountLinkInvitation({
      token: 't',
      acceptingUserId: OWNER.id,
      acceptingUserEmail: OWNER.email,
      primaryBillingTenantId: 'main',
    })

    expect(result.reason).not.toBe('NOT_OWNER')
  })
})
