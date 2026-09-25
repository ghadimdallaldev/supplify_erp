/**
 * Food-cost and menu-margin warnings for restaurants.
 *
 * Every figure is read back from the existing recipe cost engine
 * (recipe-cost-engine.service.js persists cost_per_portion, food_cost_pct,
 * gross_margin_pct and calc_status onto `recipes`) and from
 * `recipe_price_impacts`, which the price hooks already write. Nothing is
 * recalculated here and no benchmark is invented:
 *
 *   - A recipe is only "over target" when it has its own
 *     `target_food_cost_pct`. There is no platform-wide default food cost, so
 *     inventing one would manufacture a warning. Recipes without a target are
 *     counted separately as coverage, not reported as breaches.
 *   - Margin is only reported when the engine could compute it. Rows the
 *     engine marked MISSING_DATA (no selling price, unpriced ingredient,
 *     missing unit conversion) are excluded rather than shown as zero.
 *
 * Entitlement: advanced tier (see lib/intelligence-tier.js).
 * Authorization: RECIPES_VIEW_COSTS — narrower than CATALOG_VIEW, because
 * portion cost and margin are not visible to every purchasing role.
 */
import { query } from '../lib/db.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
/** Display threshold for "weak" margin; callers may override. Not a judgement the engine makes. */
const DEFAULT_WEAK_MARGIN_PCT = 60

function toNumber(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clampLimit(value) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

function clampPct(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

/**
 * Recipes whose computed food cost sits above their own target, worst first,
 * with the most recent ingredient price change that moved them.
 *
 * @param {string} restaurantId
 * @param {{ limit?: number, minOveragePct?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function listFoodCostWarnings(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const limit = clampLimit(opts.limit)
  // Default 0: any breach of the restaurant's own target is worth showing.
  const minOveragePct = clampPct(opts.minOveragePct, 0)

  const { rows } = await dbQuery(
    `
    SELECT
      r.id,
      r.name,
      r.cost_per_portion,
      r.food_cost_pct,
      r.target_food_cost_pct,
      r.gross_margin_pct,
      r.selling_price,
      r.suggested_selling_price,
      r.calc_status,
      impact.cost_diff_pct       AS last_cost_diff_pct,
      impact.old_food_cost_pct   AS last_old_food_cost_pct,
      impact.new_food_cost_pct   AS last_new_food_cost_pct,
      impact.detected_at         AS last_change_at,
      impact.product_name        AS last_changed_ingredient
    FROM recipes r
    LEFT JOIN LATERAL (
      SELECT rpi.cost_diff_pct, rpi.old_food_cost_pct, rpi.new_food_cost_pct,
             spe.detected_at, spe.product_name
      FROM recipe_price_impacts rpi
      JOIN supplier_price_events spe ON spe.id = rpi.price_event_id
      WHERE rpi.recipe_id = r.id
      ORDER BY spe.detected_at DESC
      LIMIT 1
    ) impact ON true
    WHERE r.restaurant_id = $1
      AND r.is_active = true
      AND r.calc_status <> 'MISSING_DATA'
      AND r.food_cost_pct IS NOT NULL
      AND r.target_food_cost_pct IS NOT NULL
      AND r.food_cost_pct - r.target_food_cost_pct >= $2
    ORDER BY (r.food_cost_pct - r.target_food_cost_pct) DESC
    LIMIT $3
    `,
    [restaurantId, minOveragePct, limit]
  )

  // Coverage: recipes that cannot be judged because they carry no target.
  const { rows: coverageRows } = await dbQuery(
    `
    SELECT
      COUNT(*) FILTER (WHERE target_food_cost_pct IS NULL)::int AS without_target,
      COUNT(*) FILTER (WHERE calc_status = 'MISSING_DATA')::int AS missing_cost_data,
      COUNT(*)::int AS active_recipes
    FROM recipes
    WHERE restaurant_id = $1 AND is_active = true
    `,
    [restaurantId]
  )

  return {
    minOveragePct,
    warnings: rows.map((row) => {
      const foodCostPct = toNumber(row.food_cost_pct)
      const targetFoodCostPct = toNumber(row.target_food_cost_pct)
      const overagePct =
        foodCostPct != null && targetFoodCostPct != null ? foodCostPct - targetFoodCostPct : null
      return {
        recipeId: row.id,
        recipeName: row.name,
        costPerPortion: toNumber(row.cost_per_portion),
        foodCostPct,
        targetFoodCostPct,
        overagePct,
        grossMarginPct: toNumber(row.gross_margin_pct),
        sellingPrice: toNumber(row.selling_price),
        suggestedSellingPrice: toNumber(row.suggested_selling_price),
        calcStatus: row.calc_status,
        // Null when no price event has touched this recipe; the breach is then
        // structural (recipe or target changed), not driven by a supplier move.
        lastIngredientChange: row.last_change_at
          ? {
              ingredientName: row.last_changed_ingredient,
              costDiffPct: toNumber(row.last_cost_diff_pct),
              oldFoodCostPct: toNumber(row.last_old_food_cost_pct),
              newFoodCostPct: toNumber(row.last_new_food_cost_pct),
              detectedAt: row.last_change_at,
            }
          : null,
      }
    }),
    coverage: {
      activeRecipes: coverageRows[0]?.active_recipes ?? 0,
      withoutTarget: coverageRows[0]?.without_target ?? 0,
      missingCostData: coverageRows[0]?.missing_cost_data ?? 0,
    },
  }
}

/**
 * Menu items whose computed gross margin is below the display threshold,
 * weakest first.
 *
 * @param {string} restaurantId
 * @param {{ limit?: number, maxMarginPct?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function listWeakMarginMenuItems(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const limit = clampLimit(opts.limit)
  const maxMarginPct = clampPct(opts.maxMarginPct, DEFAULT_WEAK_MARGIN_PCT)

  const { rows } = await dbQuery(
    `
    SELECT
      r.id, r.name, r.category,
      r.cost_per_portion, r.selling_price,
      r.food_cost_pct, r.gross_profit, r.gross_margin_pct,
      r.target_food_cost_pct, r.suggested_selling_price,
      r.calc_status
    FROM recipes r
    WHERE r.restaurant_id = $1
      AND r.is_active = true
      AND r.calc_status <> 'MISSING_DATA'
      AND r.gross_margin_pct IS NOT NULL
      AND r.selling_price IS NOT NULL
      AND r.selling_price > 0
      AND r.gross_margin_pct <= $2
    ORDER BY r.gross_margin_pct ASC
    LIMIT $3
    `,
    [restaurantId, maxMarginPct, limit]
  )

  return {
    maxMarginPct,
    items: rows.map((row) => {
      return {
        recipeId: row.id,
        recipeName: row.name,
        category: row.category ?? null,
        costPerPortion: toNumber(row.cost_per_portion),
        sellingPrice: toNumber(row.selling_price),
        // Persisted by the cost engine with its money helpers; recomputing it
        // here in float would disagree at the cent level.
        grossProfitPerPortion: toNumber(row.gross_profit),
        foodCostPct: toNumber(row.food_cost_pct),
        grossMarginPct: toNumber(row.gross_margin_pct),
        targetFoodCostPct: toNumber(row.target_food_cost_pct),
        suggestedSellingPrice: toNumber(row.suggested_selling_price),
        calcStatus: row.calc_status,
      }
    }),
  }
}
