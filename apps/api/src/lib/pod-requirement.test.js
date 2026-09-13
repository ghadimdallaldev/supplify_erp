import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/driver-fulfillment.service.js', () => ({
  getProofOfDelivery: vi.fn(),
}))

import { getProofOfDelivery } from '../services/driver-fulfillment.service.js'
import {
  isPodRequiredForSupplier,
  resolveDeliveryPodFlags,
  assertPodPresentWhenRequired,
} from './pod-requirement.js'

describe('pod-requirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats POD as optional for all suppliers today', async () => {
    expect(await isPodRequiredForSupplier('sup-1')).toBe(false)
  })

  it('resolveDeliveryPodFlags never advertises podRequired when policy is optional', async () => {
    getProofOfDelivery.mockResolvedValueOnce(null)
    await expect(
      resolveDeliveryPodFlags({
        supplierId: 'sup-1',
        orderId: 'order-1',
        deliveryStatus: 'delivered',
      })
    ).resolves.toEqual({ podRequired: false, hasPod: false })

    getProofOfDelivery.mockResolvedValueOnce({ id: 'pod-1' })
    await expect(
      resolveDeliveryPodFlags({
        supplierId: 'sup-1',
        orderId: 'order-1',
        deliveryStatus: 'delivered',
      })
    ).resolves.toEqual({ podRequired: false, hasPod: true })
  })

  it('does not block delivered when POD is optional', async () => {
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
