import { describe, it, expect } from 'vitest'
import {
  calculateDeliveryEta,
  getDeliveryEtaConfig,
  haversineDistanceKm,
  sanitizeEtaForRestaurant,
} from './delivery-eta.service.js'

const destination = { latitude: 33.9, longitude: 35.51, label: 'Gate A' }
const tracking = {
  hasLocation: true,
  isStale: false,
  latestLocation: { latitude: 33.89, longitude: 35.5, recordedAt: '2026-06-03T10:00:00Z' },
}

describe('delivery-eta.service', () => {
  it('computes haversine distance rounded to 1 decimal', () => {
    const km = haversineDistanceKm(33.89, 35.5, 33.9, 35.51)
    expect(km).toBe(1.4)
  })

  it('computes ETA min/max with default speed and multipliers', () => {
    const eta = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      orderStatus: 'SHIPPED',
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5 },
    })
    expect(eta.etaAvailable).toBe(true)
    expect(eta.etaMinutesMin).toBe(4)
    expect(eta.etaMinutesMax).toBe(6)
    expect(eta.distanceKm).toBe(1.4)
    expect(eta.confidence).toBe('MEDIUM')
    expect(eta.calculatedAt).toBeTruthy()
  })

  it('enforces minimum 1 minute for tiny distances', () => {
    const eta = calculateDeliveryEta({
      tracking: {
        hasLocation: true,
        isStale: false,
        latestLocation: { latitude: 33.9, longitude: 35.51 },
      },
      destination,
      assignmentStatus: 'picked_up',
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5 },
    })
    expect(eta.etaMinutesMin).toBe(1)
    expect(eta.etaMinutesMax).toBeGreaterThanOrEqual(1)
  })

  it('blocks ETA when destination missing', () => {
    const eta = calculateDeliveryEta({
      tracking,
      destination: null,
      assignmentStatus: 'out_for_delivery',
    })
    expect(eta.etaAvailable).toBe(false)
    expect(eta.unavailableReason).toBe('destination_missing')
  })

  it('blocks ETA when driver location missing', () => {
    const eta = calculateDeliveryEta({
      tracking: { hasLocation: false, latestLocation: null },
      destination,
      assignmentStatus: 'out_for_delivery',
    })
    expect(eta.unavailableReason).toBe('driver_location_missing')
  })

  it('blocks ETA when assignment is assigned only', () => {
    const eta = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'assigned',
    })
    expect(eta.unavailableReason).toBe('assignment_not_active')
  })

  it('blocks ETA for terminal delivery status', () => {
    const eta = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'delivered',
    })
    expect(eta.unavailableReason).toBe('order_terminal')
  })

  it('keeps ETA available with LOW confidence when GPS is stale', () => {
    const eta = calculateDeliveryEta({
      tracking: { ...tracking, isStale: true },
      destination,
      assignmentStatus: 'out_for_delivery',
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5 },
    })
    expect(eta.etaAvailable).toBe(true)
    expect(eta.confidence).toBe('LOW')
  })

  it('reads config from env defaults', () => {
    const cfg = getDeliveryEtaConfig()
    expect(cfg.speedKmh).toBeGreaterThan(0)
    expect(cfg.minMultiplier).toBeGreaterThan(0)
    expect(cfg.maxMultiplier).toBeGreaterThanOrEqual(cfg.minMultiplier)
  })

  it('sanitizeEtaForRestaurant strips internal fields', () => {
    const sanitized = sanitizeEtaForRestaurant({
      etaAvailable: false,
      etaMinutesMin: null,
      etaMinutesMax: null,
      distanceKm: null,
      confidence: null,
      calculatedAt: null,
      unavailableReason: 'driver_location_missing',
    })
    expect(sanitized).not.toHaveProperty('unavailableReason')
    expect(sanitized).not.toHaveProperty('confidence')
    expect(sanitized.etaAvailable).toBe(false)
  })
})
