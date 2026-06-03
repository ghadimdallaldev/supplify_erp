import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()
const createPendingActivationSubscription = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockClientQuery(...args) }),
}))

vi.mock('./rbac.js', () => ({
  assignDefaultRoleForTenant: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./keycloak-admin.js', () => ({
  ensureKeycloakRealmRole: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./billing/subscription-activation.js', () => ({
  createPendingActivationSubscription: (...args) => createPendingActivationSubscription(...args),
}))

vi.mock('./tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn().mockResolvedValue(undefined),
  assignOwnerRoleForUser: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./restaurant-org.js', () => ({
  ensureRestaurantOrgSystemRoles: vi.fn().mockResolvedValue(undefined),
  assignRestaurantOrgUserRole: vi.fn().mockResolvedValue(undefined),
  invalidateRestaurantOrgPermissionCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./warehouse-helpers.js', () => ({
  createDefaultWarehouseForSupplier: vi.fn().mockResolvedValue('wh-1'),
}))

vi.mock('./supplier-org.js', () => ({
  ensureOrgSystemRoles: vi.fn().mockResolvedValue(undefined),
  assignOrgUserRole: vi.fn().mockResolvedValue(undefined),
  invalidateOrgPermissionCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./legal-acceptance.js', () => ({
  recordRegistrationLegalAcceptances: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./workspace-membership.js', () => ({
  getUserWorkspaceMembership: vi.fn().mockResolvedValue(null),
  bindUserToWorkspace: vi.fn().mockResolvedValue(undefined),
  resolveWorkspaceScope: vi.fn().mockImplementation((_type, { organizationId, tenantId }) =>
    Promise.resolve({
      workspaceType: _type,
      organizationId,
      homeTenantId: tenantId,
    })
  ),
}))

describe('register-account', () => {
  const legalAcceptance = {
    packVersion: '2026-05-28',
    acceptedDocuments: [
      'terms_and_conditions',
      'privacy_policy',
      'acceptable_use_policy',
      'data_processing_addendum',
      'cookie_policy',
      'mobile_app_terms',
      'restaurant_agreement',
    ],
    electronicSignatureAttestation: true,
  }

  const supplierLegalAcceptance = {
    ...legalAcceptance,
    acceptedDocuments: [
      'terms_and_conditions',
      'privacy_policy',
      'acceptable_use_policy',
      'data_processing_addendum',
      'cookie_policy',
      'mobile_app_terms',
      'supplier_agreement',
    ],
  }

  beforeEach(() => {
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    createPendingActivationSubscription.mockReset()
    createPendingActivationSubscription.mockResolvedValue(undefined)
  })

  describe('slugifyName', () => {
    it('slugifies business names', async () => {
      const { slugifyName } = await import('./register-account.js')
      expect(slugifyName('Golden Fork LLC!')).toBe('golden-fork-llc')
      expect(slugifyName('   ')).toBe('organization')
    })
  })

  describe('userNeedsTenantSetup', () => {
    it('returns true for PENDING role', async () => {
      const { userNeedsTenantSetup } = await import('./register-account.js')
      expect(await userNeedsTenantSetup({ role: 'PENDING', email: 'a@b.com' })).toBe(true)
    })

    it('returns false for admin', async () => {
      const { userNeedsTenantSetup } = await import('./register-account.js')
      expect(await userNeedsTenantSetup({ role: 'ADMIN', email: 'admin@b.com' })).toBe(false)
    })

    it('returns true when no tenant exists for email', async () => {
      const { userNeedsTenantSetup } = await import('./register-account.js')
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      expect(await userNeedsTenantSetup({ role: 'RESTAURANT', email: 'new@b.com' })).toBe(true)
    })
  })

  describe('completeTenantRegistration', () => {
    it('creates restaurant with pending activation subscription', async () => {
      const { completeTenantRegistration } = await import('./register-account.js')

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'PENDING' }] })
        .mockResolvedValueOnce({ rows: [] }) // existing tenant by email

      mockClientQuery.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('SELECT 1 FROM restaurant')) return { rows: [] }
        if (text.includes('INSERT INTO restaurant (name')) {
          return { rows: [{ id: 'rest-1', name: 'Test Rest', slug: 'test-rest' }] }
        }
        if (text.includes('INSERT INTO restaurant_organizations')) {
          return { rows: [{ id: 'org-1', name: 'Test Rest', slug: 'test-rest-org' }] }
        }
        return { rows: [] }
      })

      const result = await completeTenantRegistration({
        userId: 'u1',
        keycloakSub: 'kc-1',
        email: 'owner@test.com',
        accountType: 'RESTAURANT',
        businessName: 'Test Rest',
        phone: '+123',
        legalAcceptance,
      })

      expect(result.tenantType).toBe('RESTAURANT')
      expect(result.tenant.id).toBe('rest-1')
      expect(createPendingActivationSubscription).toHaveBeenCalledWith(
        expect.anything(),
        'rest-1',
        'RESTAURANT',
        'free'
      )
    })

    it('creates supplier with pending activation subscription', async () => {
      const { completeTenantRegistration } = await import('./register-account.js')

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'u2', role: 'PENDING' }] })
        .mockResolvedValueOnce({ rows: [] }) // existing tenant by email

      mockClientQuery.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('SELECT 1 FROM supplier')) return { rows: [] }
        if (text.includes('INSERT INTO supplier (name')) {
          return { rows: [{ id: 'sup-1', name: 'Test Supply', slug: 'test-supply' }] }
        }
        if (text.includes('INSERT INTO catalog')) return { rows: [] }
        if (text.includes('INSERT INTO supplier_organizations')) {
          return { rows: [{ id: 'org-s1', name: 'Test Supply', slug: 'test-supply-org' }] }
        }
        return { rows: [] }
      })

      const result = await completeTenantRegistration({
        userId: 'u2',
        keycloakSub: 'kc-2',
        email: 'owner@supplier.test',
        accountType: 'SUPPLIER',
        businessName: 'Test Supply',
        phone: '+971',
        legalAcceptance: supplierLegalAcceptance,
      })

      expect(result.tenantType).toBe('SUPPLIER')
      expect(result.tenant.id).toBe('sup-1')
      expect(createPendingActivationSubscription).toHaveBeenCalledWith(
        expect.anything(),
        'sup-1',
        'SUPPLIER',
        'free'
      )

      const { createDefaultWarehouseForSupplier } = await import('./warehouse-helpers.js')
      expect(createDefaultWarehouseForSupplier).not.toHaveBeenCalled()
    })
  })
})
