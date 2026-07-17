import { query } from '../lib/db.js'
import { computeRestaurantForecasts } from './reorder-forecast.service.js'
import { isFeatureEnabledForTenant } from '../lib/feature-flags.js'
import { getEffectiveFeaturesForTenant } from '../lib/feature-flags.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

const STALE_HOURS = 24
const NULL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * @typedef {object} ForecastRow
 * @property {string} productId
 * @property {string | null} branchId
 * @property {string} modelTier
 * @property {string} modelVersion
 * @property {number | null} forecastDailyUsage
 * @property {number | null} forecastReorderQty
 * @property {string | null} reorderByDate
 * @property {number} confidence
 * @property {string} urgency
 * @property {string} explanation
 * @property {object} signals
 * @property {object | null} backtest
 */

export async function markReorderForecastDirty(
  restaurantId,
  { branchId = null, productId = null, reason = 'data_change' } = {}
) {
  try {
    await query(
      `
      DELETE FROM reorder_forecast_dirty
      WHERE restaurant_id = $1
        AND COALESCE(branch_id, $4::uuid) = COALESCE($2::uuid, $4::uuid)
        AND COALESCE(product_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      `,
      [restaurantId, branchId, productId, NULL_UUID]
    )
    await query(
      `
      INSERT INTO reorder_forecast_dirty (restaurant_id, branch_id, product_id, reason)
      VALUES ($1, $2, $3, $4)
      `,
      [restaurantId, branchId, productId, reason]
    )
  } catch (error) {
    if (error.code === '42P01') return
    throw error
  }

  // Short AI recommend cache must not outlive dirty forecasts
  try {
    const { invalidateReorderAiRecommendCache } = await import(
      './restaurant-reorder-assistance.service.js'
    )
    await invalidateReorderAiRecommendCache(restaurantId)
  } catch {
    // Best-effort — forecast dirty itself already succeeded
  }
}

async function upsertForecastRow(restaurantId, row) {
  await query(
    `
    DELETE FROM reorder_forecast
    WHERE restaurant_id = $1
      AND product_id = $2
      AND COALESCE(branch_id, $3::uuid) = COALESCE($4::uuid, $3::uuid)
    `,
    [restaurantId, row.productId, NULL_UUID, row.branchId]
  )

  await query(
    `
    INSERT INTO reorder_forecast (
      restaurant_id, branch_id, product_id, model_tier, model_version,
      forecast_daily_usage, forecast_reorder_qty, reorder_by_date,
      confidence, urgency, explanation, signals, backtest,
      computed_at, stale_after
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11, $12::jsonb, $13::jsonb,
      now(), now() + ($14::int || ' hours')::interval
    )
    `,
    [
      restaurantId,
      row.branchId,
      row.productId,
      row.modelTier,
      row.modelVersion,
      row.forecastDailyUsage,
      row.forecastReorderQty,
      row.reorderByDate,
      row.confidence,
      row.urgency,
      row.explanation,
      JSON.stringify(row.signals ?? {}),
      row.backtest ? JSON.stringify(row.backtest) : null,
      STALE_HOURS,
    ]
  )
}

/**
 * Persist computed forecasts and clear matching dirty markers.
 */
export async function saveRestaurantForecasts(restaurantId, forecasts) {
  for (const row of forecasts) {
    await upsertForecastRow(restaurantId, row)
    await query(
      `
      DELETE FROM reorder_forecast_dirty
      WHERE restaurant_id = $1
        AND COALESCE(branch_id, $4::uuid) = COALESCE($2::uuid, $4::uuid)
        AND COALESCE(product_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      `,
      [restaurantId, row.branchId, row.productId, NULL_UUID]
    )
  }
}

/**
 * @param {string} restaurantId
 * @param {{ featureValue?: unknown, branchId?: string | null, productIds?: string[], force?: boolean }} opts
 */
export async function refreshRestaurantForecasts(restaurantId, opts = {}) {
  if (
    !(await isTenantUnlockedForBackgroundWrites({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
    }))
  ) {
    return { refreshed: 0, skipped: 'tenant_locked' }
  }

  const enabled = opts.featureValue
    ? (await import('../lib/smart-reorder-tier.js')).resolveSmartReorderCapabilities(
        opts.featureValue
      ).capabilities.forecast
    : await isFeatureEnabledForTenant(restaurantId, 'RESTAURANT', 'smart_reorder')

  if (!enabled) {
    return { refreshed: 0, skipped: 'feature_disabled' }
  }

  let featureValue = opts.featureValue
  if (featureValue === undefined) {
    const eff = await getEffectiveFeaturesForTenant(restaurantId, 'RESTAURANT')
    featureValue = eff?.features?.smart_reorder
  }

  const { forecasts, skipped } = await computeRestaurantForecasts(restaurantId, {
    featureValue,
    branchId: opts.branchId,
    productIds: opts.productIds,
  })

  if (skipped) return { refreshed: 0, skipped }

  await saveRestaurantForecasts(restaurantId, forecasts)
  return { refreshed: forecasts.length, skipped: null }
}

/**
 * Read cached forecasts for a restaurant.
 * @param {string} restaurantId
 * @param {{ branchId?: string | null, productId?: string | null, includeStale?: boolean }} opts
 */
export async function getCachedForecasts(restaurantId, opts = {}) {
  try {
    const params = [restaurantId]
    let branchClause = ''
    let productClause = ''
    let staleClause = opts.includeStale ? '' : 'AND rf.stale_after > now()'

    if (opts.branchId) {
      params.push(opts.branchId)
      branchClause = `AND COALESCE(rf.branch_id, $${params.length}::uuid) = $${params.length}::uuid`
    }
    if (opts.productId) {
      params.push(opts.productId)
      productClause = `AND rf.product_id = $${params.length}`
    }

    const { rows } = await query(
      `
      SELECT
        rf.product_id,
        rf.branch_id,
        rf.model_tier,
        rf.model_version,
        rf.forecast_daily_usage,
        rf.forecast_reorder_qty,
        rf.reorder_by_date,
        rf.confidence,
        rf.urgency,
        rf.explanation,
        rf.signals,
        rf.backtest,
        rf.computed_at,
        rf.stale_after,
        p.name AS product_name,
        p.unit AS product_unit
      FROM reorder_forecast rf
      JOIN product p ON p.id = rf.product_id
      WHERE rf.restaurant_id = $1
        ${branchClause}
        ${productClause}
        ${staleClause}
      ORDER BY rf.confidence DESC, rf.urgency DESC
      `,
      params
    )

    return rows.map((r) => ({
      productId: r.product_id,
      branchId: r.branch_id,
      productName: r.product_name,
      productUnit: r.product_unit,
      modelTier: r.model_tier,
      modelVersion: r.model_version,
      forecastDailyUsage: r.forecast_daily_usage != null ? Number(r.forecast_daily_usage) : null,
      forecastReorderQty: r.forecast_reorder_qty != null ? Number(r.forecast_reorder_qty) : null,
      reorderByDate: r.reorder_by_date,
      confidence: Number(r.confidence),
      urgency: r.urgency,
      explanation: r.explanation,
      signals: r.signals,
      backtest: r.backtest,
      computedAt: r.computed_at,
      staleAfter: r.stale_after,
    }))
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

/**
 * Refresh stale or dirty forecasts for one restaurant.
 */
export async function refreshIfStale(restaurantId, featureValue) {
  const caps = (await import('../lib/smart-reorder-tier.js')).resolveSmartReorderCapabilities(
    featureValue
  )
  if (!caps.capabilities.forecast) return { refreshed: false }

  try {
    const { rows } = await query(
      `
      SELECT EXISTS (
        SELECT 1 FROM reorder_forecast_dirty WHERE restaurant_id = $1
      ) AS has_dirty,
      EXISTS (
        SELECT 1 FROM reorder_forecast
        WHERE restaurant_id = $1 AND stale_after <= now()
        LIMIT 1
      ) AS has_stale
      `,
      [restaurantId]
    )
    const { has_dirty, has_stale } = rows[0] || {}
    if (!has_dirty && !has_stale) {
      const { rows: any } = await query(
        `SELECT 1 FROM reorder_forecast WHERE restaurant_id = $1 LIMIT 1`,
        [restaurantId]
      )
      if (any.length > 0) return { refreshed: false }
    }

    const result = await refreshRestaurantForecasts(restaurantId, { featureValue })
    return { refreshed: result.refreshed > 0, count: result.refreshed }
  } catch (error) {
    if (error.code === '42P01') return { refreshed: false }
    throw error
  }
}

/**
 * Nightly: refresh restaurants with smart_reorder enabled.
 */
export async function refreshAllDirtyForecasts() {
  let restaurantIds = []
  try {
    const { rows: dirtyRows } = await query(
      `
      SELECT DISTINCT d.restaurant_id
      FROM reorder_forecast_dirty d
      WHERE EXISTS (
        SELECT 1
        FROM subscription sub
        WHERE sub.tenant_id = d.restaurant_id
          AND sub.tenant_type = 'RESTAURANT'
          AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
          AND sub.account_locked_at IS NULL
      )
      `
    )
    const { rows: staleRows } = await query(
      `
      SELECT DISTINCT rf.restaurant_id
      FROM reorder_forecast rf
      WHERE rf.stale_after <= now()
        AND EXISTS (
          SELECT 1
          FROM subscription sub
          WHERE sub.tenant_id = rf.restaurant_id
            AND sub.tenant_type = 'RESTAURANT'
            AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
            AND sub.account_locked_at IS NULL
        )
      `
    )
    restaurantIds = [
      ...new Set([
        ...dirtyRows.map((r) => r.restaurant_id),
        ...staleRows.map((r) => r.restaurant_id),
      ]),
    ]
  } catch (error) {
    if (error.code === '42P01') return { restaurants: 0, forecasts: 0 }
    throw error
  }

  let totalForecasts = 0
  for (const restaurantId of restaurantIds) {
    const enabled = await isFeatureEnabledForTenant(restaurantId, 'RESTAURANT', 'smart_reorder')
    if (!enabled) continue
    const result = await refreshRestaurantForecasts(restaurantId)
    totalForecasts += result.refreshed || 0
  }

  return { restaurants: restaurantIds.length, forecasts: totalForecasts }
}
