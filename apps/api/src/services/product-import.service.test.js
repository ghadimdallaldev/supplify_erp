import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseImportFile,
  parseSpreadsheetBuffer,
  previewProductImport,
  countProductImportRows,
  XLSX_MAX_BUFFER_BYTES,
  XLSX_MAX_COLS,
  XLSX_MAX_ROWS,
} from './product-import.service.js'

function buildXlsxBuffer(rows, { sheetName = 'Products', extraSheets = [] } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  for (const { name, data } of extraSheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), name)
  }
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

  it('rejects legacy .xls extension', () => {
    expect(() => parseImportFile(Buffer.from('data'), 'legacy.xls')).toThrow(/\.xls/)
  })

  it('rejects non-OOXML buffer presented as .xlsx', () => {
    expect(() => parseSpreadsheetBuffer(Buffer.from('not-a-zip-file'), 'bad.xlsx')).toThrow(/OOXML/)
  })

  it('rejects spreadsheets with more than one sheet', () => {
    const buffer = buildXlsxBuffer(
      [
        ['sku', 'name'],
        ['A', 'One'],
      ],
      {
        extraSheets: [{ name: 'Extra', data: [['sku'], ['B']] }],
      }
    )
    expect(() => parseSpreadsheetBuffer(buffer, 'multi.xlsx')).toThrow(/at most 1 sheet/)
  })

  it('rejects spreadsheets exceeding max data rows', () => {
    const header = ['sku', 'name']
    const dataRows = Array.from({ length: XLSX_MAX_ROWS + 1 }, (_, i) => [`SKU-${i}`, `Item ${i}`])
    const buffer = buildXlsxBuffer([header, ...dataRows])
    expect(() => parseSpreadsheetBuffer(buffer, 'too-many-rows.xlsx')).toThrow(
      new RegExp(`${XLSX_MAX_ROWS} data rows`)
    )
  })

  it('rejects spreadsheets exceeding max columns', () => {
    const headers = Array.from({ length: XLSX_MAX_COLS + 1 }, (_, i) => `col${i}`)
    const values = Array.from({ length: XLSX_MAX_COLS + 1 }, (_, i) => `v${i}`)
    const buffer = buildXlsxBuffer([headers, values])
    expect(() => parseSpreadsheetBuffer(buffer, 'too-many-cols.xlsx')).toThrow(
      new RegExp(`${XLSX_MAX_COLS} columns`)
    )
  })

  it('rejects spreadsheets containing formulas', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['sku', 'name'],
      ['A', 'Widget'],
    ])
    sheet.B2 = { t: 'n', f: '1+1', v: 2 }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Products')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    expect(() => parseSpreadsheetBuffer(buffer, 'formula.xlsx')).toThrow(/formulas/)
  })

  it('rejects oversized xlsx buffers', () => {
    const buffer = Buffer.alloc(XLSX_MAX_BUFFER_BYTES + 1, 0)
    buffer.writeUInt8(0x50, 0)
    buffer.writeUInt8(0x4b, 1)
    buffer.writeUInt8(0x03, 2)
    buffer.writeUInt8(0x04, 3)
    expect(() => parseSpreadsheetBuffer(buffer, 'huge.xlsx')).toThrow(/maximum size/)
  })
})
