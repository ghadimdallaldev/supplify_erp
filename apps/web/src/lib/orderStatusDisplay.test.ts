import { describe, expect, it } from 'vitest'
import {
  getOrderCancellationBanner,
  getOrderStatusLabel,
  isSupplierDeclined,
} from './orderStatusDisplay'

describe('orderStatusDisplay', () => {
  it('shows declined label for restaurant when supplier cancelled', () => {
    const order = {
      status: 'CANCELLED',
      cancelled_by: 'SUPPLIER' as const,
      cancel_reason: 'Out of stock',
    }
    expect(getOrderStatusLabel(order, 'RESTAURANT')).toBe('Declined by supplier')
    expect(isSupplierDeclined(order)).toBe(true)
    expect(getOrderCancellationBanner(order, 'RESTAURANT')).toEqual({
      title: 'Declined by supplier',
      reason: 'Out of stock',
    })
  })

  it('shows declined for supplier view', () => {
    expect(
      getOrderStatusLabel(
        { status: 'CANCELLED', cancelled_by: 'SUPPLIER', cancel_reason: 'Busy' },
        'SUPPLIER'
      )
    ).toBe('Declined')
  })
})
