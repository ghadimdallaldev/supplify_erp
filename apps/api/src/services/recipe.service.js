import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import {
  calculateRecipeCost,
  persistRecipeCalculation,
  formatCostBreakdown,
} from './recipe-cost-engine.service.js'
import { recalculateRecipe } from './recipe-recalc-queue.service.js'

const INGREDIENT_TYPES = new Set(['SUPPLIER_PRODUCT', 'INVENTORY_ITEM', 'MANUAL'])
const COST_SOURCES = new Set(['AUTO', 'INVOICE', 'LAST_RECEIVED', 'CONTRACT', 'CATALOG', 'MANUAL'])

/**
 * @param {object} row
 * @param {object} [opts]
 */
export function mapRecipeRow(row, opts = {}) {
  const { includeCosts = true, branches = [], lastImpact = null } = opts
  const base = {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    internalCode: row.internal_code,
    category: row.category,
    sellingPrice: row.selling_price != null ? Number(row.selling_price) : null,
    currency: row.currency || 'USD',
    targetFoodCostPct: row.target_food_cost_pct != null ? Number(row.target_food_cost_pct) : null,
    portionCount: Number(row.portion_count),
    portionSize: row.portion_size != null ? Number(row.portion_size) : null,
    yieldUnit: row.yield_unit,
    notes: row.notes,
    instructions: row.instructions,
    imageFileKey: row.image_file_key,
    isActive: row.is_active,
    calcStatus: row.calc_status,
    lastCalculatedAt: row.last_calculated_at,
    lastPriceImpactAt: row.last_price_impact_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branches,
    lastPriceImpact: lastImpact,
  }
  if (!includeCosts) {
    return base
  }
  return {
    ...base,
    costPerPortion: row.cost_per_portion != null ? Number(row.cost_per_portion) : null,
    foodCostPct: row.food_cost_pct != null ? Number(row.food_cost_pct) : null,
    grossProfit: row.gross_profit != null ? Number(row.gross_profit) : null,
    grossMarginPct: row.gross_margin_pct != null ? Number(row.gross_margin_pct) : null,
    suggestedSellingPrice:
      row.suggested_selling_price != null ? Number(row.suggested_selling_price) : null,
  }
}

function mapIngredientRow(row) {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    sortOrder: row.sort_order,
    ingredientType: row.ingredient_type,
    productId: row.product_id,
    supplierId: row.supplier_id,
    displayName: row.display_name,
    quantity: Number(row.quantity),
    recipeUnit: row.recipe_unit,
    purchaseUnit: row.purchase_unit,
    conversionFactor: row.conversion_factor != null ? Number(row.conversion_factor) : null,
    wastePct: Number(row.waste_pct),
    yieldPct: Number(row.yield_pct),
    costSource: row.cost_source,
    manualUnitPrice: row.manual_unit_price != null ? Number(row.manual_unit_price) : null,
    notes: row.notes,
  }
}

async function loadRecipeBranches(recipeId, dbQuery = query) {
  const { rows } = await dbQuery(`SELECT branch_id FROM recipe_branches WHERE recipe_id = $1`, [
    recipeId,
  ])
  return rows.map((r) => r.branch_id)
}

async function loadLastImpact(recipeId, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    SELECT rpi.*, spe.detected_at, spe.change_pct, spe.source
    FROM recipe_price_impacts rpi
    JOIN supplier_price_events spe ON spe.id = rpi.price_event_id
    WHERE rpi.recipe_id = $1
    ORDER BY rpi.created_at DESC
    LIMIT 1
    `,
    [recipeId]
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    changePct: r.change_pct != null ? Number(r.change_pct) : null,
    costDiffPct: r.cost_diff_pct != null ? Number(r.cost_diff_pct) : null,
    detectedAt: r.detected_at,
    source: r.source,
  }
}

function validateIngredientInput(ing, index) {
  if (!INGREDIENT_TYPES.has(ing.ingredientType)) {
    throw new ValidationError(`Invalid ingredient type at row ${index + 1}`)
  }
  if (!ing.displayName?.trim()) {
    throw new ValidationError(`Ingredient name required at row ${index + 1}`)
  }
  if (ing.costSource && !COST_SOURCES.has(ing.costSource)) {
    throw new ValidationError(`Invalid cost source at row ${index + 1}`)
  }
}

/**
 * @param {string} restaurantId
 * @param {object} filters
 * @param {{ includeCosts?: boolean, limit?: number, offset?: number }} [opts]
 */
export async function listRecipes(restaurantId, filters = {}, opts = {}, dbQuery = query) {
  const { includeCosts = true, limit = 50, offset = 0 } = opts
  const params = [restaurantId]
  let sql = `
    SELECT r.*
    FROM recipes r
    WHERE r.restaurant_id = $1
  `

  if (filters.search) {
    params.push(`%${filters.search}%`)
    sql += ` AND (r.name ILIKE $${params.length} OR r.internal_code ILIKE $${params.length})`
  }
  if (filters.category) {
    params.push(filters.category)
    sql += ` AND r.category = $${params.length}`
  }
  if (filters.active === 'true') sql += ` AND r.is_active = true`
  if (filters.active === 'false') sql += ` AND r.is_active = false`
  if (filters.missingCost === 'true') sql += ` AND r.calc_status = 'MISSING_DATA'`
  if (filters.aboveTarget === 'true') sql += ` AND r.calc_status = 'WARNING'`
  if (filters.recentlyImpacted === 'true') {
    sql += ` AND r.last_price_impact_at IS NOT NULL AND r.last_price_impact_at > now() - INTERVAL '30 days'`
  }
  if (filters.branchId) {
    params.push(filters.branchId)
    sql += ` AND (
      NOT EXISTS (SELECT 1 FROM recipe_branches rb WHERE rb.recipe_id = r.id)
      OR EXISTS (SELECT 1 FROM recipe_branches rb WHERE rb.recipe_id = r.id AND rb.branch_id = $${params.length})
    )`
  }
  if (filters.productId) {
    params.push(filters.productId)
    sql += ` AND EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      WHERE ri.recipe_id = r.id AND ri.product_id = $${params.length}
    )`
  }

  const countSql = `SELECT COUNT(*)::int AS total FROM (${sql}) sub`
  const { rows: countRows } = await dbQuery(countSql, params)
  const total = countRows[0]?.total ?? 0

  params.push(limit, offset)
  sql += ` ORDER BY r.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await dbQuery(sql, params)
  const recipes = []
  for (const row of rows) {
    const branches = await loadRecipeBranches(row.id, dbQuery)
    const lastImpact = await loadLastImpact(row.id, dbQuery)
    recipes.push(mapRecipeRow(row, { includeCosts, branches, lastImpact }))
  }

  return { recipes, total, limit, offset }
}

export async function getRecipeById(
  restaurantId,
  recipeId,
  { includeCosts = true, includeIngredients = true } = {},
  dbQuery = query
) {
  const { rows } = await dbQuery(`SELECT * FROM recipes WHERE id = $1 AND restaurant_id = $2`, [
    recipeId,
    restaurantId,
  ])
  if (!rows.length) throw new NotFoundError('Recipe not found')
  const branches = await loadRecipeBranches(recipeId, dbQuery)
  const lastImpact = await loadLastImpact(recipeId, dbQuery)
  const recipe = mapRecipeRow(rows[0], { includeCosts, branches, lastImpact })

  if (includeIngredients) {
    const { rows: ingRows } = await dbQuery(
      `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order, created_at`,
      [recipeId]
    )
    recipe.ingredients = ingRows.map(mapIngredientRow)
  }

  const { rows: alerts } = await dbQuery(
    `
    SELECT * FROM recipe_alerts
    WHERE recipe_id = $1 AND resolved_at IS NULL
    ORDER BY created_at DESC
    `,
    [recipeId]
  )
  recipe.alerts = alerts.map((a) => ({
    id: a.id,
    alertType: a.alert_type,
    severity: a.severity,
    message: a.message,
    metadata: a.metadata,
    createdAt: a.created_at,
  }))

  return recipe
}

async function insertIngredients(client, recipeId, ingredients) {
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    validateIngredientInput(ing, i)
    await client.query(
      `
      INSERT INTO recipe_ingredients (
        recipe_id, sort_order, ingredient_type, product_id, supplier_id,
        display_name, quantity, recipe_unit, purchase_unit, conversion_factor,
        waste_pct, yield_pct, cost_source, manual_unit_price, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      [
        recipeId,
        ing.sortOrder ?? i,
        ing.ingredientType || 'SUPPLIER_PRODUCT',
        ing.productId || null,
        ing.supplierId || null,
        ing.displayName.trim(),
        ing.quantity ?? 0,
        ing.recipeUnit || 'unit',
        ing.purchaseUnit || null,
        ing.conversionFactor ?? null,
        ing.wastePct ?? 0,
        ing.yieldPct ?? 100,
        ing.costSource || 'AUTO',
        ing.manualUnitPrice ?? null,
        ing.notes || null,
      ]
    )
  }
}

async function syncBranches(client, recipeId, branchIds = []) {
  await client.query(`DELETE FROM recipe_branches WHERE recipe_id = $1`, [recipeId])
  for (const branchId of branchIds) {
    if (!branchId) continue
    await client.query(
      `INSERT INTO recipe_branches (recipe_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [recipeId, branchId]
    )
  }
}

export async function createRecipe(restaurantId, input, userId = null) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
      INSERT INTO recipes (
        restaurant_id, name, internal_code, category, selling_price, currency,
        target_food_cost_pct, portion_count, portion_size, yield_unit,
        notes, instructions, image_file_key, is_active, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
      RETURNING *
      `,
      [
        restaurantId,
        input.name.trim(),
        input.internalCode || null,
        input.category || null,
        input.sellingPrice ?? null,
        input.currency || 'USD',
        input.targetFoodCostPct ?? null,
        input.portionCount ?? 1,
        input.portionSize ?? null,
        input.yieldUnit || null,
        input.notes || null,
        input.instructions || null,
        input.imageFileKey || null,
        input.isActive !== false,
        userId,
      ]
    )
    const recipe = rows[0]
    await syncBranches(client, recipe.id, input.branchIds || [])
    if (input.ingredients?.length) {
      await insertIngredients(client, recipe.id, input.ingredients)
    }

    const { rows: ingredients } = await client.query(
      `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order`,
      [recipe.id]
    )
    const calc = await calculateRecipeCost(
      recipe,
      ingredients,
      { restaurantId },
      client.query.bind(client)
    )
    await persistRecipeCalculation(
      recipe.id,
      recipe,
      calc,
      { triggeredBy: 'create', userId },
      client.query.bind(client)
    )

    return getRecipeById(restaurantId, recipe.id, { includeCosts: true }, client.query.bind(client))
  })
}

export async function updateRecipe(restaurantId, recipeId, input, userId = null) {
  return withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id FROM recipes WHERE id = $1 AND restaurant_id = $2`,
      [recipeId, restaurantId]
    )
    if (!existing.length) throw new NotFoundError('Recipe not found')

    const fields = []
    const params = [recipeId, restaurantId]
    const setField = (col, val) => {
      if (val === undefined) return
      params.push(val)
      fields.push(`${col} = $${params.length}`)
    }

    setField('name', input.name?.trim())
    setField('internal_code', input.internalCode)
    setField('category', input.category)
    setField('selling_price', input.sellingPrice)
    setField('currency', input.currency)
    setField('target_food_cost_pct', input.targetFoodCostPct)
    setField('portion_count', input.portionCount)
    setField('portion_size', input.portionSize)
    setField('yield_unit', input.yieldUnit)
    setField('notes', input.notes)
    setField('instructions', input.instructions)
    setField('image_file_key', input.imageFileKey)
    setField('is_active', input.isActive)
    if (userId) setField('updated_by', userId)

    if (fields.length) {
      fields.push('updated_at = now()')
      await client.query(
        `UPDATE recipes SET ${fields.join(', ')} WHERE id = $1 AND restaurant_id = $2`,
        params
      )
    }

    if (input.branchIds !== undefined) {
      await syncBranches(client, recipeId, input.branchIds)
    }

    if (input.ingredients !== undefined) {
      await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipeId])
      if (input.ingredients.length) {
        await insertIngredients(client, recipeId, input.ingredients)
      }
    }

    await recalculateRecipe(
      recipeId,
      restaurantId,
      { triggeredBy: 'update', userId },
      client.query.bind(client)
    )
    return getRecipeById(restaurantId, recipeId, { includeCosts: true }, client.query.bind(client))
  })
}

export async function deactivateRecipe(restaurantId, recipeId, userId = null, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    UPDATE recipes SET is_active = false, updated_by = COALESCE($3, updated_by), updated_at = now()
    WHERE id = $1 AND restaurant_id = $2
    RETURNING id
    `,
    [recipeId, restaurantId, userId]
  )
  if (!rows.length) throw new NotFoundError('Recipe not found')
  return { id: recipeId, isActive: false }
}

export async function duplicateRecipe(restaurantId, recipeId, userId = null, dbQuery = query) {
  const source = await getRecipeById(
    restaurantId,
    recipeId,
    { includeCosts: false, includeIngredients: true },
    dbQuery
  )
  return createRecipe(
    restaurantId,
    {
      name: `${source.name} (Copy)`,
      internalCode: source.internalCode,
      category: source.category,
      sellingPrice: source.sellingPrice,
      currency: source.currency,
      targetFoodCostPct: source.targetFoodCostPct,
      portionCount: source.portionCount,
      portionSize: source.portionSize,
      yieldUnit: source.yieldUnit,
      notes: source.notes,
      instructions: source.instructions,
      imageFileKey: source.imageFileKey,
      branchIds: source.branches,
      ingredients: (source.ingredients || []).map((ing) => ({
        ingredientType: ing.ingredientType,
        productId: ing.productId,
        supplierId: ing.supplierId,
        displayName: ing.displayName,
        quantity: ing.quantity,
        recipeUnit: ing.recipeUnit,
        purchaseUnit: ing.purchaseUnit,
        conversionFactor: ing.conversionFactor,
        wastePct: ing.wastePct,
        yieldPct: ing.yieldPct,
        costSource: ing.costSource,
        manualUnitPrice: ing.manualUnitPrice,
        notes: ing.notes,
        sortOrder: ing.sortOrder,
      })),
    },
    userId
  )
}

export async function getRecipeCostBreakdown(restaurantId, recipeId, dbQuery = query) {
  await getRecipeById(restaurantId, recipeId, { includeCosts: true }, dbQuery)
  const { rows: recipes } = await dbQuery(`SELECT * FROM recipes WHERE id = $1`, [recipeId])
  const { rows: ingredients } = await dbQuery(
    `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order`,
    [recipeId]
  )
  const calc = await calculateRecipeCost(recipes[0], ingredients, { restaurantId }, dbQuery)
  return formatCostBreakdown(calc)
}

export async function getRecipeCostingDashboard(restaurantId, dbQuery = query) {
  const { rows: stats } = await dbQuery(
    `
    SELECT
      COUNT(*) FILTER (WHERE is_active = true)::int AS active_recipes,
      COUNT(*) FILTER (WHERE is_active = true AND calc_status = 'WARNING')::int AS above_target,
      COUNT(*) FILTER (WHERE is_active = true AND calc_status = 'MISSING_DATA')::int AS missing_cost,
      COUNT(*) FILTER (
        WHERE is_active = true AND last_price_impact_at > now() - INTERVAL '30 days'
      )::int AS recently_impacted,
      AVG(food_cost_pct) FILTER (WHERE is_active = true AND food_cost_pct IS NOT NULL) AS avg_food_cost_pct
    FROM recipes
    WHERE restaurant_id = $1
    `,
    [restaurantId]
  )

  const { rows: highestCost } = await dbQuery(
    `
    SELECT id, name, cost_per_portion, food_cost_pct, calc_status
    FROM recipes
    WHERE restaurant_id = $1 AND is_active = true AND cost_per_portion IS NOT NULL
    ORDER BY cost_per_portion DESC
    LIMIT 5
    `,
    [restaurantId]
  )

  const { rows: lowestMargin } = await dbQuery(
    `
    SELECT id, name, gross_margin_pct, food_cost_pct, selling_price, cost_per_portion
    FROM recipes
    WHERE restaurant_id = $1 AND is_active = true AND gross_margin_pct IS NOT NULL
    ORDER BY gross_margin_pct ASC
    LIMIT 5
    `,
    [restaurantId]
  )

  const { rows: recentEvents } = await dbQuery(
    `
    SELECT spe.*, COUNT(rpi.id)::int AS affected_recipe_count
    FROM supplier_price_events spe
    LEFT JOIN recipe_price_impacts rpi ON rpi.price_event_id = spe.id
    WHERE spe.restaurant_id = $1
    GROUP BY spe.id
    ORDER BY spe.detected_at DESC
    LIMIT 10
    `,
    [restaurantId]
  )

  const { rows: mostImpacted } = await dbQuery(
    `
    SELECT r.id, r.name, rpi.cost_diff_pct, rpi.new_food_cost_pct, spe.detected_at
    FROM recipe_price_impacts rpi
    JOIN recipes r ON r.id = rpi.recipe_id
    JOIN supplier_price_events spe ON spe.id = rpi.price_event_id
    WHERE r.restaurant_id = $1 AND spe.detected_at > now() - INTERVAL '30 days'
    ORDER BY ABS(COALESCE(rpi.cost_diff_pct, 0)) DESC
    LIMIT 10
    `,
    [restaurantId]
  )

  return {
    stats: {
      activeRecipes: stats[0]?.active_recipes ?? 0,
      aboveTargetFoodCost: stats[0]?.above_target ?? 0,
      missingCostData: stats[0]?.missing_cost ?? 0,
      recentlyImpacted: stats[0]?.recently_impacted ?? 0,
      averageFoodCostPct:
        stats[0]?.avg_food_cost_pct != null ? Number(stats[0].avg_food_cost_pct) : null,
    },
    highestCostRecipes: highestCost.map((r) => ({
      id: r.id,
      name: r.name,
      costPerPortion: Number(r.cost_per_portion),
      foodCostPct: r.food_cost_pct != null ? Number(r.food_cost_pct) : null,
      calcStatus: r.calc_status,
    })),
    lowestMarginRecipes: lowestMargin.map((r) => ({
      id: r.id,
      name: r.name,
      grossMarginPct: Number(r.gross_margin_pct),
      foodCostPct: r.food_cost_pct != null ? Number(r.food_cost_pct) : null,
      sellingPrice: r.selling_price != null ? Number(r.selling_price) : null,
      costPerPortion: r.cost_per_portion != null ? Number(r.cost_per_portion) : null,
    })),
    recentPriceChanges: recentEvents.map((e) => ({
      id: e.id,
      productId: e.product_id,
      productName: e.product_name,
      oldPrice: e.old_price != null ? Number(e.old_price) : null,
      newPrice: Number(e.new_price),
      changePct: e.change_pct != null ? Number(e.change_pct) : null,
      source: e.source,
      detectedAt: e.detected_at,
      affectedRecipeCount: e.affected_recipe_count,
    })),
    mostImpactedRecipes: mostImpacted.map((r) => ({
      id: r.id,
      name: r.name,
      costDiffPct: r.cost_diff_pct != null ? Number(r.cost_diff_pct) : null,
      newFoodCostPct: r.new_food_cost_pct != null ? Number(r.new_food_cost_pct) : null,
      detectedAt: r.detected_at,
    })),
    salesDataConnected: false,
  }
}

export async function listRecipeAlerts(
  restaurantId,
  { limit = 50, offset = 0 } = {},
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `
    SELECT ra.*, r.name AS recipe_name
    FROM recipe_alerts ra
    JOIN recipes r ON r.id = ra.recipe_id
    WHERE r.restaurant_id = $1 AND ra.resolved_at IS NULL
    ORDER BY ra.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [restaurantId, limit, offset]
  )
  return rows.map((a) => ({
    id: a.id,
    recipeId: a.recipe_id,
    recipeName: a.recipe_name,
    alertType: a.alert_type,
    severity: a.severity,
    message: a.message,
    metadata: a.metadata,
    createdAt: a.created_at,
  }))
}

export async function listPriceImpacts(
  restaurantId,
  { limit = 20, offset = 0 } = {},
  dbQuery = query
) {
  const { rows: events } = await dbQuery(
    `
    SELECT * FROM supplier_price_events
    WHERE restaurant_id = $1
    ORDER BY detected_at DESC
    LIMIT $2 OFFSET $3
    `,
    [restaurantId, limit, offset]
  )

  const result = []
  for (const event of events) {
    const { rows: impacts } = await dbQuery(
      `
      SELECT rpi.*, r.name AS recipe_name
      FROM recipe_price_impacts rpi
      JOIN recipes r ON r.id = rpi.recipe_id
      WHERE rpi.price_event_id = $1
      ORDER BY r.name
      `,
      [event.id]
    )
    result.push({
      event: {
        id: event.id,
        productId: event.product_id,
        productName: event.product_name,
        supplierId: event.supplier_id,
        oldPrice: event.old_price != null ? Number(event.old_price) : null,
        newPrice: Number(event.new_price),
        changePct: event.change_pct != null ? Number(event.change_pct) : null,
        source: event.source,
        detectedAt: event.detected_at,
      },
      impactedRecipes: impacts.map((i) => ({
        recipeId: i.recipe_id,
        recipeName: i.recipe_name,
        oldCostPerPortion: i.old_cost_per_portion != null ? Number(i.old_cost_per_portion) : null,
        newCostPerPortion: i.new_cost_per_portion != null ? Number(i.new_cost_per_portion) : null,
        costDiffAmount: i.cost_diff_amount != null ? Number(i.cost_diff_amount) : null,
        costDiffPct: i.cost_diff_pct != null ? Number(i.cost_diff_pct) : null,
        oldFoodCostPct: i.old_food_cost_pct != null ? Number(i.old_food_cost_pct) : null,
        newFoodCostPct: i.new_food_cost_pct != null ? Number(i.new_food_cost_pct) : null,
        targetFoodCostPct: i.target_food_cost_pct != null ? Number(i.target_food_cost_pct) : null,
        marginImpact: i.margin_impact != null ? Number(i.margin_impact) : null,
        suggestedSellingPrice:
          i.suggested_selling_price != null ? Number(i.suggested_selling_price) : null,
        status: i.status,
      })),
    })
  }

  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM supplier_price_events WHERE restaurant_id = $1`,
    [restaurantId]
  )

  return { impacts: result, total: countRows[0]?.total ?? 0, limit, offset }
}

export async function getIngredientImpact(restaurantId, productId, dbQuery = query) {
  const { rows: recipes } = await dbQuery(
    `
    SELECT DISTINCT r.id, r.name, r.cost_per_portion, r.food_cost_pct, r.calc_status, r.target_food_cost_pct
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE r.restaurant_id = $1 AND ri.product_id = $2 AND r.is_active = true
    ORDER BY r.name
    `,
    [restaurantId, productId]
  )
  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    costPerPortion: r.cost_per_portion != null ? Number(r.cost_per_portion) : null,
    foodCostPct: r.food_cost_pct != null ? Number(r.food_cost_pct) : null,
    targetFoodCostPct: r.target_food_cost_pct != null ? Number(r.target_food_cost_pct) : null,
    calcStatus: r.calc_status,
  }))
}

export async function recipesToCsvRows(restaurantId, filters, dbQuery = query) {
  const { recipes } = await listRecipes(
    restaurantId,
    filters,
    { includeCosts: true, limit: 10000, offset: 0 },
    dbQuery
  )
  return recipes
}
