import { describe, expect, it } from 'vitest'
import { getStockStatus } from './inventoryShared'

describe('getStockStatus', () => {
  it('coerces decimal strings from the API before comparing to threshold', () => {
    expect(getStockStatus('119.000', '5')).toBe('IN_STOCK')
    expect(getStockStatus('87.000', '5')).toBe('IN_STOCK')
    expect(getStockStatus('4.000', '5')).toBe('LOW_STOCK')
  })

  it('classifies numeric quantities with inclusive threshold boundary', () => {
    expect(getStockStatus(0, 5)).toBe('OUT_OF_STOCK')
    expect(getStockStatus(5, 5)).toBe('LOW_STOCK')
    expect(getStockStatus(6, 5)).toBe('IN_STOCK')
  })
})
