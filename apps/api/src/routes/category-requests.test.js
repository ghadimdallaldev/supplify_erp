import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { categoryRequestCreateSchema } from './products/category-requests.js'
import {
  approveSchema,
  mergeSchema,
  reorderSchema,
  updateCategorySchema,
} from './admin-catalog.routes.js'
import {
  categoryRequestNotice,
  categorySlugBase,
  normalizeRequestName,
} from '../services/category-requests.service.js'

const UUID = '7b0f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

describe('category request input', () => {
  it('requires a name; productIds default to none and must be uuids', () => {
    expect(categoryRequestCreateSchema.parse({ proposedName: ' Truffles ' })).toEqual({
      proposedName: 'Truffles',
      productIds: [],
    })
    expect(() => categoryRequestCreateSchema.parse({ proposedName: '' })).toThrow(z.ZodError)
    expect(() =>
      categoryRequestCreateSchema.parse({ proposedName: 'X', productIds: ['p1'] })
    ).toThrow(z.ZodError)
  })

  it('duplicate pending request is 409: names that differ by case, spacing or plural collide', () => {
    expect(normalizeRequestName(' truffle ')).toBe(normalizeRequestName('TRUFFLES'))
    expect(normalizeRequestName('Halloumi blocks')).not.toBe(normalizeRequestName('Halloumi'))
  })

  it('slugs are ASCII; an Arabic-only name falls back', () => {
    expect(categorySlugBase('Truffles & Mushrooms')).toBe('truffle-mushroom')
    expect(categorySlugBase('كمأة')).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('admin resolution input', () => {
  it('merge needs a category id; approve fields are optional', () => {
    expect(() => mergeSchema.parse({})).toThrow(z.ZodError)
    expect(approveSchema.parse({})).toEqual({})
    expect(() => approveSchema.parse({ icon_key: 'Bad Icon!' })).toThrow(z.ZodError)
  })

  it('tree edits: strict update, reorder needs ids', () => {
    expect(() => updateCategorySchema.parse({ supplier_id: UUID })).toThrow(z.ZodError)
    expect(updateCategorySchema.parse({ aliases: ['truffe'] })).toEqual({ aliases: ['truffe'] })
    expect(() => reorderSchema.parse({ parentId: null, ids: [] })).toThrow(z.ZodError)
  })
})

describe('supplier notice (CATEGORY_REQUEST_RESOLVED)', () => {
  const request = { proposed_name: 'Truffles', admin_note: null }
  const category = { name: 'Truffles & Mushrooms', name_ar: 'كمأة' }

  it('approved: English and Arabic, with the moved count', () => {
    const en = categoryRequestNotice('en', {
      outcome: 'approved',
      request,
      category,
      movedProducts: 2,
    })
    expect(en.title).toBe('Category added')
    expect(en.message).toContain('Truffles & Mushrooms')
    expect(en.message).toContain('2')
    const ar = categoryRequestNotice('ar', {
      outcome: 'approved',
      request,
      category,
      movedProducts: 2,
    })
    expect(ar.title).toMatch(/[؀-ۿ]/)
    expect(ar.message).toContain('كمأة')
  })

  it('merged and rejected (with the admin note) both resolve to text, never a raw key', () => {
    const merged = categoryRequestNotice('en', {
      outcome: 'merged',
      request,
      category,
      movedProducts: 1,
    })
    expect(merged.message).not.toContain('notifications.')
    const rejected = categoryRequestNotice('ar', {
      outcome: 'rejected',
      request: { ...request, admin_note: 'Use Cheese' },
      category: null,
      movedProducts: 0,
    })
    expect(rejected.message).toContain('Use Cheese')
    expect(rejected.title).not.toContain('notifications.')
  })
})
