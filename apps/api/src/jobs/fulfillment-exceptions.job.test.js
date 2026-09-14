import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockCreate = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/fulfillment-exceptions.js', () => ({
  createFulfillmentException: (...args) => mockCreate(...args),
}))

describe('runFulfillmentExceptionChecks', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockCreate.mockReset()
    mockQuery.mockResolvedValue({ rows: [] })
  })

  it('counts only newly created exceptions', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'da1', order_id: 'o1', supplier_id: 's1', warehouse_id: null }],
      })
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    mockCreate.mockResolvedValueOnce({ id: 'ex1' }).mockResolvedValueOnce(null)

    const { runFulfillmentExceptionChecks } = await import('./fulfillment-exceptions.job.js')
    const result = await runFulfillmentExceptionChecks()

    expect(result.overdue).toBe(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
  it('skips creating fulfillment exceptions when supplier locks after scan', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'da-locked', order_id: 'o-locked', supplier_id: 's-locked', warehouse_id: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runFulfillmentExceptionChecks } = await import('./fulfillment-exceptions.job.js')
    const result = await runFulfillmentExceptionChecks()

    expect(result.overdue).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(String(mockQuery.mock.calls[0][0])).toContain('FROM subscription sub')
    expect(String(mockQuery.mock.calls[0][0])).toContain('sub.account_locked_at IS NULL')
  })
})
