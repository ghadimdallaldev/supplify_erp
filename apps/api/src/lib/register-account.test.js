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

describe('register-account', () => {
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
        .mockResolvedValueOnce({ rows: [] })

      mockClientQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [{ id: 'rest-1', name: 'Test Rest', slug: 'test-rest' }],
      })

      const result = await completeTenantRegistration({
        userId: 'u1',
        keycloakSub: 'kc-1',
        email: 'owner@test.com',
        accountType: 'RESTAURANT',
        businessName: 'Test Rest',
        phone: '+123',
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
  })
})
