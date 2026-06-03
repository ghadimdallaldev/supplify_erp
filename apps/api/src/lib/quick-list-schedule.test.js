import { describe, expect, it } from 'vitest'
import { normalizeDaysOfWeek } from './quick-list-schedule.js'

describe('normalizeDaysOfWeek', () => {
  it('returns arrays as-is', () => {
    expect(normalizeDaysOfWeek(['MONDAY', 'FRIDAY'])).toEqual(['MONDAY', 'FRIDAY'])
  })

  it('wraps legacy single day string', () => {
    expect(normalizeDaysOfWeek('MONDAY')).toEqual(['MONDAY'])
  })

  it('parses JSON array strings', () => {
    expect(normalizeDaysOfWeek('["MONDAY","WEDNESDAY"]')).toEqual(['MONDAY', 'WEDNESDAY'])
  })
})
