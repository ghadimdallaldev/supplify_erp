import { describe, expect, it } from 'vitest'
import {
  parseMenuImportCsv,
  previewMenuImport,
  MENU_IMPORT_TEMPLATE,
} from './consumer-menu-import.service.js'

describe('consumer-menu-import.service', () => {
  it('parses template CSV', () => {
    const { rows } = parseMenuImportCsv(MENU_IMPORT_TEMPLATE)
    expect(rows).toHaveLength(4)
    expect(rows[0].raw.category).toBe('Starters')
    expect(rows[0].raw.name).toBe('Hummus & Bread')
  })

  it('flags missing price in preview', () => {
    const csv = `category,name,price\nStarters,Soup,`
    const result = previewMenuImport(csv)
    expect(result.errorCount).toBe(1)
    expect(result.validCount).toBe(0)
  })

  it('accepts quoted fields with commas', () => {
    const csv = `category,name,price,description\nMains,"Plate, large",18.00,"Rich, savory"`
    const result = previewMenuImport(csv)
    expect(result.validCount).toBe(1)
    expect(result.preview[0].mapped.name).toBe('Plate, large')
  })
})
