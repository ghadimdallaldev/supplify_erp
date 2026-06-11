import { query } from '../lib/db.js'
import { formatYmd } from '../lib/reservation-board-date.js'
import {
  getDefaultTenantTimezone,
  getRestaurantTimezone,
  getZonedDayOfWeek,
} from '../lib/tenant-timezone.js'

export const MIN_ORDERS_FOR_CADENCE = 4
export const LOOKBACK_DAYS = 180
export const REPLACEMENT_GRACE_DAYS = 1

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Recompute cadence patterns for a restaurant (or all restaurants when restaurantId null).
 */
export async function recomputeCadencePatterns({ restaurantId = null } = {}) {
  const defaultTz = getDefaultTenantTimezone()
  const params = [LOOKBACK_DAYS, MIN_ORDERS_FOR_CADENCE, defaultTz]
  let restaurantFilter = ''
  if (restaurantId) {
    restaurantFilter = 'AND o.restaurant_id = $4'
    params.push(restaurantId)
  }

  // Deactivate stale patterns before re-insert
  const deactivateSql = restaurantId
    ? `UPDATE restaurant_order_cadence SET is_active = false, updated_at = now() WHERE restaurant_id = $1`
    : `UPDATE restaurant_order_cadence SET is_active = false, updated_at = now()`
  await query(deactivateSql, restaurantId ? [restaurantId] : [])

  const { rows: productPatterns } = await query(
    `
    WITH order_lines AS (
      SELECT
        o.restaurant_id,
        oi.supplier_id,
        oi.product_id,
        p.category_id,
        EXTRACT(DOW FROM (
          COALESCE(o.placed_at, o.created_at) AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $3)
        ))::int AS dow,
        COUNT(DISTINCT o.id)::int AS order_count
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      JOIN order_item oi ON oi.order_id = o.id
      JOIN product p ON p.id = oi.product_id
      WHERE o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($1::int || ' days')::interval
        ${restaurantFilter}
      GROUP BY o.restaurant_id, oi.supplier_id, oi.product_id, p.category_id, dow
      HAVING COUNT(DISTINCT o.id) >= $2
    )
    SELECT
      ol.restaurant_id,
      ol.supplier_id,
      ol.product_id,
      ol.category_id,
      ol.dow AS day_of_week,
      ol.order_count,
      p.name AS product_name,
      s.name AS supplier_name
    FROM order_lines ol
    JOIN product p ON p.id = ol.product_id
    JOIN supplier s ON s.id = ol.supplier_id
    ORDER BY ol.order_count DESC
    `,
    params
  )

  let inserted = 0
  for (const row of productPatterns) {
    const label = `${row.product_name} from ${row.supplier_name}`
    await query(
      `
      INSERT INTO restaurant_order_cadence (
        restaurant_id, supplier_id, product_id, category_id,
        cadence_level, day_of_week, label, confidence_score, min_orders_met
      ) VALUES ($1,$2,$3,$4,'product',$5,$6,$7,$8)
      ON CONFLICT DO NOTHING
      `,
      [
        row.restaurant_id,
        row.supplier_id,
        row.product_id,
        row.category_id,
        row.day_of_week,
        label,
        Math.min(100, row.order_count * 10),
        row.order_count,
      ]
    ).catch(async () => {
      // upsert via deactivate + insert if unique index conflict on partial
      await query(
        `
        UPDATE restaurant_order_cadence SET
          is_active = true, confidence_score = $7, min_orders_met = $8, updated_at = now(), last_detected_at = now()
        WHERE restaurant_id = $1 AND supplier_id = $2 AND product_id = $3 AND day_of_week = $5
          AND cadence_level = 'product'
        `,
        [
          row.restaurant_id,
          row.supplier_id,
          row.product_id,
          row.category_id,
          row.day_of_week,
          label,
          Math.min(100, row.order_count * 10),
          row.order_count,
        ]
      )
    })
    inserted += 1
  }

  // Category-level fallback for restaurants with sparse product data
  const { rows: categoryPatterns } = await query(
    `
    WITH order_lines AS (
      SELECT
        o.restaurant_id,
        oi.supplier_id,
        p.category_id,
        EXTRACT(DOW FROM (
          COALESCE(o.placed_at, o.created_at) AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $3)
        ))::int AS dow,
        COUNT(DISTINCT o.id)::int AS order_count
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      JOIN order_item oi ON oi.order_id = o.id
      JOIN product p ON p.id = oi.product_id
      WHERE o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($1::int || ' days')::interval
        AND p.category_id IS NOT NULL
        ${restaurantFilter}
      GROUP BY o.restaurant_id, oi.supplier_id, p.category_id, dow
      HAVING COUNT(DISTINCT o.id) >= $2
    ),
    covered AS (
      SELECT DISTINCT restaurant_id, supplier_id, product_id, day_of_week
      FROM restaurant_order_cadence
      WHERE cadence_level = 'product' AND is_active = true
    )
    SELECT ol.*, pc.name AS category_name, s.name AS supplier_name
    FROM order_lines ol
    JOIN product_category pc ON pc.id = ol.category_id
    JOIN supplier s ON s.id = ol.supplier_id
    WHERE NOT EXISTS (
      SELECT 1 FROM covered c
      JOIN product p ON p.id = c.product_id AND p.category_id = ol.category_id
      WHERE c.restaurant_id = ol.restaurant_id AND c.supplier_id = ol.supplier_id
        AND c.day_of_week = ol.dow
    )
    `,
    params
  )

  for (const row of categoryPatterns) {
    const label = `${row.category_name} from ${row.supplier_name}`
    await query(
      `
      INSERT INTO restaurant_order_cadence (
        restaurant_id, supplier_id, category_id, cadence_level, day_of_week, label, confidence_score, min_orders_met
      ) VALUES ($1,$2,$3,'category',$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
      `,
      [
        row.restaurant_id,
        row.supplier_id,
        row.category_id,
        row.dow,
        label,
        Math.min(100, row.order_count * 8),
        row.order_count,
      ]
    )
    inserted += 1
  }

  return { patternsProcessed: inserted }
}

export async function getMissedCadencesForToday({ now = new Date() } = {}) {
  const defaultTz = getDefaultTenantTimezone()

  const { rows } = await query(
    `
    SELECT
      c.*,
      r.name AS restaurant_name,
      s.name AS supplier_name,
      ((now() AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $2)))::date AS reminder_date
    FROM restaurant_order_cadence c
    JOIN restaurant r ON r.id = c.restaurant_id
    JOIN supplier s ON s.id = c.supplier_id
    WHERE c.is_active = true
      AND c.day_of_week = EXTRACT(DOW FROM (now() AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $2)))::int
      AND NOT EXISTS (
        SELECT 1 FROM reorder_cadence_reminder_log l
        WHERE l.cadence_id = c.id
          AND l.reminder_date = ((now() AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $2)))::date
      )
      AND NOT EXISTS (
        SELECT 1 FROM customer_order o
        JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = c.supplier_id
        LEFT JOIN product p ON p.id = oi.product_id
        WHERE o.restaurant_id = c.restaurant_id
          AND o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
          AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($1::int || ' days')::interval
          AND (
            (c.cadence_level = 'product' AND oi.product_id = c.product_id)
            OR (c.cadence_level = 'category' AND p.category_id = c.category_id)
          )
      )
    `,
    [REPLACEMENT_GRACE_DAYS, defaultTz]
  )

  return rows.map((cadence) => ({
    ...cadence,
    dayName: DAY_NAMES[cadence.day_of_week],
    reminderDate:
      typeof cadence.reminder_date === 'string'
        ? cadence.reminder_date.slice(0, 10)
        : formatYmd(cadence.reminder_date),
  }))
}

export async function listRestaurantReminders(restaurantId) {
  const tz = await getRestaurantTimezone(restaurantId)
  const dow = getZonedDayOfWeek(new Date(), tz)
  const { rows } = await query(
    `
    SELECT c.*, s.name AS supplier_name
    FROM restaurant_order_cadence c
    JOIN supplier s ON s.id = c.supplier_id
    WHERE c.restaurant_id = $1 AND c.is_active = true AND c.day_of_week = $2
    ORDER BY c.confidence_score DESC
    LIMIT 20
    `,
    [restaurantId, dow]
  )
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    cadenceLevel: r.cadence_level,
    dayOfWeek: r.day_of_week,
    dayName: DAY_NAMES[r.day_of_week],
    confidenceScore: parseFloat(r.confidence_score),
  }))
}

export async function listSupplierAtRisk(supplierId) {
  const missed = await getMissedCadencesForToday()
  return missed
    .filter((m) => m.supplier_id === supplierId)
    .map((m) => ({
      cadenceId: m.id,
      restaurantId: m.restaurant_id,
      restaurantName: m.restaurant_name,
      label: m.label,
      dayName: m.dayName,
    }))
}

export async function runCadenceReminderCheck({ notify = true } = {}) {
  const missed = await getMissedCadencesForToday()
  if (!notify) return { missedCount: missed.length, notificationsSent: 0 }

  const { notifyTenantUsers } = await import('./notification.service.js')
  const { isFeatureEnabled } = await import('../lib/subscription.js')
  let notificationsSent = 0

  for (const cadence of missed) {
    const restaurantSmartReorder = await isFeatureEnabled(
      cadence.restaurant_id,
      'RESTAURANT',
      'smart_reorder'
    )
    const supplierSmartReorder = await isFeatureEnabled(
      cadence.supplier_id,
      'SUPPLIER',
      'smart_reorder'
    )
    if (!restaurantSmartReorder && !supplierSmartReorder) continue

    const claim = await query(
      `
      INSERT INTO reorder_cadence_reminder_log (cadence_id, reminder_date, restaurant_notified, supplier_notified)
      VALUES ($1, $2, false, false)
      ON CONFLICT (cadence_id, reminder_date) DO NOTHING
      RETURNING id
      `,
      [cadence.id, cadence.reminderDate]
    )
    if (claim.rows.length === 0) continue

    const dayName = DAY_NAMES[cadence.day_of_week]
    const restaurantMsg = `You usually order ${cadence.label} on ${dayName}s. No order was placed today.`
    const supplierMsg = `${cadence.restaurant_name} usually orders ${cadence.label} every ${dayName} but has not ordered yet.`

    let restaurantNotified = false
    let supplierNotified = false

    if (restaurantSmartReorder) {
      await notifyTenantUsers({
        tenantId: cadence.restaurant_id,
        tenantType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'reorder_cadence_missed',
        title: 'Suggested reorder reminder',
        message: restaurantMsg,
        referenceType: 'QUICK_LIST',
        metadata: { link: '/app/quick-lists', cadenceId: cadence.id },
      })
      restaurantNotified = true
    }

    if (supplierSmartReorder) {
      await notifyTenantUsers({
        tenantId: cadence.supplier_id,
        tenantType: 'SUPPLIER',
        notificationType: 'ORDER',
        notificationCategory: 'reorder_cadence_missed',
        title: 'Expected order not placed',
        message: supplierMsg,
        referenceType: 'ORDER',
        metadata: { link: '/app/supplier/command-center', cadenceId: cadence.id },
      })
      supplierNotified = true
    }

    await query(
      `
      UPDATE reorder_cadence_reminder_log
      SET restaurant_notified = $3, supplier_notified = $4
      WHERE cadence_id = $1 AND reminder_date = $2
      `,
      [cadence.id, cadence.reminderDate, restaurantNotified, supplierNotified]
    )
    notificationsSent += 1
  }

  return { missedCount: missed.length, notificationsSent }
}
