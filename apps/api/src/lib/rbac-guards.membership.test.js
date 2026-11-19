import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('./db.js', () => ({ query: (...a) => queryMock(...a) }))
vi.mock('./workspace-membership.js', () => ({ MAIN_ADMIN_ROLE_NAME: 'Owner' }))
vi.mock('./permissions.js', () => ({
  getPermissionsForUser: vi.fn(),
  hasPermission: vi.fn(),
}))

const { assertTargetUserBelongsToTenant } = await import('./rbac-guards.js')

describe('assertTargetUserBelongsToTenant', () => {
  beforeEach(() => queryMock.mockReset())

  it('rejects a user with no role row or workspace membership in the tenant (cross-tenant enrolment)', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    await expect(
      assertTargetUserBelongsToTenant({
        targetUserId: 'victim-from-other-tenant',
        tenantId: 't1',
        tenantType: 'SUPPLIER',
      })
    ).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('accepts an existing member and scopes the lookup to the tenant', async () => {
    queryMock.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    await expect(
      assertTargetUserBelongsToTenant({
        targetUserId: 'u1',
        tenantId: 't1',
        tenantType: 'RESTAURANT',
      })
    ).resolves.toBeUndefined()
    expect(queryMock.mock.calls[0][1]).toEqual(['u1', 't1', 'RESTAURANT'])
  })
})
