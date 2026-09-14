import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/driver-fulfillment.service.js', () => ({
  getProofOfDelivery: vi.fn(),
}))

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { getProofOfDelivery } from '../services/driver-fulfillment.service.js'
import { query } from './db.js'
import {
  isPodRequiredForSupplier,
  resolveDeliveryPodFlags,
  assertPodPresentWhenRequired,
} from './pod-requirement.js'

describe('pod-requirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads pod_required from the supplier row', async () => {
    query.mockResolvedValueOnce({ rows: [{ pod_required: false }] })
    expect(await isPodRequiredForSupplier('sup-1')).toBe(false)

    query.mockResolvedValueOnce({ rows: [{ pod_required: true }] })
    expect(await isPodRequiredForSupplier('sup-1')).toBe(true)
  })

  it('resolveDeliveryPodFlags advertises podRequired when supplier policy requires it', async () => {
    query.mockResolvedValueOnce({ rows: [{ pod_required: true }] })
    getProofOfDelivery.mockResolvedValueOnce(null)
    await expect(
      resolveDeliveryPodFlags({
        supplierId: 'sup-1',
        orderId: 'order-1',
        deliveryStatus: 'delivered',
      })
    ).resolves.toEqual({ podRequired: true, hasPod: false })
  })

  it('blocks delivered when POD is required and missing', async () => {
    query.mockResolvedValueOnce({ rows: [{ pod_required: true }] })
    getProofOfDelivery.mockResolvedValueOnce(null)
    await expect(
      assertPodPresentWhenRequired({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).rejects.toThrow(/Proof of delivery is required/)
  })

  it('does not block delivered when POD is optional', async () => {
    query.mockResolvedValueOnce({ rows: [{ pod_required: false }] })
    getProofOfDelivery.mockResolvedValueOnce(null)
    await expect(
      assertPodPresentWhenRequired({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).resolves.toBeUndefined()
  })
})
