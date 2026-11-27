import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  shelfCreateSchema,
  shelfOrderSchema,
  shelfProductsSchema,
  shelfUpdateSchema,
} from './products/shelves.js'
import { LIVE_DEAL_STATUSES, shelfInUseError, uniqueIds } from '../services/shelves.service.js'
import { CatalogError, catalogValidation, sendCatalogError } from '../lib/catalog-errors.js'

const UUID = '7b0f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

function fakeRes() {
  const res = { statusCode: 200, body: null }
  res.status = vi.fn((code) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body) => {
    res.body = body
    return res
  })
  return res
}

describe('shelf schemas', () => {
  it('trims names and requires one', () => {
    expect(shelfCreateSchema.parse({ name: '  Fridge ' })).toEqual({ name: 'Fridge' })
    expect(() => shelfCreateSchema.parse({ name: '   ' })).toThrow(z.ZodError)
    expect(() => shelfCreateSchema.parse({})).toThrow(z.ZodError)
  })

  it('update is strict and accepts display_order', () => {
    expect(shelfUpdateSchema.parse({ display_order: 3 })).toEqual({ display_order: 3 })
    expect(() => shelfUpdateSchema.parse({ supplier_id: UUID })).toThrow(z.ZodError)
  })

  it('product and order lists only take uuids', () => {
    expect(shelfProductsSchema.parse({ productIds: [] })).toEqual({ productIds: [] })
    expect(() => shelfProductsSchema.parse({ productIds: ['nope'] })).toThrow(z.ZodError)
    expect(() => shelfOrderSchema.parse({ shelfIds: [] })).toThrow(z.ZodError)
  })
})

describe('shelf rules', () => {
  it('shelf product_count distinct: duplicate ids collapse, order kept', () => {
    expect(uniqueIds(['b', 'a', 'b', null, 'a'])).toEqual(['b', 'a'])
  })

  it('archive in-use shelf is SHELF_IN_USE with names', () => {
    const error = shelfInUseError(
      [{ id: 'd1', name: 'Summer cheese', status: 'active' }],
      [{ id: 'r1', name: 'North depot (priority 1)', warehouse_id: 'w' }]
    )
    expect(error).toBeInstanceOf(CatalogError)
    expect(error).toMatchObject({
      name: 'SHELF_IN_USE',
      code: 'shelfInUse',
      statusCode: 409,
      details: {
        deals: [{ id: 'd1', name: 'Summer cheese' }],
        rules: [{ id: 'r1', name: 'North depot (priority 1)' }],
      },
    })
  })

  it('drafts, rejected and finished deals never block an archive', () => {
    expect(LIVE_DEAL_STATUSES).toContain('active')
    expect(LIVE_DEAL_STATUSES).toContain('scheduled')
    for (const status of ['draft', 'rejected', 'paused', 'expired', 'cancelled']) {
      expect(LIVE_DEAL_STATUSES).not.toContain(status)
    }
  })
})

describe('catalog errors', () => {
  it('create without category is 400 with code chooseCategory, localized', () => {
    const res = fakeRes()
    sendCatalogError(
      { requestId: 'r', headers: { 'accept-language': 'ar' } },
      res,
      catalogValidation('chooseCategory')
    )
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatchObject({ name: 'VALIDATION_ERROR', code: 'chooseCategory' })
    expect(res.body.error.message).toMatch(/[؀-ۿ]/)
  })

  it('foreign shelf rejected keeps the name/code contract; unknown errors are a 500', () => {
    const res = fakeRes()
    sendCatalogError({ requestId: 'r', headers: {} }, res, catalogValidation('foreignShelf'))
    expect(res.body.error).toMatchObject({ code: 'foreignShelf', message: expect.any(String) })
    const crash = fakeRes()
    sendCatalogError({ requestId: 'r', headers: {} }, crash, new Error('boom'))
    expect(crash.statusCode).toBe(500)
    expect(crash.body.error.name).toBe('INTERNAL_ERROR')
    expect(crash.body.error.message).not.toContain('boom')
  })

  it('every catalog error key exists in English and Arabic', () => {
    const load = (locale) =>
      JSON.parse(
        readFileSync(new URL(`../i18n/locales/${locale}/catalog.json`, import.meta.url), 'utf8')
      ).errors
    const en = load('en')
    const ar = load('ar')
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort())
    for (const code of [
      'chooseCategory',
      'categoryNotFound',
      'categoryNotLeaf',
      'foreignShelf',
      'foreignProducts',
      'shelfNotFound',
      'shelfNameTaken',
      'shelfInUse',
      'categoryRequestExists',
      'categoryRequestNotFound',
      'categoryRequestResolved',
      'categoryNameTaken',
      'departmentNotFound',
    ]) {
      expect(en[code], code).toBeTruthy()
      expect(ar[code], code).toBeTruthy()
    }
  })
})
