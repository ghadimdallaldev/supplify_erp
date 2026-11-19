import { describe, expect, it } from 'vitest'
import { isDriverLocationPing } from './driver-location-path.js'

const id = '0b6f9f0e-1a2b-4c3d-8e4f-5a6b7c8d9e0f'

describe('isDriverLocationPing', () => {
  it('matches only POST /api/orders/:id/location', () => {
    expect(
      isDriverLocationPing({ method: 'POST', originalUrl: `/api/orders/${id}/location` })
    ).toBe(true)
    expect(
      isDriverLocationPing({ method: 'POST', originalUrl: `/api/orders/${id}/location?x=1` })
    ).toBe(true)
  })

  it('does not exempt other order writes from the limiter', () => {
    for (const url of [
      `/api/orders/${id}/complete-delivery`,
      `/api/orders/${id}/delivery-status`,
      `/api/orders/${id}/location/extra`,
      `/api/orders`,
    ]) {
      expect(isDriverLocationPing({ method: 'POST', originalUrl: url })).toBe(false)
    }
    expect(isDriverLocationPing({ method: 'GET', originalUrl: `/api/orders/${id}/location` })).toBe(
      false
    )
  })
})
