import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseImportFile,
  parseSpreadsheetBuffer,
  previewProductImport,
  countProductImportRows,
} from './product-import.service.js'

function buildXlsxBuffer(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Products')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

describe('product-import.service', () => {
  it('parseImportFile parses CSV buffer', () => {
    const csv = Buffer.from('sku,name,price\nSKU-1,Alpha Coffee,12.50\nSKU-2,Beta Tea,8.00', 'utf8')
    const { headers, rows } = parseImportFile(csv, 'products.csv')
    expect(headers).toEqual(['sku', 'name', 'price'])
    expect(rows).toHaveLength(2)
    expect(rows[0].raw.sku).toBe('SKU-1')
    expect(rows[0].raw.name).toBe('Alpha Coffee')
    expect(rows[0].raw.price).toBe('12.50')
  })

  it('parseSpreadsheetBuffer parses xlsx buffer from first sheet', () => {
    const buffer = buildXlsxBuffer([
      ['sku', 'name', 'stock'],
      ['XLS-1', 'Excel Product', '25'],
    ])
    const { headers, rows } = parseSpreadsheetBuffer(buffer, 'catalog.xlsx')
    expect(headers).toEqual(['sku', 'name', 'stock'])
    expect(rows).toHaveLength(1)
    expect(rows[0].rowNumber).toBe(2)
    expect(rows[0].raw.sku).toBe('XLS-1')
    expect(rows[0].raw.name).toBe('Excel Product')
    expect(rows[0].raw.stock).toBe('25')
  })

  it('previewProductImport accepts xlsx buffer input', () => {
    const buffer = buildXlsxBuffer([
      ['sku', 'name'],
      ['P-1', 'Widget'],
      ['', 'Missing SKU'],
    ])
    const result = previewProductImport(buffer, null, 'import.xlsx')
    expect(result.totalRows).toBe(2)
    expect(result.validCount).toBe(1)
    expect(result.errorCount).toBe(1)
  })

  it('countProductImportRows counts rows from xlsx buffer', () => {
    const buffer = buildXlsxBuffer([
      ['sku', 'name'],
      ['A', 'One'],
      ['B', 'Two'],
    ])
    expect(countProductImportRows(buffer, 'rows.xlsx')).toBe(2)
  })

  it('parseImportFile rejects unsupported extensions', () => {
    expect(() => parseImportFile(Buffer.from('data'), 'notes.txt')).toThrow(/Unsupported/)
  })
})
