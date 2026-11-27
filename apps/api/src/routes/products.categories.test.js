import { describe, expect, it } from 'vitest'
import { loadSeedCategories } from '../test/category-seed.js'
import {
  buildCategoryTree,
  categorySuggestions,
  matchCategoriesForQuery,
  productQueryCategoryIds,
} from '../lib/category-tree.js'

const categories = loadSeedCategories()
const bySlug = (slug) => categories.find((c) => c.slug === slug)

function rowsWithCounts(counts) {
  return categories.map((c) => ({ ...c, product_count: counts[c.slug] ?? 0 }))
}

describe('buildCategoryTree', () => {
  it('tree nests leaves under departments', () => {
    const tree = buildCategoryTree(rowsWithCounts({}), { omitEmpty: false })
    const departments = categories.filter((c) => !c.parent_category_id)
    expect(tree.departments).toHaveLength(departments.length)
    const dairy = tree.departments.find((d) => d.slug === 'dept-dairy-eggs-cheese')
    expect(dairy).toMatchObject({ name: expect.any(String), name_ar: expect.any(String) })
    expect(dairy.categories.map((c) => c.slug)).toEqual(expect.arrayContaining(['dairy', 'cheese']))
    for (const department of tree.departments) {
      expect(department).not.toHaveProperty('parent_category_id')
      for (const leaf of department.categories) {
        expect(bySlug(leaf.slug).parent_category_id).toBe(department.id)
        expect(Object.keys(leaf).sort()).toEqual(
          ['icon_key', 'id', 'name', 'name_ar', 'name_fr', 'product_count', 'slug'].sort()
        )
      }
    }
    const leafCount = tree.departments.reduce((n, d) => n + d.categories.length, 0)
    expect(leafCount).toBe(categories.length - departments.length)
  })

  it('department counts sum their leaves; empty nodes are omitted for restaurants', () => {
    const tree = buildCategoryTree(rowsWithCounts({ dairy: 2, cheese: 3, vegetables: 1 }), {
      omitEmpty: true,
    })
    const expectedDepartments = [
      ...new Set(['dairy', 'cheese', 'vegetables'].map((s) => bySlug(s).parent_category_id)),
    ].map((id) => categories.find((c) => c.id === id).slug)
    expect(tree.departments.map((d) => d.slug).sort()).toEqual(expectedDepartments.sort())
    const dairy = tree.departments.find((d) => d.slug === 'dept-dairy-eggs-cheese')
    expect(dairy.product_count).toBe(5)
    expect(dairy.categories.map((c) => c.slug).sort()).toEqual(['cheese', 'dairy'])
  })

  it('supplier view keeps the full tree with zero counts', () => {
    const tree = buildCategoryTree(rowsWithCounts({ cheese: 1 }), { omitEmpty: false })
    const all = tree.departments.flatMap((d) => d.categories)
    expect(all.find((c) => c.slug === 'vegetables').product_count).toBe(0)
    expect(all.find((c) => c.slug === 'cheese').product_count).toBe(1)
  })
})

describe('category search', () => {
  it('search finds category for خبز and pain', () => {
    expect(matchCategoriesForQuery('خبز', categories)[0]).toMatchObject({ slug: 'bakery-bread' })
    expect(matchCategoriesForQuery('pain', categories)[0]).toMatchObject({ slug: 'bakery-bread' })
    const hit = matchCategoriesForQuery('pain', categories)[0]
    expect(hit).toMatchObject({
      department_id: bySlug('bakery-bread').parent_category_id,
      department_name: expect.any(String),
    })
  })

  it('strong matches hide prefix noise; prefixes only when nothing stronger matches', () => {
    const pain = matchCategoriesForQuery('pain', categories)
    expect(pain.every((c) => c.score >= 0.8)).toBe(true)
    expect(pain.map((c) => c.slug)).not.toContain('small-appliances')
    const tom = matchCategoriesForQuery('tom', categories).map((c) => c.slug)
    expect(tom).toEqual(expect.arrayContaining(['vegetables', 'tomato-products']))
  })

  it('returns leaves only, never departments', () => {
    const dairy = matchCategoriesForQuery('dairy', categories)
    expect(dairy.map((c) => c.slug)).toContain('dairy')
    expect(dairy.map((c) => c.slug)).not.toContain('dept-dairy-eggs-cheese')
  })

  it('product search widens only on an exact or whole-phrase category match', () => {
    expect(productQueryCategoryIds('خبز', categories)).toEqual([bySlug('bakery-bread').id])
    expect(productQueryCategoryIds('tom', categories)).toEqual([])
    expect(productQueryCategoryIds('', categories)).toEqual([])
  })
})

describe('categorySuggestions', () => {
  it('names the suggested leaves and their department', () => {
    const result = categorySuggestions('Tomato paste 400g', categories)
    expect(result.autoCategoryId).toBe(bySlug('tomato-products').id)
    expect(result.suggestions[0]).toMatchObject({
      categoryId: bySlug('tomato-products').id,
      name: bySlug('tomato-products').name,
      name_ar: bySlug('tomato-products').name_ar,
      departmentName: categories.find((c) => c.id === bySlug('tomato-products').parent_category_id)
        .name,
      score: expect.any(Number),
    })
    expect(result.suggestions.length).toBeLessThanOrEqual(3)
  })

  it('no name, no suggestion', () => {
    expect(categorySuggestions('  ', categories)).toEqual({ suggestions: [], autoCategoryId: null })
  })
})
