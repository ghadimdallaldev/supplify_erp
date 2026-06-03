import { describe, expect, it } from 'vitest'
import { formatAddressLine, normalizeAddress } from './address'

describe('normalizeAddress', () => {
  it('maps object fields to strings', () => {
    expect(normalizeAddress({ city: 'Dubai', country: 'UAE' })).toEqual({
      street: '',
      city: 'Dubai',
      region: '',
      country: 'UAE',
    })
  })

  it('handles string addresses', () => {
    expect(normalizeAddress('123 Main St')).toEqual({
      street: '123 Main St',
      city: '',
      region: '',
      country: '',
    })
  })
})

describe('formatAddressLine', () => {
  it('formats object addresses for display', () => {
    expect(formatAddressLine({ city: 'Dubai', country: 'UAE' })).toBe('Dubai, UAE')
  })
})
