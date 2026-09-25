import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

describe('supplierFulfillmentPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not count orders that are still waiting for approval', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValue({ rows: [] })
    const { supplierFulfillmentPerformance } = await import('./reports.service.js')

    await supplierFulfillmentPerformance('supplier-1', {
      from: new Date('2026-09-01T00:00:00'),
      to: new Date('2026-09-25T23:59:59'),
    })

    expect(String(query.mock.calls[0][0])).toContain('PENDING_APPROVAL')
  })
})

describe('supplierInvoiceCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('leaves void and draft invoices out of collection totals', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValue({ rows: [] })
    const { supplierInvoiceCollection } = await import('./reports.service.js')

    await supplierInvoiceCollection('supplier-1', {
      from: new Date('2026-09-01T00:00:00'),
      to: new Date('2026-09-25T23:59:59'),
    })

    const sql = String(query.mock.calls[0][0])
    expect(sql).toContain("NOT IN ('VOID', 'DRAFT')")
    expect(sql).toContain('GROUP BY i.status, i.currency')
  })
})
