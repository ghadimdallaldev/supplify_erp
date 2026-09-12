import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  resolveActiveBillingSubscription,
  resolveOrgBillingTenantId,
} from './org-billing-tenant.js'

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

describe('resolveActiveBillingSubscription', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns active subscription for billing tenant', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub-1', tenant_id: 't1', tenant_type: 'RESTAURANT', status: 'ACTIVE' }],
      })

    const result = await resolveActiveBillingSubscription('t1', 'RESTAURANT')
    expect(result.subscription?.id).toBe('sub-1')
    expect(result.usesOrgBilling).toBe(false)
  })
})
