import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

import { query } from '../lib/db.js'
import {
  executeCustomerImport,
  previewCustomerImport,
  parseCsv,
} from './supplier-customer-import.service.js'

describe('supplier-customer-import', () => {
  it('parseCsv maps restaurant name from header aliases', () => {
    const csv = `Restaurant Name,Email,Phone
Joe's Diner,joe@example.com,+1234567890`
    const { rows } = parseCsv(csv)
    expect(rows[0].raw.restaurant_name).toBe("Joe's Diner")
    expect(rows[0].raw.email).toBe('joe@example.com')
  })

  it('parses quoted commas, escaped quotes, BOMs, and multiline fields', () => {
    const csv =
      '\uFEFFRestaurant Name,Email,Notes\n"Tomato, Roma",chef@example.com,"Fresh ""Roma"" tomatoes"\n"Second Bistro",owner@example.com,"Line one\nLine two"'
    const { rows } = parseCsv(csv)
    expect(rows[0].raw.restaurant_name).toBe('Tomato, Roma')
    expect(rows[0].raw.notes).toBe('Fresh "Roma" tomatoes')
    expect(rows[1].raw.notes).toBe('Line one\nLine two')
  })

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('Restaurant Name,Notes\n"Broken,hello')).toThrow(
      'CSV contains an unterminated quoted field'
    )
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

describe('executeCustomerImport', () => {
  beforeEach(() => {
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('INSERT INTO supplier_customer_import_batch')) {
        return { rows: [{ id: 'batch-1' }] }
      }
      if (text.includes('INSERT INTO supplier_customer_prospect')) {
        return { rows: [{ id: 'prospect-1' }] }
      }
      return { rows: [] }
    })
  })

  it('imports valid rows and records validation failures', async () => {
    const result = await executeCustomerImport(
      'supplier-1',
      'Restaurant Name,Email\nAlpha,a@example.com\n,Bad email',
      { userId: 'user-1' }
    )

    expect(result).toMatchObject({ batchId: 'batch-1', created: 1, skipped: 0, failed: 1 })
    expect(result.rowErrors[0].rowNumber).toBe(3)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (supplier_id, normalized_email)'),
      expect.any(Array)
    )
  })
})
