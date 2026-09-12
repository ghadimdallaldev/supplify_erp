import { describe, expect, it } from 'vitest'
import { previewCustomerImport, parseCsv } from './supplier-customer-import.service.js'

describe('supplier-customer-import', () => {
  it('parseCsv maps restaurant name from header aliases', () => {
    const csv = `Restaurant Name,Email,Phone
Joe's Diner,joe@example.com,+1234567890`
    const { rows } = parseCsv(csv)
    expect(rows[0].raw.restaurant_name).toBe("Joe's Diner")
    expect(rows[0].raw.email).toBe('joe@example.com')
  })

  it('preview flags missing restaurant name', () => {
    const csv = `Restaurant Name,Email
,joe@example.com`
    const result = previewCustomerImport(csv)
    expect(result.errorCount).toBeGreaterThan(0)
  })

  it('preview counts valid rows', () => {
    const csv = `Restaurant Name,Email
Alpha,b@example.com
Beta,c@example.com`
    const result = previewCustomerImport(csv)
    expect(result.validCount).toBe(2)
  })
})
