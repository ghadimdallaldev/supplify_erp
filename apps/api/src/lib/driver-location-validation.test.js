import { describe, expect, it } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  distanceMeters,
  validateMovement,
  validateTrackingPoint,
} from './driver-location-validation.js'

describe('driver-location-validation', () => {
  it('rejects invalid coordinates and future timestamps', () => {
    expect(() => validateTrackingPoint({ latitude: 0, longitude: 0 })).toThrow(ValidationError)
    expect(() =>
      validateTrackingPoint({ latitude: 33, longitude: 35, recordedAt: '2099-01-01T00:00:00.000Z' })
    ).toThrow(ValidationError)
  })

  it('flags low accuracy without discarding the point', () => {
    const point = validateTrackingPoint({ latitude: 33.89, longitude: 35.5, accuracyMeters: 180 })
    expect(point.lowAccuracy).toBe(true)
  })

  it('rejects impossible movement speeds', () => {
    const now = Date.now()
    const point = validateTrackingPoint({
      latitude: 33.9,
      longitude: 35.5,
      recordedAt: new Date(now - 10_000).toISOString(),
    })
    const previous = {
      latitude: 33.89,
      longitude: 35.5,
      recorded_at: new Date(now - 20_000).toISOString(),
    }
    expect(distanceMeters(point, previous)).toBeGreaterThan(500)
    expect(validateMovement(point, previous, { maxSpeedKph: 100 }).accepted).toBe(false)
  })
})
