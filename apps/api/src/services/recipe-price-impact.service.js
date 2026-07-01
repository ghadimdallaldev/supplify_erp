import { query } from '../lib/db.js'
import { pctChange, moneySub, moneyDiv, moneyToNumber, DISPLAY_MONEY_SCALE } from '../lib/money.js'
import { calculateRecipeCost, persistRecipeCalculation } from './recipe-cost-engine.service.js'
import { markRecipeRecalcDirty } from './recipe-recalc-queue.service.js'

/**
 * Find recipe IDs using a product.
 * @param {string} restaurantId
 * @param {string} productId
 * @param {Function} [dbQuery]
 */
export async function findRecipesUsingProduct(restaurantId, productId, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    SELECT DISTINCT r.id
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE r.restaurant_id = $1 AND ri.product_id = $2 AND r.is_active = true
    `,
    [restaurantId, productId]
  )
  return rows.map((r) => r.id)
}

/**
 * Record supplier price change and compute impacts.
 * @param {{
 *   restaurantId: string,
 *   productId: string,
 *   supplierId?: string | null,
 *   productName?: string,
 *   oldPrice?: number | null,
 *   newPrice: number,
 *   source: string,
 * }} event
 * @param {Function} [dbQuery]
 */
export async function recordSupplierPriceEvent(event, dbQuery = query) {
  const {
    restaurantId,
    productId,
    supplierId = null,
    productName = null,
    oldPrice = null,
    newPrice,
    source,
  } = event

  const changePct = oldPrice != null ? moneyToNumber(pctChange(oldPrice, newPrice) ?? 0, 4) : null

  const { rows: eventRows } = await dbQuery(
    `
    INSERT INTO supplier_price_events (
      restaurant_id, product_id, supplier_id, product_name,
      old_price, new_price, change_pct, source
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [restaurantId, productId, supplierId, productName, oldPrice, newPrice, changePct, source]
  )
  const priceEvent = eventRows[0]
  const recipeIds = await findRecipesUsingProduct(restaurantId, productId, dbQuery)

  for (const recipeId of recipeIds) {
    await computeRecipePriceImpact(
      {
        priceEventId: priceEvent.id,
        recipeId,
        restaurantId,
        targetFoodCostContext: true,
      },
      dbQuery
    )
  }

  await dbQuery(`UPDATE recipes SET last_price_impact_at = now() WHERE id = ANY($1::uuid[])`, [
    recipeIds,
  ])

  return { priceEvent, affectedRecipeIds: recipeIds }
}

/**
 * Compute and store impact for one recipe against a price event.
 */
export async function computeRecipePriceImpact(
  { priceEventId, recipeId, restaurantId },
  dbQuery = query
) {
  const { rows: recipes } = await dbQuery(
    `SELECT * FROM recipes WHERE id = $1 AND restaurant_id = $2`,
    [recipeId, restaurantId]
  )
  if (!recipes.length) return null
  const recipe = recipes[0]

  const oldCostPerPortion = recipe.cost_per_portion != null ? Number(recipe.cost_per_portion) : null
  const oldFoodCostPct = recipe.food_cost_pct != null ? Number(recipe.food_cost_pct) : null
  const targetFc = recipe.target_food_cost_pct != null ? Number(recipe.target_food_cost_pct) : null

  const { rows: ingredients } = await dbQuery(
    `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order, created_at`,
    [recipeId]
  )

  const calc = await calculateRecipeCost(recipe, ingredients, { restaurantId }, dbQuery)
  await persistRecipeCalculation(recipeId, recipe, calc, { triggeredBy: 'price_impact' }, dbQuery)

  const newCostPerPortion = calc.costPerPortion
  const newFoodCostPct = calc.foodCostPct
  const costDiff =
    oldCostPerPortion != null && newCostPerPortion != null
      ? moneyToNumber(moneySub(newCostPerPortion, oldCostPerPortion), DISPLAY_MONEY_SCALE)
      : null
  const costDiffPct =
    oldCostPerPortion != null && newCostPerPortion != null && oldCostPerPortion > 0
      ? moneyToNumber(
          moneyDiv(moneySub(newCostPerPortion, oldCostPerPortion), oldCostPerPortion).times(100),
          4
        )
      : null

  const sellingPrice = recipe.selling_price != null ? Number(recipe.selling_price) : null
  let marginImpact = null
  if (
    sellingPrice != null &&
    sellingPrice > 0 &&
    oldCostPerPortion != null &&
    newCostPerPortion != null
  ) {
    const oldMargin = ((sellingPrice - oldCostPerPortion) / sellingPrice) * 100
    const newMargin = ((sellingPrice - newCostPerPortion) / sellingPrice) * 100
    marginImpact = moneyToNumber(newMargin - oldMargin, 4)
  }

  let status = calc.calcStatus
  if (
    status === 'HEALTHY' &&
    targetFc != null &&
    newFoodCostPct != null &&
    newFoodCostPct > targetFc
  ) {
    status = 'WARNING'
  }

  const { rows: impacts } = await dbQuery(
    `
    INSERT INTO recipe_price_impacts (
      price_event_id, recipe_id,
      old_cost_per_portion, new_cost_per_portion,
      cost_diff_amount, cost_diff_pct,
      old_food_cost_pct, new_food_cost_pct,
      target_food_cost_pct, margin_impact,
      suggested_selling_price, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (price_event_id, recipe_id)
    DO UPDATE SET
      new_cost_per_portion = EXCLUDED.new_cost_per_portion,
      cost_diff_amount = EXCLUDED.cost_diff_amount,
      cost_diff_pct = EXCLUDED.cost_diff_pct,
      new_food_cost_pct = EXCLUDED.new_food_cost_pct,
      margin_impact = EXCLUDED.margin_impact,
      suggested_selling_price = EXCLUDED.suggested_selling_price,
      status = EXCLUDED.status
    RETURNING *
    `,
    [
      priceEventId,
      recipeId,
      oldCostPerPortion,
      newCostPerPortion,
      costDiff,
      costDiffPct,
      oldFoodCostPct,
      newFoodCostPct,
      targetFc,
      marginImpact,
      calc.suggestedSellingPrice,
      status,
    ]
  )

  if (costDiffPct != null && costDiffPct > 0) {
    await dbQuery(
      `
      INSERT INTO recipe_alerts (recipe_id, alert_type, severity, message, metadata)
      VALUES ($1, 'PRICE_INCREASE', 'warning', $2, $3::jsonb)
      `,
      [
        recipeId,
        `Recipe cost increased by ${costDiffPct.toFixed(1)}% due to supplier price change`,
        JSON.stringify({ priceEventId, costDiffPct }),
      ]
    )
  }

  return impacts[0]
}

/**
 * Notify restaurants linked to a supplier product when catalog/contract price changes.
 * @param {string} productId
 * @param {number} newPrice
 * @param {string} source
 * @param {Function} [dbQuery]
 */
export async function propagateCatalogPriceChange(productId, newPrice, source, dbQuery = query) {
  const { rows: products } = await dbQuery(
    `SELECT id, name, supplier_id FROM product WHERE id = $1`,
    [productId]
  )
  if (!products.length) return
  const product = products[0]

  const { rows: restaurants } = await dbQuery(
    `
    SELECT DISTINCT r.restaurant_id
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE ri.product_id = $1 AND r.is_active = true
    `,
    [productId]
  )

  for (const { restaurant_id: restaurantId } of restaurants) {
    const cached = await dbQuery(
      `
      SELECT unit_price FROM restaurant_ingredient_costs
      WHERE restaurant_id = $1 AND product_id = $2
      ORDER BY effective_at DESC LIMIT 1
      `,
      [restaurantId, productId]
    )
    const oldPrice = cached.rows[0]?.unit_price != null ? Number(cached.rows[0].unit_price) : null
    if (oldPrice != null && Math.abs(oldPrice - newPrice) < 0.0001) continue

    await recordSupplierPriceEvent(
      {
        restaurantId,
        productId,
        supplierId: product.supplier_id,
        productName: product.name,
        oldPrice,
        newPrice,
        source,
      },
      dbQuery
    )
    await markRecipeRecalcDirty(
      restaurantId,
      { productId, reason: `${source}_price_change` },
      dbQuery
    )
  }
}
