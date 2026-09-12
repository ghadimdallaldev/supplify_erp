import { describe, it, expect } from 'vitest'
import { buildShortageMessage } from './order-fulfillment-issues.service.js'

describe('order-fulfillment-issues', () => {
  it('builds structured shortage message from order data', () => {
    const msg = buildShortageMessage({
      productName: 'Rice 1kg',
      orderedQuantity: 5,
      orderedUnit: 'bag',
      availableQuantity: 1,
      availableUnit: 'bag',
      replacementProductName: 'Rice 5kg',
      replacementQuantity: 1,
      replacementUnit: 'bag',
    })
    expect(msg).toContain('5 bag')
    expect(msg).toContain('Rice 1kg')
    expect(msg).toContain('1 bag')
    expect(msg).toContain('Rice 5kg')
    expect(msg).toContain('Do you want us to proceed')
  })
})
