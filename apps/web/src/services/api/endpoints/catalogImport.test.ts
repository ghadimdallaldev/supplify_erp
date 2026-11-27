import { describe, expect, it } from 'vitest'
import { buildProductImportBody } from './catalogImport'

describe('buildProductImportBody', () => {
  it('sends category overrides in the JSON body', () => {
    const body = buildProductImportBody({
      csv: 'Name,SKU\nA,1',
      partial: true,
      categoryOverrides: { 2: 'leaf-cheese' },
    })
    expect(body).toMatchObject({ categoryOverrides: { 2: 'leaf-cheese' } })
  })

  it('sends category overrides as a multipart field', () => {
    const body = buildProductImportBody({
      file: new File(['x'], 'p.xlsx'),
      categoryOverrides: { 3: 'leaf-bread' },
    }) as FormData
    expect(JSON.parse(String(body.get('categoryOverrides')))).toEqual({ 3: 'leaf-bread' })
  })

  it('omits empty overrides', () => {
    const body = buildProductImportBody({
      file: new File(['x'], 'p.xlsx'),
      categoryOverrides: {},
    }) as FormData
    expect(body.get('categoryOverrides')).toBeNull()
  })
})
