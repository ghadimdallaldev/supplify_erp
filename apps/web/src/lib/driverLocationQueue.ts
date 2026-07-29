import type { DriverLocationPoint } from './driverLocationProvider'

const STORAGE_KEY = 'supplify.driver.location.queue.v1'
const MAX_POINTS = 2_000

function readQueue(): DriverLocationPoint[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(points: DriverLocationPoint[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points.slice(-MAX_POINTS)))
}

export function enqueueDriverLocation(point: DriverLocationPoint): number {
  const points = readQueue()
  points.push(point)
  writeQueue(points)
  return Math.min(points.length, MAX_POINTS)
}

export function getQueuedDriverLocations(): DriverLocationPoint[] {
  return readQueue()
}

export function acknowledgeQueuedDriverLocations(ids: string[]) {
  const acknowledged = new Set(ids)
  writeQueue(readQueue().filter((point) => !acknowledged.has(point.id)))
}

export function clearDriverLocationQueue() {
  localStorage.removeItem(STORAGE_KEY)
}
