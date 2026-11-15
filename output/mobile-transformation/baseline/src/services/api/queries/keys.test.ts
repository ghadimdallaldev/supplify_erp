import { queryKeys, qs } from './keys'

describe('query keys', () => {
  it('builds stable order keys', () => {
    expect(queryKeys.order('abc')).toEqual(['orders', 'abc'])
    expect(queryKeys.orders({ limit: '10' })).toEqual(['orders', { limit: '10' }])
  })

  it('includes date on run sheet key', () => {
    expect(queryKeys.runSheet('2026-06-18')).toEqual(['supplier', 'run-sheet', '2026-06-18'])
  })

  it('qs omits empty params', () => {
    expect(qs()).toBe('')
    expect(qs({ limit: '10', empty: '' })).toBe('?limit=10')
    expect(qs({ date: '2026-06-18' })).toBe('?date=2026-06-18')
  })
})
