import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

import { query } from '../lib/db.js'
import {
  updateRestaurantDeliveryLocation,
  updateBranchDeliveryLocation,
} from './restaurant-delivery-location.service.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const UPDATED_ROW = {
  id: 'restaurant-1',
  name: 'Test Restaurant',
  delivery_latitude: 33.8938,
  delivery_longitude: 35.5018,
  delivery_location_label: 'Main kitchen entrance',
  delivery_address_notes: 'Use the back gate',
}

/** The UPDATE statement the service builds, for asserting on columns and values. */
function lastUpdateCall() {
  const call = query.mock.calls.at(-1)
  return { sql: call[0], values: call[1] }
}

describe('restaurant-delivery-location.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReset()
    query.mockResolvedValue({ rows: [UPDATED_ROW] })
  })

  describe('updateRestaurantDeliveryLocation input aliases', () => {
    it('accepts the camelCase shape used by the web app', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', {
        deliveryLatitude: 33.8938,
        deliveryLongitude: 35.5018,
        deliveryLocationLabel: 'Main kitchen entrance',
        deliveryAddressNotes: 'Use the back gate',
      })

      const { sql, values } = lastUpdateCall()
      expect(sql).toContain('UPDATE restaurant SET')
      expect(values).toEqual([
        33.8938,
        35.5018,
        'Main kitchen entrance',
        'Use the back gate',
        'restaurant-1',
      ])
    })

    it('accepts the snake_case legacy shape', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', {
        delivery_latitude: 33.8938,
        delivery_longitude: 35.5018,
        delivery_location_label: 'Main kitchen entrance',
      })

      const { values } = lastUpdateCall()
      expect(values).toEqual([33.8938, 35.5018, 'Main kitchen entrance', 'restaurant-1'])
    })

    // Regression: mobile shipped `latitude`/`longitude`/`label`/`addressNotes`, which matched
    // no alias and made every save fail with "No delivery location fields to update".
    it('accepts the bare shape sent by the mobile apps', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', {
        latitude: 33.8938,
        longitude: 35.5018,
        label: 'Main kitchen entrance',
        addressNotes: 'Use the back gate',
      })

      const { sql, values } = lastUpdateCall()
      expect(sql).toContain('delivery_latitude')
      expect(sql).toContain('delivery_location_label')
      expect(sql).toContain('delivery_address_notes')
      expect(values).toEqual([
        33.8938,
        35.5018,
        'Main kitchen entrance',
        'Use the back gate',
        'restaurant-1',
      ])
    })

    it('returns the mapped camelCase location to the caller', async () => {
      const result = await updateRestaurantDeliveryLocation('restaurant-1', {
        latitude: 33.8938,
        longitude: 35.5018,
      })

      expect(result).toMatchObject({
        id: 'restaurant-1',
        deliveryLatitude: 33.8938,
        deliveryLongitude: 35.5018,
        deliveryLocationLabel: 'Main kitchen entrance',
        coordinatesAvailable: true,
      })
    })

    it('prefers the camelCase alias when several shapes are sent together', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', {
        deliveryLatitude: 33.8938,
        deliveryLongitude: 35.5018,
        latitude: 1.1,
        longitude: 2.2,
      })

      const { values } = lastUpdateCall()
      expect(values).toEqual([33.8938, 35.5018, 'restaurant-1'])
    })

    it('clears coordinates when both are explicitly null', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', {
        deliveryLatitude: null,
        deliveryLongitude: null,
      })

      const { values } = lastUpdateCall()
      expect(values).toEqual([null, null, 'restaurant-1'])
    })

    it('stores an empty label as NULL rather than an empty string', async () => {
      await updateRestaurantDeliveryLocation('restaurant-1', { label: '' })

      const { values } = lastUpdateCall()
      expect(values).toEqual([null, 'restaurant-1'])
    })

    it('rejects a body with no recognised delivery location field', async () => {
      await expect(
        updateRestaurantDeliveryLocation('restaurant-1', { unrelated: 'value' })
      ).rejects.toThrow(ValidationError)
    })

    it('rejects a latitude sent without a longitude', async () => {
      await expect(
        updateRestaurantDeliveryLocation('restaurant-1', { latitude: 33.8938 })
      ).rejects.toThrow(/both be set or both be cleared/)
    })

    it('rejects an out-of-range latitude', async () => {
      await expect(
        updateRestaurantDeliveryLocation('restaurant-1', { latitude: 120, longitude: 35.5 })
      ).rejects.toThrow(/out of range/)
    })
  })

  describe('updateBranchDeliveryLocation', () => {
    it('accepts the bare mobile shape once branch ownership is confirmed', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'branch-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ ...UPDATED_ROW, id: 'branch-1', code: 'B1' }] })

      const result = await updateBranchDeliveryLocation('restaurant-1', 'branch-1', {
        latitude: 33.8938,
        longitude: 35.5018,
        addressNotes: 'Loading dock',
      })

      const { sql, values } = lastUpdateCall()
      expect(sql).toContain('UPDATE branch SET')
      expect(values).toEqual([33.8938, 35.5018, 'Loading dock', 'branch-1'])
      expect(result).toMatchObject({ id: 'branch-1', coordinatesAvailable: true })
    })

    it('rejects a branch that does not belong to the restaurant', async () => {
      query.mockResolvedValueOnce({ rows: [] })

      await expect(
        updateBranchDeliveryLocation('restaurant-1', 'other-branch', { latitude: 1, longitude: 2 })
      ).rejects.toThrow('Branch not found')
    })
  })
})
