import { query } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { computeExpiryStatus, mapLotRow } from '../lib/inventory-expiry-status.js'
import { notifyTenantUsers } from './notification.service.js'

const DEFAULT_THRESHOLD = 7

export { computeExpiryStatus }

export async function getExpirySettings(restaurantId) {
  const { rows } = await query(
    `SELECT expiring_soon_days FROM restaurant_inventory_settings WHERE restaurant_id = $1`,
    [restaurantId]
  )
  return { expiringSoonDays: rows[0]?.expiring_soon_days ?? DEFAULT_THRESHOLD }
}

export async function updateExpirySettings(restaurantId, { expiringSoonDays }) {
  const days = expiringSoonDays ?? DEFAULT_THRESHOLD
  if (days < 1 || days > 90) {
    throw new ValidationError('expiringSoonDays must be between 1 and 90')
  }
  const { rows } = await query(
    `
    INSERT INTO restaurant_inventory_settings (restaurant_id, expiring_soon_days)
    VALUES ($1, $2)
    ON CONFLICT (restaurant_id) DO UPDATE SET
      expiring_soon_days = EXCLUDED.expiring_soon_days,
      updated_at = now()
    RETURNING expiring_soon_days
    `,
    [restaurantId, days]
  )
  return { expiringSoonDays: rows[0].expiring_soon_days }
}

function buildListFilters(restaurantId, filters, thresholdDays) {
  const params = [restaurantId]
  let paramIdx = 2
  const conditions = ['l.restaurant_id = $1', 'l.is_archived = false']

  if (filters.supplierId) {
    conditions.push(`l.supplier_id = $${paramIdx++}`)
    params.push(filters.supplierId)
  }
  if (filters.storageLocation) {
    conditions.push(`LOWER(TRIM(l.storage_location)) = LOWER(TRIM($${paramIdx++}))`)
    params.push(filters.storageLocation)
  }
  if (filters.categoryId) {
    conditions.push(`p.category_id = $${paramIdx++}`)
    params.push(filters.categoryId)
  }

  return { conditions, params, paramIdx, thresholdDays }
}

export async function listExpiryLots(restaurantId, filters = {}) {
  const { expiringSoonDays } = await getExpirySettings(restaurantId)
  const threshold = expiringSoonDays
  const { conditions, params } = buildListFilters(restaurantId, filters, threshold)

  const { rows } = await query(
    `
    SELECT l.*, s.name AS supplier_name, p.category_id, pc.name AS category_name
    FROM restaurant_inventory_lot l
    LEFT JOIN supplier s ON s.id = l.supplier_id
    LEFT JOIN product p ON p.id = l.product_id
    LEFT JOIN product_category pc ON pc.id = p.category_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.expiry_date ASC NULLS LAST, l.created_at ASC
    `,
    params
  )

  let lots = rows.map((r) => mapLotRow(r, threshold))
  if (filters.status) {
    lots = lots.filter((lot) => lot.status === filters.status)
  }
  return { lots, expiringSoonDays: threshold }
}

export async function getExpirySummary(restaurantId) {
  const { lots, expiringSoonDays } = await listExpiryLots(restaurantId)
  const expiringSoon = lots.filter((l) => l.status === 'expiring_soon')
  const expired = lots.filter((l) => l.status === 'expired')
  return {
    expiringSoonDays,
    expiringSoonCount: expiringSoon.length,
    expiredCount: expired.length,
    topNearestExpiry: lots
      .filter((l) => l.status === 'expiring_soon' || l.status === 'expired')
      .slice(0, 5),
  }
}

export async function createExpiryLot(restaurantId, data) {
  if (!data.itemName?.trim()) throw new ValidationError('itemName is required')
  if (!data.expiryDate) throw new ValidationError('expiryDate is required')

  const { rows } = await query(
    `
    INSERT INTO restaurant_inventory_lot (
      restaurant_id, branch_id, product_id, supplier_id,
      order_id, order_item_id, receiving_report_id, receiving_line_item_id,
      item_name, product_sku, quantity, unit,
      batch_lot_number, received_date, expiry_date, storage_location, notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
    RETURNING *
    `,
    [
      restaurantId,
      data.branchId || null,
      data.productId || null,
      data.supplierId || null,
      data.orderId || null,
      data.orderItemId || null,
      data.receivingReportId || null,
      data.receivingLineItemId || null,
      data.itemName.trim(),
      data.productSku || null,
      data.quantity ?? 0,
      data.unit || 'unit',
      data.batchLotNumber || null,
      data.receivedDate || null,
      data.expiryDate,
      data.storageLocation || null,
      data.notes || null,
    ]
  )
  const { expiringSoonDays } = await getExpirySettings(restaurantId)
  return mapLotRow(rows[0], expiringSoonDays)
}

export async function updateExpiryLot(restaurantId, lotId, data) {
  const { rows: existing } = await query(
    `SELECT * FROM restaurant_inventory_lot WHERE id = $1 AND restaurant_id = $2 AND is_archived = false`,
    [lotId, restaurantId]
  )
  if (!existing.length) throw new NotFoundError('Expiry lot not found')

  const fields = []
  const params = []
  let idx = 1
  const setField = (col, val) => {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`)
      params.push(val)
    }
  }

  setField('item_name', data.itemName?.trim())
  setField('product_sku', data.productSku)
  setField('quantity', data.quantity)
  setField('unit', data.unit)
  setField('batch_lot_number', data.batchLotNumber)
  setField('received_date', data.receivedDate)
  setField('expiry_date', data.expiryDate)
  setField('storage_location', data.storageLocation)
  setField('notes', data.notes)
  setField('branch_id', data.branchId)
  setField('supplier_id', data.supplierId)

  if (!fields.length)
    return mapLotRow(existing[0], (await getExpirySettings(restaurantId)).expiringSoonDays)

  params.push(lotId, restaurantId)
  const { rows } = await query(
    `
    UPDATE restaurant_inventory_lot SET ${fields.join(', ')}, updated_at = now()
    WHERE id = $${idx++} AND restaurant_id = $${idx}
    RETURNING *
    `,
    params
  )
  const { expiringSoonDays } = await getExpirySettings(restaurantId)
  return mapLotRow(rows[0], expiringSoonDays)
}

export async function archiveExpiryLot(restaurantId, lotId) {
  const { rowCount } = await query(
    `UPDATE restaurant_inventory_lot SET is_archived = true, updated_at = now()
     WHERE id = $1 AND restaurant_id = $2`,
    [lotId, restaurantId]
  )
  if (!rowCount) throw new NotFoundError('Expiry lot not found')
  return { archived: true }
}

export async function createLotFromReceivingLine(
  client,
  {
    restaurantId,
    reportId,
    lineItemId,
    productId,
    supplierId,
    orderId,
    orderItemId,
    itemName,
    productSku,
    quantity,
    unit,
    batchLotNumber,
    receivedDate,
    expiryDate,
    storageLocation,
    notes,
  }
) {
  if (!expiryDate) return null
  const q = client.query.bind(client)
  const { rows } = await q(
    `
    INSERT INTO restaurant_inventory_lot (
      restaurant_id, product_id, supplier_id, order_id, order_item_id,
      receiving_report_id, receiving_line_item_id,
      item_name, product_sku, quantity, unit,
      batch_lot_number, received_date, expiry_date, storage_location, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING id
    `,
    [
      restaurantId,
      productId || null,
      supplierId || null,
      orderId || null,
      orderItemId || null,
      reportId,
      lineItemId,
      itemName,
      productSku || null,
      quantity ?? 0,
      unit || 'unit',
      batchLotNumber || null,
      receivedDate || null,
      expiryDate,
      storageLocation || null,
      notes || null,
    ]
  )
  return rows[0]?.id
}

async function claimDedup(restaurantId, { alertKind, dedupKey }) {
  const { rows } = await query(
    `
    INSERT INTO inventory_expiry_notification_log (
      restaurant_id, lot_id, alert_kind, dedup_key
    ) VALUES ($1, NULL, $2, $3)
    ON CONFLICT (restaurant_id, dedup_key, alert_kind) DO NOTHING
    RETURNING id
    `,
    [restaurantId, alertKind, dedupKey]
  )
  return rows.length > 0
}

async function attachNotificationToDedup(restaurantId, dedupKey, alertKind, notificationLogId) {
  if (!notificationLogId) return
  await query(
    `
    UPDATE inventory_expiry_notification_log
    SET notification_log_id = $4
    WHERE restaurant_id = $1 AND dedup_key = $2 AND alert_kind = $3
    `,
    [restaurantId, dedupKey, alertKind, notificationLogId]
  )
}

/**
 * Batch-fetch expiry lot counts grouped by restaurant (avoids per-restaurant N+1 scans).
 */
async function fetchExpiryCountsByRestaurant({ restaurantId = null } = {}) {
  const params = []
  let restaurantFilter = ''
  if (restaurantId) {
    restaurantFilter = 'AND l.restaurant_id = $1'
    params.push(restaurantId)
  }

  const { rows } = await query(
    `
    SELECT
      l.restaurant_id,
      COALESCE(s.expiring_soon_days, $${params.length + 1})::int AS expiring_soon_days,
      COUNT(*) FILTER (
        WHERE l.expiry_date IS NOT NULL
          AND l.expiry_date < CURRENT_DATE
      )::int AS expired_count,
      COUNT(*) FILTER (
        WHERE l.expiry_date IS NOT NULL
          AND l.expiry_date >= CURRENT_DATE
          AND l.expiry_date <= CURRENT_DATE + (COALESCE(s.expiring_soon_days, $${params.length + 1}) || ' days')::interval
      )::int AS expiring_soon_count
    FROM restaurant_inventory_lot l
    LEFT JOIN restaurant_inventory_settings s ON s.restaurant_id = l.restaurant_id
    WHERE l.is_archived = false
      ${restaurantFilter}
    GROUP BY l.restaurant_id, s.expiring_soon_days
    HAVING
      COUNT(*) FILTER (WHERE l.expiry_date IS NOT NULL AND l.expiry_date < CURRENT_DATE) > 0
      OR COUNT(*) FILTER (
        WHERE l.expiry_date IS NOT NULL
          AND l.expiry_date >= CURRENT_DATE
          AND l.expiry_date <= CURRENT_DATE + (COALESCE(s.expiring_soon_days, $${params.length + 1}) || ' days')::interval
      ) > 0
    `,
    [...params, DEFAULT_THRESHOLD]
  )

  return rows
}

/**
 * Check all restaurants (or one) and send grouped expiry notifications with dedup.
 */
export async function runExpiryReminderCheck({ restaurantId = null, dryRun = false } = {}) {
  const countsByRestaurant = await fetchExpiryCountsByRestaurant({ restaurantId })
  const todayKey = new Date().toISOString().slice(0, 10)
  let notificationsSent = 0
  let restaurantsChecked = countsByRestaurant.length

  for (const row of countsByRestaurant) {
    const rid = row.restaurant_id
    const expiringSoonDays = row.expiring_soon_days ?? DEFAULT_THRESHOLD

    if (row.expiring_soon_count > 0) {
      const dedupKey = `grouped:expiring:${todayKey}:${expiringSoonDays}`
      const claimed = await claimDedup(rid, { alertKind: 'grouped_expiring_soon', dedupKey })
      if (claimed) {
        if (dryRun || process.env.JOB_DRY_RUN === 'true') {
          notificationsSent += 1
        } else {
          const title = 'Items expiring soon'
          const message =
            row.expiring_soon_count === 1
              ? `1 inventory item is expiring within ${expiringSoonDays} days. Review it before placing your next order.`
              : `${row.expiring_soon_count} inventory items are expiring within ${expiringSoonDays} days. Review them before placing your next order.`
          const sent = await notifyTenantUsers({
            tenantId: rid,
            tenantType: 'RESTAURANT',
            notificationType: 'INVENTORY',
            notificationCategory: 'inventory_expiring',
            title,
            message,
            referenceType: 'INVENTORY_EXPIRY',
            metadata: { link: '/app/inventory?tab=expiry', count: row.expiring_soon_count },
          })
          if (sent.length) {
            await attachNotificationToDedup(rid, dedupKey, 'grouped_expiring_soon', sent[0]?.id)
            notificationsSent += 1
          }
        }
      }
    }

    if (row.expired_count > 0) {
      const dedupKey = `grouped:expired:${todayKey}`
      const claimed = await claimDedup(rid, { alertKind: 'grouped_expired', dedupKey })
      if (claimed) {
        if (dryRun || process.env.JOB_DRY_RUN === 'true') {
          notificationsSent += 1
        } else {
          const title = 'Expired inventory items'
          const message =
            row.expired_count === 1
              ? '1 inventory item has expired. Review and remove or use it promptly.'
              : `${row.expired_count} inventory items have expired. Review them before placing your next order.`
          const sent = await notifyTenantUsers({
            tenantId: rid,
            tenantType: 'RESTAURANT',
            notificationType: 'INVENTORY',
            notificationCategory: 'inventory_expired',
            title,
            message,
            referenceType: 'INVENTORY_EXPIRY',
            metadata: {
              link: '/app/inventory?tab=expiry&status=expired',
              count: row.expired_count,
            },
          })
          if (sent.length) {
            await attachNotificationToDedup(rid, dedupKey, 'grouped_expired', sent[0]?.id)
            notificationsSent += 1
          }
        }
      }
    }
  }

  return {
    restaurantsChecked,
    notificationsSent,
    dryRun: dryRun || process.env.JOB_DRY_RUN === 'true',
  }
}
