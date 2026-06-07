import { describe, it, expect } from 'vitest'
import {
  calculateDeliveryEta,
  getDeliveryEtaConfig,
  haversineDistanceKm,
  sanitizeEtaForRestaurant,
  buildRouteEtaContext,
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

  it('sanitizeEtaForRestaurant strips internal fields but keeps route hints', () => {
    const sanitized = sanitizeEtaForRestaurant({
      etaAvailable: true,
      etaMinutesMin: 12,
      etaMinutesMax: 18,
      distanceKm: 4.2,
      confidence: 'MEDIUM',
      calculatedAt: '2026-06-07T12:00:00.000Z',
      unavailableReason: null,
      stopsBefore: 2,
      nextStop: false,
      routePosition: 3,
      routePositionTotal: 10,
    })
    expect(sanitized).not.toHaveProperty('unavailableReason')
    expect(sanitized).not.toHaveProperty('confidence')
    expect(sanitized).not.toHaveProperty('routePosition')
    expect(sanitized.stopsBefore).toBe(2)
    expect(sanitized.nextStop).toBe(false)
  })

  it('buildRouteEtaContext identifies next stop and prior legs', () => {
    const ctx = buildRouteEtaContext(
      [
        { order_id: 'o1', sequence_number: 1, status: 'PLANNED', latitude: 33.89, longitude: 35.5 },
        {
          order_id: 'o2',
          sequence_number: 2,
          status: 'PLANNED',
          latitude: 33.91,
          longitude: 35.52,
        },
        {
          order_id: 'o3',
          sequence_number: 3,
          status: 'COMPLETED',
          latitude: 33.88,
          longitude: 35.49,
        },
      ],
      'o2'
    )
    expect(ctx?.nextStop).toBe(false)
    expect(ctx?.stopsBefore).toBe(1)
    expect(ctx?.priorStops).toHaveLength(1)
    expect(ctx?.routePosition).toBe(2)
  })

  it('ETA for next stop uses direct driver to destination', () => {
    const direct = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5, serviceTimeMinutes: 5 },
    })
    const nextOnRoute = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      routeContext: buildRouteEtaContext(
        [
          {
            order_id: 'target',
            sequence_number: 1,
            status: 'IN_TRANSIT',
            latitude: 33.9,
            longitude: 35.51,
          },
        ],
        'target'
      ),
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5, serviceTimeMinutes: 5 },
    })
    expect(nextOnRoute.nextStop).toBe(true)
    expect(nextOnRoute.stopsBefore).toBe(0)
    expect(nextOnRoute.etaMinutesMin).toBe(direct.etaMinutesMin)
  })

  it('ETA for later stop includes prior stops and service time', () => {
    const direct = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5, serviceTimeMinutes: 5 },
    })
    const later = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      routeContext: buildRouteEtaContext(
        [
          {
            order_id: 'o1',
            sequence_number: 1,
            status: 'IN_TRANSIT',
            latitude: 33.895,
            longitude: 35.505,
          },
          {
            order_id: 'o2',
            sequence_number: 2,
            status: 'PLANNED',
            latitude: 33.9,
            longitude: 35.51,
          },
        ],
        'o2'
      ),
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5, serviceTimeMinutes: 5 },
    })
    expect(later.stopsBefore).toBe(1)
    expect(later.nextStop).toBe(false)
    expect(later.etaMinutesMin).toBeGreaterThan(direct.etaMinutesMin)
  })

  it('falls back to direct ETA when route context is null', () => {
    const eta = calculateDeliveryEta({
      tracking,
      destination,
      assignmentStatus: 'out_for_delivery',
      routeContext: null,
      etaConfig: { speedKmh: 20, minMultiplier: 1.0, maxMultiplier: 1.5, serviceTimeMinutes: 5 },
    })
    expect(eta.nextStop).toBe(true)
    expect(eta.stopsBefore).toBe(0)
  })
})
