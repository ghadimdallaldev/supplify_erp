import { describe, expect, it, vi } from 'vitest'

import {
  listFoodCostWarnings,
  listWeakMarginMenuItems,
} from './restaurant-margin-intelligence.service.js'

const coverageRow = { active_recipes: 12, without_target: 4, missing_cost_data: 2 }

function dbFor(warningRows, coverage = coverageRow) {
  return vi.fn(async (sql) => {
    if (String(sql).includes('COUNT(*) FILTER')) return { rows: [coverage] }
    return { rows: warningRows }
  })
}

describe('listFoodCostWarnings', () => {
  const overRow = {
    id: 'r1',
    name: 'Beef burger',
    cost_per_portion: '4.2000',
    food_cost_pct: '38.5000',
    target_food_cost_pct: '30.000',
    gross_margin_pct: '61.5000',
    selling_price: '11.00',
    suggested_selling_price: '14.00',
    calc_status: 'WARNING',
    last_cost_diff_pct: '12.5000',
    last_old_food_cost_pct: '33.0000',
    last_new_food_cost_pct: '38.5000',
    last_change_at: '2026-09-18T00:00:00Z',
    last_changed_ingredient: 'Beef mince',
  }

  it('reports the overage against the recipe own target', async () => {
    const dbQuery = dbFor([overRow])
    const result = await listFoodCostWarnings('r1', {}, dbQuery)

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].overagePct).toBeCloseTo(8.5, 5)
    expect(result.warnings[0].foodCostPct).toBe(38.5)
    expect(result.warnings[0].targetFoodCostPct).toBe(30)
  })

  it('attributes the breach to the most recent ingredient price change', async () => {
    const dbQuery = dbFor([overRow])
    const { warnings } = await listFoodCostWarnings('r1', {}, dbQuery)

    expect(warnings[0].lastIngredientChange).toEqual({
      ingredientName: 'Beef mince',
      costDiffPct: 12.5,
      oldFoodCostPct: 33,
      newFoodCostPct: 38.5,
      detectedAt: '2026-09-18T00:00:00Z',
    })
  })

  it('leaves attribution null when no price event touched the recipe', async () => {
    const dbQuery = dbFor([{ ...overRow, last_change_at: null, last_changed_ingredient: null }])
    const { warnings } = await listFoodCostWarnings('r1', {}, dbQuery)
    expect(warnings[0].lastIngredientChange).toBeNull()
  })

  it('never invents a benchmark for recipes without a target', async () => {
    const dbQuery = dbFor([])
    await listFoodCostWarnings('r1', {}, dbQuery)

    const [sql] = dbQuery.mock.calls[0]
    expect(sql).toContain('r.target_food_cost_pct IS NOT NULL')
    expect(sql).toContain("r.calc_status <> 'MISSING_DATA'")
  })

  it('reports coverage so an empty list is not read as "all healthy"', async () => {
    const dbQuery = dbFor([])
    const result = await listFoodCostWarnings('r1', {}, dbQuery)

    expect(result.coverage).toEqual({
      activeRecipes: 12,
      withoutTarget: 4,
      missingCostData: 2,
    })
  })

  it('clamps limit and threshold from client input', async () => {
    const dbQuery = dbFor([])
    await listFoodCostWarnings('r1', { limit: 9999, minOveragePct: 500 }, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params[1]).toBe(100)
    expect(params[2]).toBe(100)
  })

  it('scopes to the calling restaurant', async () => {
    const dbQuery = dbFor([])
    await listFoodCostWarnings('r1', {}, dbQuery)
    expect(dbQuery.mock.calls[0][1][0]).toBe('r1')
    expect(dbQuery.mock.calls[1][1][0]).toBe('r1')
  })

  it('requires a tenant', async () => {
    const dbQuery = vi.fn()
    await expect(listFoodCostWarnings(null, {}, dbQuery)).rejects.toThrow(/required/)
    expect(dbQuery).not.toHaveBeenCalled()
  })
})

describe('listWeakMarginMenuItems', () => {
  const weakRow = {
    id: 'r2',
    name: 'House salad',
    category: 'Starters',
    cost_per_portion: '3.5000',
    selling_price: '7.00',
    food_cost_pct: '50.0000',
    gross_profit: '3.5000',
    gross_margin_pct: '50.0000',
    target_food_cost_pct: '30.000',
    suggested_selling_price: '11.67',
    calc_status: 'WARNING',
  }

  it('uses the engine persisted gross profit rather than recomputing', async () => {
    // Deliberately inconsistent with selling_price - cost_per_portion, to prove
    // the persisted value wins.
    const dbQuery = vi.fn(async () => ({ rows: [{ ...weakRow, gross_profit: '3.4900' }] }))
    const { items } = await listWeakMarginMenuItems('r1', {}, dbQuery)
    expect(items[0].grossProfitPerPortion).toBe(3.49)
  })

  it('excludes rows the engine could not cost', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listWeakMarginMenuItems('r1', {}, dbQuery)

    const [sql] = dbQuery.mock.calls[0]
    expect(sql).toContain("r.calc_status <> 'MISSING_DATA'")
    expect(sql).toContain('r.gross_margin_pct IS NOT NULL')
    expect(sql).toContain('r.selling_price > 0')
  })

  it('defaults the weak-margin display threshold to 60%', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    const result = await listWeakMarginMenuItems('r1', {}, dbQuery)

    expect(result.maxMarginPct).toBe(60)
    expect(dbQuery.mock.calls[0][1][1]).toBe(60)
  })

  it('clamps an out-of-range threshold instead of passing it through', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listWeakMarginMenuItems('r1', { maxMarginPct: -20 }, dbQuery)
    expect(dbQuery.mock.calls[0][1][1]).toBe(0)
  })

  it('maps the row onto the contract', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [weakRow] }))
    const { items } = await listWeakMarginMenuItems('r1', {}, dbQuery)

    expect(items[0]).toEqual({
      recipeId: 'r2',
      recipeName: 'House salad',
      category: 'Starters',
      costPerPortion: 3.5,
      sellingPrice: 7,
      grossProfitPerPortion: 3.5,
      foodCostPct: 50,
      grossMarginPct: 50,
      targetFoodCostPct: 30,
      suggestedSellingPrice: 11.67,
      calcStatus: 'WARNING',
    })
  })

  it('requires a tenant', async () => {
    const dbQuery = vi.fn()
    await expect(listWeakMarginMenuItems(null, {}, dbQuery)).rejects.toThrow(/required/)
    expect(dbQuery).not.toHaveBeenCalled()
  })
})
