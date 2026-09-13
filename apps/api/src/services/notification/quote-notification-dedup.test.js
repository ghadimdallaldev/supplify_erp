import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const notifyTenantUsersMock = vi.fn().mockResolvedValue([])

vi.mock('../../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./in-app.js', () => ({
  notifyTenantUsers: (...args) => notifyTenantUsersMock(...args),
  sendNotification: vi.fn(),
  listTenantUserIds: vi.fn(),
}))

import { notifyQuoteResponseReceived, notifyQuoteRequestDeclined } from './templates.js'

describe('quote notification dedup keys', () => {
  beforeEach(() => {
    queryMock.mockReset()
    notifyTenantUsersMock.mockClear()
    queryMock.mockResolvedValue({ rows: [] })
  })

  it('dedupes quote_response_received by quoteRequestSupplierId so multi-supplier RFQs notify once per supplier', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Supplier A' }] })

    await notifyQuoteResponseReceived({
      restaurantId: 'rest-1',
      quoteRequestId: 'qr-1',
      quoteRequestSupplierId: 'qrs-a',
      supplierId: 'supplier-a',
    })

    expect(queryMock.mock.calls[0][1]).toEqual([
      'quote_response_received',
      'qrs-a',
      'QUOTE_REQUEST',
      '60',
      'RESTAURANT',
      'rest-1',
    ])
    expect(notifyTenantUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: 'qrs-a',
        metadata: expect.objectContaining({
          quoteRequestId: 'qr-1',
          quoteRequestSupplierId: 'qrs-a',
        }),
      })
    )
  })

  it('dedupes quote_request_declined by quoteRequestSupplierId', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Supplier B' }] })

    await notifyQuoteRequestDeclined({
      restaurantId: 'rest-1',
      quoteRequestId: 'qr-1',
      quoteRequestSupplierId: 'qrs-b',
      supplierId: 'supplier-b',
      reason: 'Out of stock',
    })

    expect(queryMock.mock.calls[0][1]).toEqual([
      'quote_request_declined',
      'qrs-b',
      'QUOTE_REQUEST',
      '60',
      'RESTAURANT',
      'rest-1',
    ])
    expect(notifyTenantUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: 'qrs-b',
      })
    )
  })
})
