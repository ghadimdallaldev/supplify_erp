import { describe, it, expect } from 'vitest'
import {
  buildDeliveryLocationPayload,
  formFromDeliveryLocation,
  parseCoordinateInput,
  splitCoordinatePair,
  validateDeliveryLocationForm,
} from './deliveryLocationForm'

describe('deliveryLocationForm', () => {
  it('parses comma decimals', () => {
    expect(parseCoordinateInput('33,8938')).toBe(33.8938)
  })

  it('splits lat/lng pasted together', () => {
    expect(splitCoordinatePair('33.8938, 35.5018')).toEqual({
      lat: '33.8938',
      lng: '35.5018',
    })
  })

  it('omits empty coordinates so label-only saves do not clear GPS', () => {
    const payload = buildDeliveryLocationPayload({
      deliveryLatitude: '',
      deliveryLongitude: '',
      deliveryLocationLabel: 'Gate A',
      deliveryAddressNotes: '',
    })
    expect(payload).toEqual({
      deliveryLocationLabel: 'Gate A',
      deliveryAddressNotes: null,
    })
    expect(payload).not.toHaveProperty('deliveryLatitude')
  })

  it('includes coordinates when both are set', () => {
    const payload = buildDeliveryLocationPayload({
      deliveryLatitude: '33.8938',
      deliveryLongitude: '35.5018',
      deliveryLocationLabel: '',
      deliveryAddressNotes: '',
    })
    expect(payload.deliveryLatitude).toBe(33.8938)
    expect(payload.deliveryLongitude).toBe(35.5018)
  })

  it('maps API location into form fields', () => {
    expect(
      formFromDeliveryLocation({
        deliveryLatitude: 33.8938,
        deliveryLongitude: 35.5018,
        deliveryLocationLabel: 'Main gate',
      })
    ).toEqual({
      deliveryLatitude: '33.8938',
      deliveryLongitude: '35.5018',
      deliveryLocationLabel: 'Main gate',
      deliveryAddressNotes: '',
    })
  })

  it('rejects partial coordinates', () => {
    expect(
      validateDeliveryLocationForm({
        deliveryLatitude: '33.89',
        deliveryLongitude: '',
        deliveryLocationLabel: '',
        deliveryAddressNotes: '',
      })
    ).toMatch(/both latitude and longitude/i)
  })
})
