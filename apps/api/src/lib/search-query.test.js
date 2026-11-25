import { describe, expect, it } from 'vitest'
import { toContainsPattern, toPrefixTsQuery } from './search-query.js'

describe('toPrefixTsQuery', () => {
  it('turns a partial word into a prefix query', () => {
    expect(toPrefixTsQuery('tom')).toBe('tom:*')
  })

  it('ANDs several partial words', () => {
    expect(toPrefixTsQuery('  Cherry tom ')).toBe('cherry:* & tom:*')
  })

  it('strips tsquery operators so input cannot change the query', () => {
    expect(toPrefixTsQuery("tom:* | !x & (y) <-> 'z'")).toBe('tom:* & x:* & y:* & z:*')
  })

  it('keeps Arabic letters', () => {
    expect(toPrefixTsQuery('طماط')).toBe('طماط:*')
  })

  it('returns null when nothing searchable remains', () => {
    expect(toPrefixTsQuery('  ::  &! ')).toBeNull()
    expect(toPrefixTsQuery(undefined)).toBeNull()
  })

  it('caps the number of terms', () => {
    expect(toPrefixTsQuery('a b c d e f g h').split(' & ')).toHaveLength(6)
  })
})

describe('toContainsPattern', () => {
  it('wraps and lowercases', () => {
    expect(toContainsPattern(' Mato ')).toBe('%mato%')
  })

  it('escapes LIKE wildcards', () => {
    expect(toContainsPattern('50%_off')).toBe('%50\\%\\_off%')
  })
})
