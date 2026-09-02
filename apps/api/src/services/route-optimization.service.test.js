import { describe, it, expect } from 'vitest'
import { optimizeStopOrderNearestNeighbor } from './route-optimization.service.js'

describe('route-optimization.service', () => {
  it('orders movable stops by nearest neighbor from depot', () => {
    const stops = [
      {
        id: 'a',
        status: 'PLANNED',
        sequenceNumber: 1,
        destinationLatitude: 33.9,
        destinationLongitude: 35.5,
        destinationCoordinatesAvailable: true,
      },
      {
        id: 'b',
        status: 'PLANNED',
        sequenceNumber: 2,
        destinationLatitude: 33.895,
        destinationLongitude: 35.495,
        destinationCoordinatesAvailable: true,
      },
      {
        id: 'c',
        status: 'PLANNED',
        sequenceNumber: 3,
        destinationLatitude: 34.0,
        destinationLongitude: 35.6,
        destinationCoordinatesAvailable: true,
      },
    ]
    const ordered = optimizeStopOrderNearestNeighbor(stops, { lat: 33.89, lng: 35.49 })
    expect(ordered).toHaveLength(3)
    expect(ordered[0]).toBe('b')
  })

  it('keeps delivered stops in place', () => {
    const stops = [
      {
        id: 'done',
        status: 'DELIVERED',
        sequenceNumber: 1,
        destinationLatitude: 33.9,
        destinationLongitude: 35.5,
        destinationCoordinatesAvailable: true,
      },
      {
        id: 'next',
        status: 'PLANNED',
        sequenceNumber: 2,
        destinationLatitude: 33.91,
        destinationLongitude: 35.51,
        destinationCoordinatesAvailable: true,
      },
    ]
    const ordered = optimizeStopOrderNearestNeighbor(stops, { lat: 33.89, lng: 35.49 })
    expect(ordered[0]).toBe('done')
    expect(ordered[1]).toBe('next')
  })
})
