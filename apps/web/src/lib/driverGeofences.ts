export type GeofenceState =
  | 'approaching'
  | 'nearby'
  | 'arrival_candidate'
  | 'arrival_confirmed'
  | 'left_destination'

export function classifyGeofenceDistance(
  distanceMeters: number | null,
  thresholds = { approaching: 500, nearby: 200, arrival: 80 }
): GeofenceState | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null
  if (distanceMeters <= thresholds.arrival) return 'arrival_candidate'
  if (distanceMeters <= thresholds.nearby) return 'nearby'
  if (distanceMeters <= thresholds.approaching) return 'approaching'
  return null
}

/** GPS assistance only; delivery status remains driver-confirmed. */
export function shouldSuggestArrival(
  state: GeofenceState | null,
  accuracyMeters: number | null,
  maxAccuracyMeters = 100
): boolean {
  return (
    state === 'arrival_candidate' && (accuracyMeters == null || accuracyMeters <= maxAccuracyMeters)
  )
}
