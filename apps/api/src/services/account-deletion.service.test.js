import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const withTransaction = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => query(...args),
  withTransaction: (...args) => withTransaction(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/keycloak-admin.js', () => ({
  getKeycloakAdminToken: vi.fn().mockResolvedValue('token'),
  setKeycloakUserEnabled: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/tenant-roles.js', () => ({
  assignOwnerRoleForUser: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/workspace-membership.js', () => ({
  MAIN_ADMIN_ROLE_NAME: 'Owner',
}))

vi.mock('../lib/supplier-org.js', () => ({
  assignOrgUserRole: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/restaurant-org.js', () => ({
  assignRestaurantOrgUserRole: vi.fn().mockResolvedValue(undefined),
}))

describe('account-deletion.service', () => {
  beforeEach(() => {
    query.mockReset()
    withTransaction.mockReset()
    withTransaction.mockImplementation(async (fn) => fn({ query: query }))
  })

  it('blocks deletion when user is Org Owner of open supplier org', async () => {
    const { getDeletionStatus, deletePersonalAccount, OWNER_BLOCKER_CODE } = await import(
      './account-deletion.service.js'
    )

    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'o@x.com',
            display_name: 'Owner',
            role: 'SUPPLIER',
            is_active: true,
            deleted_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'org-1', name: 'Acme', workspace_type: 'SUPPLIER' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const status = await getDeletionStatus('user-1')
    expect(status.canDelete).toBe(false)
    expect(status.blockers[0].code).toBe(OWNER_BLOCKER_CODE)

    query.mockReset()
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'o@x.com',
            display_name: 'Owner',
            role: 'SUPPLIER',
            is_active: true,
            deleted_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'org-1', name: 'Acme', workspace_type: 'SUPPLIER' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(deletePersonalAccount('user-1')).rejects.toMatchObject({
      code: OWNER_BLOCKER_CODE,
    })
  })

  it('deletes consumer account when no ownership blockers', async () => {
    const { deletePersonalAccount } = await import('./account-deletion.service.js')
    const { setKeycloakUserEnabled } = await import('../lib/keycloak-admin.js')

    query
      // getDeletionStatus user
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'c@x.com',
            display_name: 'Consumer',
            role: 'CONSUMER',
            is_active: true,
            deleted_at: null,
          },
        ],
      })
      // supplier org owners
      .mockResolvedValueOnce({ rows: [] })
      // restaurant org owners
      .mockResolvedValueOnce({ rows: [] })
      // tenant owners
      .mockResolvedValueOnce({ rows: [] })
      // user for delete
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', keycloak_sub: 'kc-1', email: 'c@x.com' }],
      })

    // anonymize queries inside transaction
    query.mockResolvedValue({ rows: [], rowCount: 0 })

    const result = await deletePersonalAccount('user-1')
    expect(result.deleted).toBe(true)
    expect(setKeycloakUserEnabled).toHaveBeenCalledWith('token', 'kc-1', false)
  })

  it('closeOrganization never implies personal account deletion', async () => {
    const { closeOrganization } = await import('./account-deletion.service.js')

    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // assert org owner
      .mockResolvedValueOnce({
        rows: [{ id: 'org-1', name: 'Acme Foods', closed_at: null }],
      })

    withTransaction.mockImplementation(async (fn) => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      }
      await fn(client)
      // personal account update must not be called
      expect(client.query.mock.calls.some((c) => String(c[0]).includes('deleted_at'))).toBe(false)
      expect(client.query.mock.calls.some((c) => String(c[0]).includes('closed_at'))).toBe(true)
    })

    const result = await closeOrganization({
      requesterId: 'user-1',
      organizationId: '11111111-1111-1111-1111-111111111111',
      workspaceType: 'SUPPLIER',
      confirmationName: 'Acme Foods',
    })
    expect(result.closed).toBe(true)
  })
})
