import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureTenantSystemRoles = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockClientQuery = vi.fn()

vi.mock('./db.js', () => ({
  query: vi.fn(),
  withTransaction: async (fn) => fn({ query: (...args) => mockClientQuery(...args) }),
}))

vi.mock('./tenant-roles.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ensureTenantSystemRoles,
  }
})

describe('assignOwnerRoleForUser', () => {
  beforeEach(() => {
    ensureTenantSystemRoles.mockClear()
    mockClientQuery.mockReset()
    mockClientQuery.mockResolvedValue({ rows: [{ id: 'owner-role-id' }] })
  })

  it('skips ensureTenantSystemRoles when rolesAlreadyEnsured is true', async () => {
    const { assignOwnerRoleForUser } = await import('./tenant-roles.js')
    const client = { query: mockClientQuery }

    const ok = await assignOwnerRoleForUser('user-1', 'tenant-1', 'RESTAURANT', null, client, {
      rolesAlreadyEnsured: true,
    })

    expect(ok).toBe(true)
    expect(ensureTenantSystemRoles).not.toHaveBeenCalled()
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_user_roles'),
      expect.arrayContaining(['user-1', 'owner-role-id', 'RESTAURANT', 'tenant-1'])
    )
  })
})
