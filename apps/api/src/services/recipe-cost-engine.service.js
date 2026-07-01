import {
  moneyMul,
  moneyDiv,
  moneyAdd,
  moneySub,
  pctOf,
  applyPct,
  moneyToNumber,
  moneyToString,
  DISPLAY_MONEY_SCALE,
  PCT_SCALE,
} from '../lib/money.js'
import { resolveConversionFactor } from './recipe-unit-conversion.service.js'
import {
  resolveIngredientCost,
  getCachedIngredientCost,
} from './ingredient-cost-resolver.service.js'
import { query } from '../lib/db.js'

/**
 * @typedef {object} IngredientCalcResult
 * @property {string} ingredientId
 * @property {string} displayName
 * @property {number | null} unitCost
 * @property {string | null} unit
 * @property {string | null} costSource
 * @property {number | null} totalCost
 * @property {string[]} warnings
 * @property {object | null} product
 */

/**
 * Calculate cost for a single ingredient row.
 * @param {object} ingredient
 * @param {{ restaurantId: string, branchId?: string | null }} context
 * @param {Function} [dbQuery]
 * @returns {Promise<IngredientCalcResult>}
 */
export async function calculateIngredientCost(ingredient, context, dbQuery = query) {
  const warnings = []
  const { restaurantId, branchId = null } = context

  let unitCost = null
  let unit = ingredient.purchase_unit || ingredient.recipe_unit || 'unit'
  let costSource = null
  let productMeta = null

  if (ingredient.ingredient_type === 'MANUAL') {
    if (ingredient.manual_unit_price != null) {
      unitCost = Number(ingredient.manual_unit_price)
      costSource = 'MANUAL'
    } else {
      warnings.push('MISSING_PRICE')
    }
  } else if (ingredient.product_id) {
    const { rows: products } = await dbQuery(
      `
      SELECT p.id, p.name, p.sku, p.unit, p.is_active, p.supplier_id, s.name AS supplier_name
      FROM product p
      LEFT JOIN supplier s ON s.id = p.supplier_id
      WHERE p.id = $1
      `,
      [ingredient.product_id]
    )
    if (!products.length) {
      warnings.push('INACTIVE_PRODUCT')
    } else {
      productMeta = products[0]
      if (productMeta.is_active === false) {
        warnings.push('INACTIVE_PRODUCT')
      }
      unit = ingredient.purchase_unit || productMeta.unit || ingredient.recipe_unit || 'unit'

      let resolved = await resolveIngredientCost(
        {
          restaurantId,
          productId: ingredient.product_id,
          supplierId: ingredient.supplier_id || productMeta.supplier_id,
          branchId,
          preferredSource: ingredient.cost_source || 'AUTO',
          manualUnitPrice: ingredient.manual_unit_price,
        },
        dbQuery
      )
      if (!resolved) {
        const cached = await getCachedIngredientCost(
          restaurantId,
          ingredient.product_id,
          ingredient.supplier_id || productMeta.supplier_id,
          branchId,
          dbQuery
        )
        resolved = cached
      }
      if (resolved) {
        unitCost = resolved.unitPrice
        costSource = resolved.costSource
        unit = resolved.unit || unit
      } else {
        warnings.push('MISSING_PRICE')
      }
    }
  } else {
    warnings.push('MISSING_PRICE')
  }

  const purchaseUnit = ingredient.purchase_unit || unit
  const recipeUnit = ingredient.recipe_unit || purchaseUnit
  const conversion = await resolveConversionFactor(
    {
      restaurantId,
      fromUnit: recipeUnit,
      toUnit: purchaseUnit,
      manualFactor: ingredient.conversion_factor,
    },
    dbQuery
  )
  if (conversion.missing) {
    warnings.push('MISSING_CONVERSION')
  }

  let totalCost = null
  if (unitCost != null && !conversion.missing && conversion.factor != null) {
    const qty = Number(ingredient.quantity) || 0
    const wastePct = Number(ingredient.waste_pct) || 0
    const yieldPct = Number(ingredient.yield_pct) || 100

    let convertedQty = moneyMul(qty, conversion.factor)
    if (wastePct > 0 && wastePct < 100) {
      convertedQty = moneyDiv(convertedQty, 1 - wastePct / 100)
    }
    if (yieldPct > 0 && yieldPct !== 100) {
      convertedQty = moneyDiv(convertedQty, yieldPct / 100)
    }
    totalCost = moneyToNumber(moneyMul(convertedQty, unitCost))
  } else if (unitCost == null) {
    warnings.push('MISSING_PRICE')
  }

  return {
    ingredientId: ingredient.id,
    displayName: ingredient.display_name,
    ingredientType: ingredient.ingredient_type,
    productId: ingredient.product_id,
    supplierId: ingredient.supplier_id,
    quantity: Number(ingredient.quantity),
    recipeUnit,
    purchaseUnit,
    conversionFactor: conversion.factor,
    wastePct: Number(ingredient.waste_pct) || 0,
    yieldPct: Number(ingredient.yield_pct) || 100,
    unitCost,
    unit,
    costSource,
    totalCost,
    warnings,
    product: productMeta
      ? {
          id: productMeta.id,
          name: productMeta.name,
          sku: productMeta.sku,
          supplierName: productMeta.supplier_name,
          isActive: productMeta.is_active,
        }
      : null,
  }
}

/**
 * Calculate full recipe costing.
 * @param {object} recipe
 * @param {object[]} ingredients
 * @param {{ restaurantId: string, branchId?: string | null }} context
 * @param {Function} [dbQuery]
 */
export async function calculateRecipeCost(recipe, ingredients, context, dbQuery = query) {
  const warnings = []
  const ingredientResults = []

  for (const ing of ingredients) {
    const result = await calculateIngredientCost(ing, context, dbQuery)
    ingredientResults.push(result)
    for (const w of result.warnings) {
      if (!warnings.includes(w)) warnings.push(w)
    }
  }

  const portionCount = Number(recipe.portion_count) || 0
  const sellingPrice = recipe.selling_price != null ? Number(recipe.selling_price) : null
  const targetFc = recipe.target_food_cost_pct != null ? Number(recipe.target_food_cost_pct) : null

  if (portionCount <= 0) warnings.push('ZERO_PORTIONS')
  if (sellingPrice == null || sellingPrice <= 0) warnings.push('MISSING_SELLING_PRICE')

  const hasMissingIngredientCost = ingredientResults.some(
    (r) => r.totalCost == null || r.warnings.includes('MISSING_PRICE')
  )
  if (hasMissingIngredientCost) warnings.push('MISSING_PRICE')

  const hasMissingConversion = ingredientResults.some((r) =>
    r.warnings.includes('MISSING_CONVERSION')
  )
  if (hasMissingConversion) warnings.push('MISSING_CONVERSION')

  let totalRecipeCost = null
  if (!hasMissingIngredientCost && !hasMissingConversion) {
    totalRecipeCost = ingredientResults.reduce(
      (sum, r) => moneyAdd(sum, r.totalCost ?? 0),
      moneyToNumber(0)
    )
    totalRecipeCost = moneyToNumber(totalRecipeCost)
  }

  let costPerPortion = null
  let foodCostPct = null
  let grossProfit = null
  let grossMarginPct = null
  let suggestedSellingPrice = null

  if (totalRecipeCost != null && portionCount > 0) {
    costPerPortion = moneyToNumber(moneyDiv(totalRecipeCost, portionCount))
    if (sellingPrice != null && sellingPrice > 0) {
      foodCostPct = moneyToNumber(pctOf(costPerPortion, sellingPrice), PCT_SCALE)
      grossProfit = moneyToNumber(moneySub(sellingPrice, costPerPortion), DISPLAY_MONEY_SCALE)
      grossMarginPct = moneyToNumber(pctOf(grossProfit, sellingPrice), PCT_SCALE)
    }
    if (targetFc != null && targetFc > 0) {
      suggestedSellingPrice = moneyToNumber(applyPct(costPerPortion, targetFc), DISPLAY_MONEY_SCALE)
    }
  }

  let calcStatus = 'HEALTHY'
  if (
    warnings.some((w) =>
      ['MISSING_PRICE', 'MISSING_CONVERSION', 'ZERO_PORTIONS', 'MISSING_SELLING_PRICE'].includes(w)
    )
  ) {
    calcStatus = 'MISSING_DATA'
  } else if (targetFc != null && foodCostPct != null && foodCostPct > targetFc) {
    calcStatus = 'WARNING'
    warnings.push('ABOVE_TARGET_FC')
  }

  return {
    totalRecipeCost,
    costPerPortion,
    foodCostPct,
    grossProfit,
    grossMarginPct,
    suggestedSellingPrice,
    calcStatus,
    warnings,
    ingredients: ingredientResults,
  }
}

/**
 * Persist calculated totals on recipe and snapshot.
 */
export async function persistRecipeCalculation(
  recipeId,
  recipe,
  calc,
  { triggeredBy = 'recalculate', userId = null },
  dbQuery = query
) {
  await dbQuery(
    `
    UPDATE recipes SET
      cost_per_portion = $2,
      food_cost_pct = $3,
      gross_profit = $4,
      gross_margin_pct = $5,
      suggested_selling_price = $6,
      calc_status = $7,
      last_calculated_at = now(),
      updated_by = COALESCE($8, updated_by),
      updated_at = now()
    WHERE id = $1
    `,
    [
      recipeId,
      calc.costPerPortion,
      calc.foodCostPct,
      calc.grossProfit,
      calc.grossMarginPct,
      calc.suggestedSellingPrice,
      calc.calcStatus,
      userId,
    ]
  )

  await dbQuery(
    `
    INSERT INTO recipe_cost_snapshots (recipe_id, triggered_by, totals, ingredients, warnings)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
    `,
    [
      recipeId,
      triggeredBy,
      JSON.stringify({
        totalRecipeCost: calc.totalRecipeCost,
        costPerPortion: calc.costPerPortion,
        foodCostPct: calc.foodCostPct,
        grossProfit: calc.grossProfit,
        grossMarginPct: calc.grossMarginPct,
        suggestedSellingPrice: calc.suggestedSellingPrice,
        calcStatus: calc.calcStatus,
        sellingPrice: recipe.selling_price != null ? Number(recipe.selling_price) : null,
        targetFoodCostPct:
          recipe.target_food_cost_pct != null ? Number(recipe.target_food_cost_pct) : null,
      }),
      JSON.stringify(calc.ingredients),
      JSON.stringify(calc.warnings),
    ]
  )

  await syncRecipeAlerts(recipeId, calc, dbQuery)
  return calc
}

/**
 * Replace active alerts for a recipe based on calculation warnings.
 */
export async function syncRecipeAlerts(recipeId, calc, dbQuery = query) {
  await dbQuery(
    `UPDATE recipe_alerts SET resolved_at = now() WHERE recipe_id = $1 AND resolved_at IS NULL`,
    [recipeId]
  )

  const alertMap = {
    ABOVE_TARGET_FC: { severity: 'warning', message: 'Food cost is above target' },
    MISSING_PRICE: { severity: 'error', message: 'Missing ingredient price' },
    MISSING_CONVERSION: { severity: 'error', message: 'Missing unit conversion' },
    MISSING_SELLING_PRICE: { severity: 'warning', message: 'Selling price is missing or zero' },
    INACTIVE_PRODUCT: { severity: 'warning', message: 'Ingredient product is inactive or deleted' },
    ZERO_PORTIONS: { severity: 'error', message: 'Portion count must be greater than zero' },
  }

  for (const code of calc.warnings) {
    const meta = alertMap[code]
    if (!meta) continue
    await dbQuery(
      `
      INSERT INTO recipe_alerts (recipe_id, alert_type, severity, message, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [recipeId, code, meta.severity, meta.message, JSON.stringify({})]
    )
  }
}

export function formatCostBreakdown(calc) {
  return {
    totalRecipeCost: calc.totalRecipeCost,
    costPerPortion: calc.costPerPortion,
    foodCostPct: calc.foodCostPct,
    grossProfit: calc.grossProfit,
    grossMarginPct: calc.grossMarginPct,
    suggestedSellingPrice: calc.suggestedSellingPrice,
    calcStatus: calc.calcStatus,
    warnings: calc.warnings,
    ingredients: calc.ingredients.map((ing) => ({
      ...ing,
      unitCost: ing.unitCost != null ? moneyToString(ing.unitCost) : null,
      totalCost: ing.totalCost != null ? moneyToString(ing.totalCost) : null,
    })),
  }
}
