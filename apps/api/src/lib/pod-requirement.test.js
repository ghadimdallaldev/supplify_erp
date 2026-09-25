import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'
import {
  isPodRequiredForSupplier,
  orderHasProofOfDeliveryRecord,
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

  it('orderHasProofOfDeliveryRecord checks proof_of_delivery via dbQuery', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    expect(await orderHasProofOfDeliveryRecord('order-1')).toBe(true)
    expect(query.mock.calls[0][0]).toMatch(/proof_of_delivery/)
  })

  it('resolveDeliveryPodFlags advertises podRequired when supplier policy requires it', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // hasPod
      .mockResolvedValueOnce({ rows: [{ pod_required: true }] })
    await expect(
      resolveDeliveryPodFlags({
        supplierId: 'sup-1',
        orderId: 'order-1',
        deliveryStatus: 'delivered',
      })
    ).resolves.toEqual({ podRequired: true, hasPod: false })
  })

  it('resolveDeliveryPodFlags checks the driver leg when one is given', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ pod_required: true }] })
    await resolveDeliveryPodFlags({
      supplierId: 'sup-1',
      orderId: 'order-1',
      deliveryStatus: 'delivered',
      driverAssignmentId: 'da-leg-b',
    })
    expect(query.mock.calls[0][0]).toMatch(/driver_assignment_id/)
    expect(query.mock.calls[0][1]).toEqual(['order-1', 'da-leg-b'])
  })

  it('blocks delivered when POD is required and missing', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ pod_required: true }] })
      .mockResolvedValueOnce({ rows: [] })
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
    await expect(
      assertPodPresentWhenRequired({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).resolves.toBeUndefined()
  })

  it('uses the provided dbQuery inside a transaction snapshot', async () => {
    const dbQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ pod_required: true }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    await expect(
      assertPodPresentWhenRequired({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
        dbQuery,
      })
    ).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
    expect(dbQuery).toHaveBeenCalledTimes(2)
  })

  it('requires proof for the specific driver leg', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ pod_required: true }] })
      .mockResolvedValueOnce({ rows: [] })
    await expect(
      assertPodPresentWhenRequired({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
        driverAssignmentId: 'da-leg-b',
      })
    ).rejects.toThrow(/Proof of delivery is required/)
    expect(query.mock.calls[1][0]).toMatch(/driver_assignment_id/)
    expect(query.mock.calls[1][1]).toEqual(['order-1', 'da-leg-b'])
  })
})
