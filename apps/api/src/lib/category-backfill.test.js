import { describe, expect, it } from 'vitest'
import { loadSeedCategories } from '../test/category-seed.js'
import { seedCategoryFields, seedCategoryResolver } from '../../scripts/lib/seed-categories.js'
import { SUPPLIERS } from '../../scripts/seed/horeca-data.mjs'
import { backfillShelfKey } from './category-backfill.js'

const categories = loadSeedCategories()
const leafIds = new Set(categories.filter((c) => c.parent_category_id).map((c) => c.id))

describe('seed category resolver', () => {
  const resolve = seedCategoryResolver(categories)

  it('the seeds produce leaf categories', () => {
    const resolved = []
    for (const supplier of SUPPLIERS) {
      for (const [section, items] of Object.entries(supplier.categories)) {
        for (const item of items) resolved.push(resolve(item.name, section))
      }
    }
    expect(resolved.length).toBeGreaterThan(50)
    expect(resolved.every((id) => leafIds.has(id))).toBe(true)
    // Most demo products land on a real category, not the "Other" fallback.
    expect(resolved.filter((id) => id !== 'other').length / resolved.length).toBeGreaterThan(0.8)
  })

  it('resolves by name, then by the old text, then falls back to Other', () => {
    expect(resolve('Fresh Tomatoes', 'Vegetables')).toBe('vegetables')
    expect(resolve('Weekly special', 'Grains')).toBe('grains-legumes')
    expect(resolve('Weekly special', 'Produce')).toBe('other')
    expect(resolve('Tier Product 3')).toBe('other')
  })

  it('flags legacy text that could only be placed on Other for review', () => {
    expect(seedCategoryFields(resolve, 'Weekly special', 'Produce')).toEqual({
      category_id: 'other',
      category_needs_review: true,
    })
    expect(seedCategoryFields(resolve, 'Tier Product 3')).toEqual({
      category_id: 'other',
      category_needs_review: false,
    })
    expect(seedCategoryFields(resolve, 'Fresh Tomatoes', 'Vegetables')).toEqual({
      category_id: 'vegetables',
      category_needs_review: false,
    })
  })
})

describe('backfillShelfKey', () => {
  it('collides names that differ by case, spaces and plural', () => {
    expect(backfillShelfKey('Bread')).toBe(backfillShelfKey('Breads'))
    expect(backfillShelfKey('bread ')).toBe(backfillShelfKey('BREAD'))
    expect(backfillShelfKey('Bread')).not.toBe(backfillShelfKey('Cheese'))
    expect(backfillShelfKey('123')).toBe('123')
  })
})
