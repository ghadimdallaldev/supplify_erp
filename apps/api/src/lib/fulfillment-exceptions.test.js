import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'
import { createFulfillmentException } from './fulfillment-exceptions.js'

describe('createFulfillmentException', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens a second exception when another driver leg has the same problem', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'ex-2' }] })

    const created = await createFulfillmentException(null, {
      supplierId: 'sup-1',
      orderId: 'order-1',
      driverAssignmentId: 'da-2',
      warehouseId: 'wh-2',
      type: 'failed_delivery',
      description: 'Second leg failed',
    })

    expect(created).toEqual({ id: 'ex-2' })
    expect(query.mock.calls[0][0]).toMatch(/driver_assignment_id IS NOT DISTINCT FROM/)
    expect(query.mock.calls[0][1]).toEqual(['order-1', 'failed_delivery', 'da-2', 'wh-2'])
  })

  it('does not open a duplicate for the same driver leg', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'ex-1' }] })

    const created = await createFulfillmentException(null, {
      supplierId: 'sup-1',
      orderId: 'order-1',
      driverAssignmentId: 'da-1',
      warehouseId: 'wh-1',
      type: 'no_pod',
      description: 'Missing proof',
    })

    expect(created).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
