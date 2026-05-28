import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveOrgBillingTenantId } from './org-billing-tenant.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'

describe('resolveOrgBillingTenantId', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns same id when tenant has no organization', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ organization_id: null }] })
    const id = await resolveOrgBillingTenantId('branch-a', 'RESTAURANT')
    expect(id).toBe('branch-a')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('returns main branch id for org member', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'main-rest' }] })

    const id = await resolveOrgBillingTenantId('branch-b', 'RESTAURANT')
    expect(id).toBe('main-rest')
  })

  it('falls back to earliest org tenant when main flag missing', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'first-rest' }] })

    const id = await resolveOrgBillingTenantId('branch-b', 'SUPPLIER')
    expect(id).toBe('first-rest')
  })
})
