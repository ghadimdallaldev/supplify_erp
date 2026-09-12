import { describe, it, expect, vi } from 'vitest'
import { calculateRecipeCost } from './recipe-cost-engine.service.js'

function mockQuery(rowsBySql) {
  return vi.fn(async (sql, params) => {
    const text = String(sql)
    if (text.includes('FROM product p')) {
      return {
        rows: [
          {
            id: params[0],
            name: 'Chicken breast',
            sku: 'CHK-1',
            unit: 'kg',
            is_active: true,
            supplier_id: 'sup-1',
            supplier_name: 'Farm Co',
          },
        ],
      }
    }
    if (text.includes('recipe_unit_conversions')) {
      return { rows: [] }
    }
    if (text.includes('invoice_line_item')) {
      return {
        rows: [
          {
            unit_price: 12,
            unit: 'kg',
            currency: 'USD',
            invoice_id: 'inv-1',
            invoice_date: new Date(),
          },
        ],
      }
    }
    return { rows: rowsBySql?.(text, params) || [] }
  })
}

describe('recipe-cost-engine.service', () => {
  it('calculates cost per portion with waste adjustment', async () => {
    const dbQuery = mockQuery()
    const recipe = {
      portion_count: 4,
      selling_price: 20,
      target_food_cost_pct: 30,
    }
    const ingredients = [
      {
        id: 'ing-1',
        ingredient_type: 'SUPPLIER_PRODUCT',
        product_id: 'prod-1',
        supplier_id: 'sup-1',
        display_name: 'Chicken breast',
        quantity: 0.5,
        recipe_unit: 'kg',
        purchase_unit: 'kg',
        waste_pct: 10,
        yield_pct: 100,
        cost_source: 'INVOICE',
      },
    ]

    const calc = await calculateRecipeCost(recipe, ingredients, { restaurantId: 'rest-1' }, dbQuery)

    expect(calc.costPerPortion).not.toBeNull()
    expect(calc.costPerPortion).toBeGreaterThan(0)
    expect(calc.foodCostPct).not.toBeNull()
    expect(calc.calcStatus).toBe('HEALTHY')
  })

  it('marks missing price as MISSING_DATA', async () => {
    const dbQuery = vi.fn(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM product p')) return { rows: [] }
      if (text.includes('invoice_line_item')) return { rows: [] }
      if (text.includes('receiving_line_item')) return { rows: [] }
      if (text.includes('recipe_unit_conversions')) return { rows: [] }
      if (text.includes('SELECT supplier_id')) return { rows: [] }
      return { rows: [] }
    })

    const calc = await calculateRecipeCost(
      { portion_count: 1, selling_price: 10, target_food_cost_pct: 30 },
      [
        {
          id: 'ing-1',
          ingredient_type: 'MANUAL',
          display_name: 'Spice mix',
          quantity: 1,
          recipe_unit: 'g',
          purchase_unit: 'g',
          waste_pct: 0,
          yield_pct: 100,
          cost_source: 'MANUAL',
          manual_unit_price: null,
        },
      ],
      { restaurantId: 'rest-1' },
      dbQuery
    )

    expect(calc.calcStatus).toBe('MISSING_DATA')
    expect(calc.warnings).toContain('MISSING_PRICE')
  })
})
