import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => query(...args),
  withTransaction: async (fn) => fn({ query: (...args) => query(...args) }),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./register-account.js', () => ({
  slugifyName: (value) => String(value || 'org'),
}))

vi.mock('./tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn(),
  assignOwnerRoleForUser: vi.fn(),
  getOwnerRoleId: vi.fn(),
  getAllPermissionsForTenantType: vi.fn(),
}))

vi.mock('./billing/subscription-activation.js', () => ({
  createOrgCoveredBranchSubscription: vi.fn(),
}))

vi.mock('./org-role-permissions.js', () => ({
  orgRolePermissionsUnchanged: vi.fn(),
  replaceOrgRolePermissions: vi.fn(),
}))

vi.mock('./role-matrix.js', () => ({
  SUPPLIER_VIEWER: [],
}))

function membershipRow() {
  return { organization_id: 'org-1', role_name: 'Org Owner' }
}

describe('userHasOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('denies Org Owner access to a supplier outside the organization', async () => {
    const { userHasOrgBranchAccess } = await import('./supplier-org.js')
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM org_user_roles our') && text.includes('supplier_organizations')) {
        return { rows: [membershipRow()] }
      }
      if (text.includes('FROM supplier WHERE id = $1 AND organization_id = $2')) {
        return { rows: [] }
      }
      if (text.includes('branch_scope')) {
        return { rows: [{ branch_scope: 'all', name: 'Org Owner' }] }
      }
      return { rows: [] }
    })

    const allowed = await userHasOrgBranchAccess('u1', 'foreign-supplier', 'org-1')
    expect(allowed).toBe(false)
  })

  it('allows Org Owner access to a supplier in the same organization', async () => {
    const { userHasOrgBranchAccess } = await import('./supplier-org.js')
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM org_user_roles our') && text.includes('supplier_organizations')) {
        return { rows: [membershipRow()] }
      }
      if (text.includes('FROM supplier WHERE id = $1 AND organization_id = $2')) {
        return { rows: [{ exists: 1 }] }
      }
      if (text.includes('branch_scope')) {
        return { rows: [{ branch_scope: 'all', name: 'Org Owner' }] }
      }
      return { rows: [] }
    })

    const allowed = await userHasOrgBranchAccess('u1', 'supplier-2', 'org-1')
    expect(allowed).toBe(true)
  })
})

describe('grantOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not insert access for a supplier outside the organization', async () => {
    const { grantOrgBranchAccess } = await import('./supplier-org.js')
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      grantOrgBranchAccess({
        userId: 'u2',
        supplierId: 'foreign-supplier',
        organizationId: 'org-1',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO org_user_branch_access'))
    ).toBe(false)
  })
})

describe('revokeOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not delete access for a supplier outside the organization', async () => {
    const { revokeOrgBranchAccess } = await import('./supplier-org.js')
    query.mockResolvedValueOnce({ rows: [] })
    await expect(revokeOrgBranchAccess('u2', 'foreign-supplier', 'org-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM org_user_branch_access'))
    ).toBe(false)
  })
})

describe('unlinkSupplierFromOrganization', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not unlink a supplier that belongs to another organization', async () => {
    const { unlinkSupplierFromOrganization } = await import('./supplier-org.js')
    query.mockResolvedValueOnce({
      rows: [{ is_main_branch: false, organization_id: 'org-other' }],
    })
    const result = await unlinkSupplierFromOrganization('foreign-supplier', {
      organizationId: 'org-1',
    })
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE supplier'))).toBe(false)
  })
})
