import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCK_REASON_PENDING_ACTIVATION } from './constants.js'

const mockQuery = vi.fn()

vi.mock('../db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

describe('createPendingActivationSubscription', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })
  })

  it('inserts locked subscription with pending_activation reason', async () => {
    const { createPendingActivationSubscription } = await import('./subscription-activation.js')
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    await createPendingActivationSubscription(client, 'tenant-1', 'RESTAURANT', 'free')

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('account_locked_at'), [
      'tenant-1',
      'RESTAURANT',
      LOCK_REASON_PENDING_ACTIVATION,
      'free',
    ])
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('lock_reason'),
      expect.any(Array)
    )
  })

  it('uses default query when no client executor is passed', async () => {
    const { createPendingActivationSubscription } = await import('./subscription-activation.js')

    await createPendingActivationSubscription(undefined, 'tenant-2', 'SUPPLIER', 'free')

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO subscription'), [
      'tenant-2',
      'SUPPLIER',
      LOCK_REASON_PENDING_ACTIVATION,
      'free',
    ])
  })
})
