import { describe, expect, it } from 'vitest'
import {
  normalizeSkuKey,
  extractFilenameStem,
  parseMappingCsv,
  buildImageMatches,
  buildImageImportFailureCsv,
} from './product-image-import.service.js'

describe('product-image-import.service', () => {
  describe('normalizeSkuKey', () => {
    it('lowercases and trims SKU values', () => {
      expect(normalizeSkuKey('  SKU-001  ')).toBe('sku-001')
      expect(normalizeSkuKey('Chicken-2KG')).toBe('chicken-2kg')
    })
  })

  describe('extractFilenameStem', () => {
    it('returns basename without extension, lowercased', () => {
      expect(extractFilenameStem('images/CHICKEN-2KG.JPG')).toBe('chicken-2kg')
      expect(extractFilenameStem('SKU-001.png')).toBe('sku-001')
    })
  })

  describe('parseMappingCsv', () => {
    it('parses SKU and ImageFile columns with aliases', () => {
      const csv = `product_code,image_file
SKU-001,photos/a.jpg
BAR-2,bar.png`
      const rows = parseMappingCsv(csv)
      expect(rows).toHaveLength(2)
      expect(rows[0].sku).toBe('SKU-001')
      expect(rows[0].imageFile).toBe('photos/a.jpg')
      expect(rows[1].sku).toBe('BAR-2')
      expect(rows[1].imageFile).toBe('bar.png')
    })

    it('accepts barcode and file aliases', () => {
      const csv = `barcode,file
ABC,file.webp`
      const rows = parseMappingCsv(csv)
      expect(rows[0].sku).toBe('ABC')
      expect(rows[0].imageFile).toBe('file.webp')
    })
  })

  describe('buildImageMatches', () => {
    const products = [
      { id: 'p1', sku: 'SKU-001', image_url: null },
      { id: 'p2', sku: 'SKU-002', image_url: 'https://example.com/existing.jpg' },
      { id: 'p3', sku: 'SKU-003', image_url: null },
    ]

    const zipEntries = [
      { fileName: 'SKU-001.jpg' },
      { fileName: 'photos/SKU-001.png' },
      { fileName: 'SKU-002.jpg' },
      { fileName: 'unknown.jpg' },
      { fileName: 'SKU-003.webp' },
    ]

    it('matches zip entries to products by filename stem', () => {
      const plan = buildImageMatches({
        method: 'zip_sku',
        zipEntries,
        products,
        replaceExisting: true,
      })

      expect(plan.summary.matched).toBe(3)
      expect(plan.summary.unmatchedFiles).toBe(1)
      expect(plan.summary.duplicates).toBe(1)
      expect(plan.allMatches.map((m) => m.sku).sort()).toEqual(['SKU-001', 'SKU-002', 'SKU-003'])
    })

    it('skips products with existing images when replaceExisting is false', () => {
      const plan = buildImageMatches({
        method: 'zip_sku',
        zipEntries,
        products,
        replaceExisting: false,
      })

      expect(plan.summary.matched).toBe(2)
      expect(plan.summary.skippedExisting).toBe(1)
      expect(plan.skippedExisting[0].sku).toBe('SKU-002')
      expect(plan.allMatches.every((m) => m.sku !== 'SKU-002')).toBe(true)
    })

    it('matches mapping CSV rows to zip entries', () => {
      const plan = buildImageMatches({
        method: 'zip_mapping',
        zipEntries: [{ fileName: 'folder/a.jpg' }, { fileName: 'b.png' }],
        products: [{ id: 'p1', sku: 'A-SKU', image_url: null }],
        mappingRows: [
          { rowNumber: 2, sku: 'A-SKU', imageFile: 'a.jpg' },
          { rowNumber: 3, sku: 'MISSING', imageFile: 'b.png' },
        ],
        replaceExisting: true,
      })

      expect(plan.summary.matched).toBe(1)
      expect(plan.summary.unmatchedProducts).toBe(1)
      expect(plan.allMatches[0].fileName).toBe('folder/a.jpg')
    })
  })

  describe('buildImageImportFailureCsv', () => {
    it('builds a CSV with sku, file, and reason columns', () => {
      const csv = buildImageImportFailureCsv([
        { sku: 'SKU-1', file: 'a.jpg', reason: 'Invalid image' },
      ])
      expect(csv).toContain('sku,file,reason')
      expect(csv).toContain('SKU-1,a.jpg,Invalid image')
    })

    it('neutralizes formula injection in CSV fields', () => {
      const csv = buildImageImportFailureCsv([{ sku: '=1+1', file: '+cmd', reason: '@SUM(A1)' }])
      expect(csv).toContain("'=1+1")
      expect(csv).toContain("'+cmd")
      expect(csv).toContain("'@SUM(A1)")
    })
  })
})
