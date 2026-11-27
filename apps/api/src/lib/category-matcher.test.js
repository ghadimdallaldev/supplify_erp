import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadSeedCategories } from '../test/category-seed.js'
import {
  classifyProduct,
  loadPlatformCategories,
  normalizeCategoryText,
  scoreCategory,
} from './category-matcher.js'

const fixtures = JSON.parse(
  readFileSync(new URL('./category-matcher.fixtures.json', import.meta.url), 'utf8')
)
const categories = loadSeedCategories()

function classify(name) {
  return classifyProduct(name, categories)
}

describe('normalizeCategoryText', () => {
  it('Arabic variants normalise (أ/إ/آ→ا, ة→ه, ى→ي)', () => {
    expect(normalizeCategoryText('أإآ').normalized).toBe('ااا')
    expect(normalizeCategoryText('لبنة').normalized).toBe('لبنه')
    expect(normalizeCategoryText('حلوى').normalized).toBe('حلوي')
    expect(normalizeCategoryText('خـبـز').normalized).toBe('خبز')
    expect(normalizeCategoryText('خُبْزٌ').normalized).toBe('خبز')
  })

  it('strips the Arabic article, units and numbers', () => {
    expect(normalizeCategoryText('اللبنة 2 كغ').tokens).toEqual(['لبنه'])
    expect(normalizeCategoryText('TOMATOES 5KG').tokens).toEqual(['tomato'])
    expect(normalizeCategoryText('Water 1.5L x6').tokens).toEqual(['water'])
    expect(normalizeCategoryText('12x500ml cola').tokens).toEqual(['cola'])
  })

  it('strips Latin accents, French articles and singularises', () => {
    expect(normalizeCategoryText('Crème Fraîche').normalized).toBe('creme fraiche')
    expect(normalizeCategoryText("Huile d'olive").tokens).toEqual(['huile', 'olive'])
    expect(normalizeCategoryText('les pommes de terre').tokens).toEqual(['pomme', 'terre'])
    expect(normalizeCategoryText('Œufs').tokens).toEqual(['oeuf'])
    expect(normalizeCategoryText('olives cheeses boxes berries glass').tokens).toEqual([
      'olive',
      'cheese',
      'box',
      'berry',
      'glass',
    ])
  })
})

describe('scoreCategory', () => {
  const dairy = { name: 'Dairy', aliases: ['fresh milk'] }
  it('scores exact, contained, all-tokens and prefix matches', () => {
    expect(scoreCategory(normalizeCategoryText('Fresh milk'), dairy).score).toBe(1)
    expect(scoreCategory(normalizeCategoryText('fresh milk 1L carton'), dairy).score).toBe(0.9)
    expect(scoreCategory(normalizeCategoryText('milk fresh'), dairy).score).toBe(0.8)
    expect(scoreCategory(normalizeCategoryText('fres'), dairy).score).toBe(0.6)
    expect(scoreCategory(normalizeCategoryText('bread'), dairy).score).toBe(0)
  })

  it('reports the matched phrase length', () => {
    expect(scoreCategory(normalizeCategoryText('fresh milk 1L'), dairy).matchedPhraseLength).toBe(2)
  })
})

describe('classifyProduct', () => {
  it('fixture: ≥ 90% auto-classified correctly, 0 auto-classified wrongly', () => {
    const wrong = []
    let correct = 0
    const expected = fixtures.filter((f) => f.slug)
    for (const { name, slug } of fixtures) {
      const { autoCategoryId } = classify(name)
      if (autoCategoryId && autoCategoryId !== slug)
        wrong.push(`${name} → ${autoCategoryId} (want ${slug})`)
      if (slug && autoCategoryId === slug) correct += 1
    }
    expect(wrong).toEqual([])
    expect(correct / expected.length).toBeGreaterThanOrEqual(0.9)
  })

  it('tomato paste beats tomato', () => {
    expect(classify('Tomato paste 400g').autoCategoryId).toBe('tomato-products')
    expect(classify('TOMATOES 5KG').autoCategoryId).toBe('vegetables')
  })

  it('ambiguous names suggest but do not auto-classify', () => {
    const result = classify('Olive tomato mix')
    expect(result.autoCategoryId).toBeNull()
    const ids = result.suggestions.map((s) => s.categoryId)
    expect(ids).toContain('pickles-olives')
    expect(ids).toContain('vegetables')
    expect(result.suggestions.length).toBeLessThanOrEqual(3)
    expect(result.suggestions.every((s) => s.score >= 0.6)).toBe(true)
  })

  it('departments never returned', () => {
    for (const name of ['bakery', 'frozen', 'beverages', 'seafood', 'other', 'packaging']) {
      const result = classify(name)
      const ids = [result.autoCategoryId, ...result.suggestions.map((s) => s.categoryId)]
      expect(ids.some((id) => id && id.startsWith('dept-'))).toBe(false)
    }
  })

  it("Arabic units and the article are stripped ('لبنة 2 كغ' → labneh leaf)", () => {
    expect(classify('لبنة 2 كغ').autoCategoryId).toBe('yogurt-labneh')
    expect(classify('اللبنة').autoCategoryId).toBe('yogurt-labneh')
  })

  it("French articles are stripped ('crème de la crème' does not break the cream match)", () => {
    expect(classify('crème de la crème').autoCategoryId).toBe('dairy')
  })

  it('suggestions are sorted, capped at 3 and need ≥ 0.6', () => {
    const { suggestions } = classify('frozen chicken wings')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score)
    }
    expect(classify('zzzz qqqq').suggestions).toEqual([])
  })

  it('empty input classifies nothing', () => {
    expect(classify('')).toEqual({ suggestions: [], autoCategoryId: null })
    expect(classify(null)).toEqual({ suggestions: [], autoCategoryId: null })
  })
})

describe('loadPlatformCategories', () => {
  it('reads active platform categories and caches them per catalog version', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [{ id: 'a', slug: 'a', name: 'A', aliases: [], parent_category_id: 'd' }],
      })),
    }
    const first = await loadPlatformCategories(db)
    const second = await loadPlatformCategories(db)
    expect(first).toEqual(second)
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.query.mock.calls[0][0]).toMatch(/supplier_id IS NULL/)
    expect(db.query.mock.calls[0][0]).toMatch(/is_active/)
  })
})
