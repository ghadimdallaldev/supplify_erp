import { describe, it, expect } from 'vitest'
import { fitViewToPoints, isValidCoord, toMapPoint } from './deliveryMapUtils'

describe('deliveryMapUtils', () => {
  it('validates coordinates', () => {
    expect(isValidCoord(33.89, 35.5)).toBe(true)
    expect(isValidCoord(null, 35.5)).toBe(false)
    expect(isValidCoord(0, 0)).toBe(false)
  })

  it('fits single point with reasonable zoom', () => {
    const view = fitViewToPoints([{ lat: 33.89, lng: 35.5 }])
    expect(view.center).toEqual({ lat: 33.89, lng: 35.5 })
    expect(view.zoom).toBeGreaterThanOrEqual(13)
  })

  it('fits two markers', () => {
    const view = fitViewToPoints([
      { lat: 33.89, lng: 35.5 },
      { lat: 33.91, lng: 35.52 },
    ])
    expect(view.center.lat).toBeCloseTo(33.9, 1)
    expect(view.zoom).toBeLessThanOrEqual(16)
  })

  it('toMapPoint returns null for invalid', () => {
    expect(toMapPoint(undefined, undefined)).toBeNull()
    expect(toMapPoint(33.89, 35.5)).toEqual({ lat: 33.89, lng: 35.5 })
  })
})
