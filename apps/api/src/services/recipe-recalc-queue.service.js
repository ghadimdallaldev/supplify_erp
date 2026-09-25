import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { calculateRecipeCost, persistRecipeCalculation } from './recipe-cost-engine.service.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

const NULL_UUID = '00000000-0000-0000-0000-000000000000'
const BATCH_LIMIT = 50
/** Failed scopes are retried this many times, then parked so they stop blocking the batch. */
const MAX_RECALC_ATTEMPTS = 5

/**
 * @param {string} restaurantId
 * @param {{ branchId?: string | null, productId?: string | null, recipeId?: string | null, reason?: string }} [opts]
 * @param {Function} [dbQuery]
 */
export async function markRecipeRecalcDirty(
  restaurantId,
  { branchId = null, productId = null, recipeId = null, reason = 'data_change' } = {},
  dbQuery = query
) {
  try {
    await dbQuery(
      `
      DELETE FROM recipe_recalc_dirty
      WHERE restaurant_id = $1
        AND COALESCE(product_id, $4::uuid) = COALESCE($2::uuid, $4::uuid)
        AND COALESCE(recipe_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      `,
      [restaurantId, productId, recipeId, NULL_UUID]
    )
    await dbQuery(
      `
      INSERT INTO recipe_recalc_dirty (restaurant_id, product_id, recipe_id, reason)
      VALUES ($1, $2, $3, $4)
      `,
      [restaurantId, productId, recipeId, reason]
    )
  } catch (error) {
    if (error.code === '42P01') return
    logger.warn({ event: 'recipe_recalc_dirty.failed', error: error.message, restaurantId })
  }
}

/**
 * Recalculate a single recipe by id.
 * @param {string} recipeId
 * @param {string} restaurantId
 * @param {{ triggeredBy?: string, userId?: string | null }} [opts]
 * @param {Function} [dbQuery]
 */
export async function recalculateRecipe(
  recipeId,
  restaurantId,
  { triggeredBy = 'manual', userId = null } = {},
  dbQuery = query
) {
  const { rows: recipes } = await dbQuery(
    `SELECT * FROM recipes WHERE id = $1 AND restaurant_id = $2`,
    [recipeId, restaurantId]
  )
  if (!recipes.length) return null
  const recipe = recipes[0]

  const { rows: ingredients } = await dbQuery(
    `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order, created_at`,
    [recipeId]
  )

  const calc = await calculateRecipeCost(recipe, ingredients, { restaurantId }, dbQuery)
  await persistRecipeCalculation(recipeId, recipe, calc, { triggeredBy, userId }, dbQuery)
  return calc
}

/**
 * Process dirty queue batch.
 * @param {Function} [dbQuery]
 * @returns {Promise<{ processed: number, errors: number, skippedLocked: number, parkedFailures: number }>}
 */
export async function processRecipeRecalcQueue(dbQuery = query) {
  const { rows: dirty } = await dbQuery(
    `
    SELECT d.*
    FROM recipe_recalc_dirty d
    WHERE d.failed_at IS NULL
      AND EXISTS (
      SELECT 1
      FROM subscription sub
      WHERE sub.tenant_id = d.restaurant_id
        AND sub.tenant_type = 'RESTAURANT'
        AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
        AND sub.account_locked_at IS NULL
    )
    ORDER BY d.created_at ASC
    LIMIT $1
    `,
    [BATCH_LIMIT]
  )

  let processed = 0
  let errors = 0
  let skippedLocked = 0
  let parkedFailures = 0

  for (const row of dirty) {
    try {
      const unlocked = await isTenantUnlockedForBackgroundWrites({
        tenantId: row.restaurant_id,
        tenantType: 'RESTAURANT',
      })
      if (!unlocked) {
        skippedLocked++
        continue
      }

      let recipeIds = []
      if (row.recipe_id) {
        recipeIds = [row.recipe_id]
      } else if (row.product_id) {
        const { rows } = await dbQuery(
          `
          SELECT DISTINCT r.id
          FROM recipes r
          JOIN recipe_ingredients ri ON ri.recipe_id = r.id
          WHERE r.restaurant_id = $1 AND ri.product_id = $2 AND r.is_active = true
          `,
          [row.restaurant_id, row.product_id]
        )
        recipeIds = rows.map((r) => r.id)
      } else {
        const { rows } = await dbQuery(
          `SELECT id FROM recipes WHERE restaurant_id = $1 AND is_active = true`,
          [row.restaurant_id]
        )
        recipeIds = rows.map((r) => r.id)
      }

      for (const recipeId of recipeIds) {
        await recalculateRecipe(recipeId, row.restaurant_id, { triggeredBy: row.reason }, dbQuery)
        processed += 1
      }

      await dbQuery(`DELETE FROM recipe_recalc_dirty WHERE id = $1`, [row.id])
    } catch (error) {
      errors += 1
      // Keep the work queued so a transient failure is retried, but spend a
      // retry budget: an unfixable scope would otherwise sit at the head of
      // `ORDER BY created_at ASC` forever and starve the rest of the batch.
      const { rows: parked } = await dbQuery(
        `UPDATE recipe_recalc_dirty
            SET attempts = attempts + 1,
                last_error = $2,
                last_attempt_at = now(),
                failed_at = CASE WHEN attempts + 1 >= $3 THEN now() ELSE NULL END
          WHERE id = $1
          RETURNING attempts, failed_at`,
        [row.id, String(error.message).slice(0, 500), MAX_RECALC_ATTEMPTS]
      )
      if (parked[0]?.failed_at) parkedFailures += 1
      logger.error({
        event: 'recipe_recalc.failed',
        dirtyId: row.id,
        attempts: parked[0]?.attempts ?? null,
        parked: Boolean(parked[0]?.failed_at),
        error: error.message,
      })
    }
  }

  return { processed, errors, skippedLocked, parkedFailures }
}
