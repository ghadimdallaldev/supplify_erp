import { describe, expect, it } from 'vitest'
import { postalCodeMatches } from './postal-code-match.js'

describe('postalCodeMatches', () => {
  it('matches a full code after spaces and case change', () => {
    expect(postalCodeMatches('1100', '1100')).toBe(true)
    expect(postalCodeMatches('sw1a 1aa', 'SW1A1AA')).toBe(true)
    expect(postalCodeMatches('1100', ' 1100 ')).toBe(true)
  })

  it('matches a district prefix without swallowing the next district', () => {
    expect(postalCodeMatches('E1', 'E1 6AN')).toBe(true)
    expect(postalCodeMatches('SW1', 'SW1A 1AA')).toBe(true)
    expect(postalCodeMatches('SW1', 'SW1A1AA')).toBe(true)
    expect(postalCodeMatches('SW1', 'SW10 1AA')).toBe(false)
    expect(postalCodeMatches('E1', 'E14 5AB')).toBe(false)
    expect(postalCodeMatches('11', '1100')).toBe(false)
  })

  it('fails closed when either side is empty', () => {
    expect(postalCodeMatches('E1', '')).toBe(false)
    expect(postalCodeMatches('', 'E1 6AN')).toBe(false)
  })
})
