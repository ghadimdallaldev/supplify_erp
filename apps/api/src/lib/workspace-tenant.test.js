import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}))

import { getTenantAssignmentForUser, isPrimaryTenantContact } from './workspace-tenant.js'

describe('workspace-tenant', () => {
  beforeEach(() => queryMock.mockReset())

  it('resolves tenant from tenant_user_roles first', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          tenant_id: 'rest-1',
          tenant_type: 'RESTAURANT',
          tenant_name: 'Cafe One',
          role_name: 'Viewer',
        },
      ],
    })
    const result = await getTenantAssignmentForUser('user-1', 'RESTAURANT')
    expect(result).toEqual({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Cafe One',
      roleName: 'Viewer',
    })
  })

  it('isPrimaryTenantContact matches contact_email on tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    const ok = await isPrimaryTenantContact('u1', 'owner@test.com', 'rest-1', 'RESTAURANT')
    expect(ok).toBe(true)
  })
})
