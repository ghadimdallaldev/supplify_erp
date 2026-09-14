import { describe, expect, it } from 'vitest'
import {
  buildReceivingDiscrepancies,
  validateAndEnrichReceivingLines,
  sumBillableAcceptedQuantity,
} from './receiving-line-validation.js'
import { ValidationError } from '../middlewares/errorHandler.js'

describe('receiving-line-validation', () => {
  const orderItems = [
    {
      id: 'oi-1',
      quantity: 10,
      product_id: 'p-1',
      product_name: 'Tomatoes',
      sku: 'TOM-1',
      unit: 'kg',
      unit_price: 5,
    },
    { id: 'oi-2', quantity: 4, product_id: 'p-2', unit: 'case', unit_price: 12 },
  ]

  it('requires every order line in the payload', () => {
    expect(() =>
      validateAndEnrichReceivingLines(orderItems, [
        { orderItemId: 'oi-1', received_quantity: 10, quality_status: 'ACCEPTED' },
      ])
    ).toThrow(/missing 1 order line/i)
  })

  it('rejects unknown order item ids', () => {
    expect(() =>
      validateAndEnrichReceivingLines(orderItems, [
        { orderItemId: 'oi-1', received_quantity: 10, quality_status: 'ACCEPTED' },
        { orderItemId: 'oi-unknown', received_quantity: 1, quality_status: 'ACCEPTED' },
      ])
    ).toThrow(/unknown order item/i)
  })

  it('enriches lines with server-side ordered quantities', () => {
    const enriched = validateAndEnrichReceivingLines(orderItems, [
      { orderItemId: 'oi-1', received_quantity: 8, quality_status: 'ACCEPTED' },
      { orderItemId: 'oi-2', received_quantity: 4, quality_status: 'DAMAGED' },
    ])

    expect(enriched).toHaveLength(2)
    expect(enriched[0].ordered_quantity).toBe(10)
    expect(enriched[1].ordered_quantity).toBe(4)
    expect(enriched[0].productId).toBe('p-1')
  })

  it('sums billable accepted quantity excluding rejected lines', () => {
    const lines = [
      { received_quantity: 5, quality_status: 'ACCEPTED' },
      { received_quantity: 4, quality_status: 'DAMAGED' },
      { received_quantity: 0, quality_status: 'ACCEPTED' },
    ]
    expect(sumBillableAcceptedQuantity(lines)).toBe(5)
  })

  it('normalizes the camel-case payload sent by mobile clients', () => {
    const enriched = validateAndEnrichReceivingLines(orderItems, [
      { orderItemId: 'oi-1', receivedQuantity: 7, qualityStatus: 'DAMAGED' },
      { orderItemId: 'oi-2', receivedQuantity: 4 },
    ])
    expect(enriched[0]).toMatchObject({
      received_quantity: 7,
      quality_status: 'DAMAGED',
      product_name: 'Tomatoes',
      sku: 'TOM-1',
      actual_unit_price: 5,
    })
    expect(enriched[1].quality_status).toBe('ACCEPTED')
  })

  it('rejects unknown quality values', () => {
    expect(() =>
      validateAndEnrichReceivingLines(orderItems, [
        { orderItemId: 'oi-1', receivedQuantity: 10, qualityStatus: 'UNKNOWN' },
        { orderItemId: 'oi-2', receivedQuantity: 4 },
      ])
    ).toThrow(/invalid quality status/i)
  })

  it('builds dispute lines for shortages and non-accepted quality', () => {
    const discrepancies = buildReceivingDiscrepancies([
      {
        orderItemId: 'oi-1',
        product_name: 'Tomatoes',
        ordered_quantity: 10,
        received_quantity: 7,
        quality_status: 'ACCEPTED',
        expected_unit_price: 5,
        unit: 'kg',
      },
      {
        orderItemId: 'oi-2',
        product_name: 'Milk',
        ordered_quantity: 4,
        received_quantity: 4,
        quality_status: 'DAMAGED',
        expected_unit_price: 2,
        unit: 'case',
      },
    ])
    expect(discrepancies).toHaveLength(2)
    expect(discrepancies[0].disputedAmount).toBe(15)
    expect(discrepancies[1].disputedAmount).toBe(8)
  })
})
