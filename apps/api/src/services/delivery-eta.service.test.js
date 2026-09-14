import { describe, it, expect } from 'vitest'
import {
  calculateDeliveryEta,
  getDeliveryEtaConfig,
  haversineDistanceKm,
  sanitizeEtaForRestaurant,
  buildRouteEtaContext,
  isEtaEligibleAssignmentStatus,
} from './delivery-eta.service.js'

const destination = { latitude: 33.9, longitude: 35.51, label: 'Gate A' }
// Fixture must stay recent: a fix older than the staleness cutoff withholds the ETA
// by design, and these cases exercise the ETA arithmetic rather than staleness.
const tracking = {
  hasLocation: true,
  isStale: false,
  latestLocation: {
    latitude: 33.89,
    longitude: 35.5,
    recordedAt: new Date().toISOString(),
  },
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
    // Minutes come from the true 1.4453km, not the 1.4km display rounding, so the
    // upper bound is round(4.336 * 1.5) = 7. The previous expectation of 6 was
    // produced by rounding the distance before computing time.
    expect(eta.etaMinutesMax).toBe(7)
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

  it('reports the ETA as available for picked_up as well as out_for_delivery', () => {
    for (const assignmentStatus of ['picked_up', 'out_for_delivery']) {
      expect(isEtaEligibleAssignmentStatus(assignmentStatus), assignmentStatus).toBe(true)
      const eta = calculateDeliveryEta({
        tracking: freshTracking(),
        destination,
        assignmentStatus,
        orderStatus: 'SHIPPED',
      })
      expect(eta.etaAvailable, assignmentStatus).toBe(true)
    }
  })

  it('does not promise an ETA before the driver has departed', () => {
    expect(isEtaEligibleAssignmentStatus('assigned')).toBe(false)
    const eta = calculateDeliveryEta({
      tracking: freshTracking(),
      destination,
      assignmentStatus: 'assigned',
      orderStatus: 'SHIPPED',
    })
    expect(eta.etaAvailable).toBe(false)
    expect(eta.unavailableReason).toBe('assignment_not_active')
  })

  // A GPS fix hours old produces a precise-looking but meaningless ETA.
  it('withholds the ETA when the last GPS fix is older than the hard cutoff', () => {
    const eta = calculateDeliveryEta({
      tracking: {
        hasLocation: true,
        isStale: true,
        latestLocation: {
          latitude: 33.89,
          longitude: 35.5,
          recordedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        },
      },
      destination,
      assignmentStatus: 'out_for_delivery',
      orderStatus: 'SHIPPED',
    })
    expect(eta.etaAvailable).toBe(false)
    expect(eta.unavailableReason).toBe('driver_location_stale')
  })

  it('exposes the age of the GPS fix the ETA was derived from', () => {
    const recordedAt = new Date(Date.now() - 90 * 1000).toISOString()
    const eta = calculateDeliveryEta({
      tracking: {
        hasLocation: true,
        isStale: false,
        latestLocation: { latitude: 33.89, longitude: 35.5, recordedAt },
      },
      destination,
      assignmentStatus: 'out_for_delivery',
      orderStatus: 'SHIPPED',
    })
    expect(eta.etaAvailable).toBe(true)
    expect(eta.locationRecordedAt).toBe(recordedAt)
    expect(eta.locationAgeSeconds).toBeGreaterThanOrEqual(89)
    expect(eta.locationAgeSeconds).toBeLessThanOrEqual(120)
  })

  // Each leg used to be rounded to 0.1km before being summed, so multi-stop
  // routes accumulated a systematic distance (and therefore time) error.
  it('rounds only the total distance, not each route leg', () => {
    const legs = Array.from({ length: 8 }, (_, i) => ({
      order_id: `o${i + 1}`,
      sequence_number: i + 1,
      status: 'PLANNED',
      latitude: 33.89 + (i + 1) * 0.004,
      longitude: 35.5 + (i + 1) * 0.004,
    }))
    legs.push({
      order_id: 'target',
      sequence_number: 9,
      status: 'PLANNED',
      latitude: 33.93,
      longitude: 35.54,
    })

    const eta = calculateDeliveryEta({
      tracking: freshTracking(),
      destination: { latitude: 33.93, longitude: 35.54 },
      assignmentStatus: 'out_for_delivery',
      orderStatus: 'SHIPPED',
      routeContext: buildRouteEtaContext(legs, 'target'),
      etaConfig: { speedKmh: 20, minMultiplier: 1, maxMultiplier: 1, serviceTimeMinutes: 0 },
    })

    // Sum of unrounded legs; each pre-rounded leg would drift from this.
    let expected = 0
    let [lat, lng] = [33.89, 35.5]
    for (const leg of legs.slice(0, 8)) {
      expected += exactHaversineKm(lat, lng, leg.latitude, leg.longitude)
      lat = leg.latitude
      lng = leg.longitude
    }
    expected += exactHaversineKm(lat, lng, 33.93, 35.54)

    expect(eta.distanceKm).toBeCloseTo(Math.round(expected * 10) / 10, 5)
  })
})

function freshTracking() {
  return {
    hasLocation: true,
    isStale: false,
    latestLocation: {
      latitude: 33.89,
      longitude: 35.5,
      recordedAt: new Date().toISOString(),
    },
  }
}

function exactHaversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
