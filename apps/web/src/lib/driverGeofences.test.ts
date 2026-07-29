import { describe, expect, it } from 'vitest'
import { classifyGeofenceDistance, shouldSuggestArrival } from './driverGeofences'

describe('driver geofence assistance', () => {
  it('uses configurable approaching and arrival thresholds', () => {
    expect(classifyGeofenceDistance(450)).toBe('approaching')
    expect(classifyGeofenceDistance(70)).toBe('arrival_candidate')
    expect(classifyGeofenceDistance(900)).toBeNull()
  })

  it('only suggests arrival and never changes delivery status', () => {
    expect(shouldSuggestArrival('arrival_candidate', 40)).toBe(true)
    expect(shouldSuggestArrival('arrival_candidate', 180)).toBe(false)
  })
})
