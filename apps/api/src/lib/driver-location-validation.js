import { ValidationError } from '../middlewares/errorHandler.js'

export const TRACKING_DIAGNOSTIC_CODES = Object.freeze({
  ACTIVE: 'TRACKING_ACTIVE',
  LOW_ACCURACY: 'LOW_ACCURACY',
  STALE: 'NO_RECENT_PING',
  IMPOSSIBLE_SPEED: 'IMPOSSIBLE_SPEED',
  LARGE_JUMP: 'LARGE_DISTANCE_JUMP',
  DUPLICATE: 'DUPLICATE_POINT',
})

export function validateTrackingPoint(
  point,
  { now = new Date(), maxAccuracyMeters = 100, maxSpeedKph = 160 } = {}
) {
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ValidationError('latitude and longitude must be valid numbers')
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ValidationError('latitude or longitude out of range')
  }
  if (latitude === 0 && longitude === 0) throw new ValidationError('invalid coordinates')

  const recordedAt = point?.recordedAt ? new Date(point.recordedAt) : now
  if (Number.isNaN(recordedAt.getTime())) throw new ValidationError('recordedAt is invalid')
  if (recordedAt.getTime() > now.getTime() + 2 * 60 * 1000) {
    throw new ValidationError('recordedAt cannot be in the future')
  }
  if (recordedAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    throw new ValidationError('recordedAt is too old')
  }

  const accuracyMeters = point?.accuracyMeters == null ? null : Number(point.accuracyMeters)
  if (accuracyMeters != null && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    throw new ValidationError('accuracyMeters must be a non-negative number')
  }
  const speedMps = point?.speedMps == null ? null : Number(point.speedMps)
  if (speedMps != null && (!Number.isFinite(speedMps) || speedMps < 0)) {
    throw new ValidationError('speedMps must be a non-negative number')
  }
  const headingDegrees = point?.headingDegrees == null ? null : Number(point.headingDegrees)
  if (
    headingDegrees != null &&
    (!Number.isFinite(headingDegrees) || headingDegrees < 0 || headingDegrees >= 360)
  ) {
    throw new ValidationError('headingDegrees must be between 0 and 360')
  }

  return {
    ...point,
    latitude,
    longitude,
    accuracyMeters,
    speedMps,
    headingDegrees,
    recordedAt,
    lowAccuracy: accuracyMeters != null && accuracyMeters > maxAccuracyMeters,
    maxSpeedKph,
  }
}

export function normalizeHeading(headingDegrees) {
  if (headingDegrees == null || !Number.isFinite(Number(headingDegrees))) return null
  return ((Number(headingDegrees) % 360) + 360) % 360
}

export function distanceMeters(a, b) {
  if (!a || !b) return null
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(Number(b.latitude) - Number(a.latitude))
  const dLng = toRad(Number(b.longitude) - Number(a.longitude))
  const lat1 = toRad(Number(a.latitude))
  const lat2 = toRad(Number(b.latitude))
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function validateMovement(point, previous, { maxSpeedKph = 160 } = {}) {
  if (!previous) return { accepted: true, rejectionReason: null }
  const seconds =
    (point.recordedAt.getTime() - new Date(previous.recorded_at || previous.recordedAt).getTime()) /
    1000
  if (seconds <= 0) return { accepted: false, rejectionReason: TRACKING_DIAGNOSTIC_CODES.DUPLICATE }
  const meters = distanceMeters(point, previous)
  const speedKph = (meters / seconds) * 3.6
  if (speedKph > maxSpeedKph) {
    return {
      accepted: false,
      rejectionReason: TRACKING_DIAGNOSTIC_CODES.IMPOSSIBLE_SPEED,
      speedKph,
    }
  }
  return { accepted: true, rejectionReason: null, speedKph }
}
