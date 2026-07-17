import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { normalizeDaysOfWeek } from '../lib/quick-list-schedule.js'
import { evaluateScheduledOrderLimit, incrementUsage } from '../lib/subscription.js'
import { notifyScheduledOrderEvent, notifyOrderStatusChange } from './notification.service.js'
import { applySmartQuantitiesToItems } from './quick-list-ai.service.js'

const DUE_LISTS_BATCH_SIZE = 50

const DUE_LISTS_SQL = `
  SELECT ql.*, r.id AS restaurant_id
  FROM quick_list ql
  JOIN restaurant r ON r.id = ql.restaurant_id
  WHERE ql.is_scheduled = true
    AND ql.status = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1
      FROM subscription sub
      WHERE sub.tenant_id = r.id
        AND sub.tenant_type = 'RESTAURANT'
        AND sub.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
        AND sub.account_locked_at IS NOT NULL
    )
    AND ql.next_execution_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    AND (
      ql.next_execution_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      OR (
        ql.next_execution_date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
        AND (
          ql.preferred_time IS NULL
          OR ql.preferred_time <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::time
        )
      )
    )
  ORDER BY ql.next_execution_date ASC, ql.preferred_time ASC NULLS LAST, ql.created_at ASC
  LIMIT $1
  FOR UPDATE OF ql SKIP LOCKED
`

/**
 * Execute scheduled quick lists and create orders if auto_create_order is true.
 * Uses UTC for due-date matching, row locks, and a per-list daily execution ledger.
 */
export async function executeScheduledOrders() {
  try {
    logger.info('Checking for scheduled orders to execute (UTC)...')

    let executed = 0
    let errors = 0
    let skipped = 0

    for (;;) {
      const batchResult = await withTransaction(async (client) => {
        const { rows: scheduledLists } = await client.query(DUE_LISTS_SQL, [DUE_LISTS_BATCH_SIZE])
        if (scheduledLists.length === 0) {
          return { done: true, executed: 0, errors: 0, skipped: 0 }
        }

        const {
          rows: [{ today_date: executionDate }],
        } = await client.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS today_date`)

        let batchExecuted = 0
        let batchErrors = 0
        let batchSkipped = 0
        const postCommitNotifications = []

        for (const quickList of scheduledLists) {
          const nextExecutionDate = computeNextExecutionDate(quickList)

          const { rows: ledgerRows } = await client.query(
            `
            INSERT INTO quick_list_execution (
              quick_list_id, restaurant_id, execution_date, outcome
            ) VALUES ($1, $2, $3, 'skipped')
            ON CONFLICT (quick_list_id, execution_date) DO NOTHING
            RETURNING id
          `,
            [quickList.id, quickList.restaurant_id, executionDate]
          )

          if (ledgerRows.length === 0) {
            batchSkipped++
            await client.query(
              `
              UPDATE quick_list
              SET next_execution_date = $1,
                  last_execution_date = $2,
                  updated_at = now()
              WHERE id = $3
            `,
              [nextExecutionDate, executionDate, quickList.id]
            )
            continue
          }

          const ledgerId = ledgerRows[0].id

          await client.query(
            `
            UPDATE quick_list
            SET next_execution_date = $1,
                last_execution_date = $2,
                updated_at = now()
            WHERE id = $3
          `,
            [nextExecutionDate, executionDate, quickList.id]
          )

          let outcome = 'reminder'
          let errorMessage = null
          let aiAdjustments = null

          try {
            if (quickList.auto_create_order) {
              const result = await createOrderFromQuickList(quickList, client)
              const orders = result?.orders
              aiAdjustments = result?.aiAdjustments ?? null
              outcome = 'executed'
              if (orders?.length) {
                postCommitNotifications.push({
                  quickList,
                  notifyType: 'EXECUTED',
                  createdOrders: orders,
                })
              } else {
                postCommitNotifications.push({ quickList, notifyType: 'EXECUTED' })
              }
            } else {
              postCommitNotifications.push({ quickList, notifyType: 'REMINDER' })
            }
            batchExecuted++
          } catch (error) {
            outcome = 'failed'
            errorMessage = error.message
            batchErrors++
            logger.error(`Failed to execute scheduled quick list ${quickList.id}:`, error)
          }

          await client.query(
            `
            UPDATE quick_list_execution
            SET outcome = $1, error_message = $2, ai_adjustments = COALESCE($4::jsonb, ai_adjustments)
            WHERE id = $3
          `,
            [
              outcome,
              errorMessage,
              ledgerId,
              typeof aiAdjustments !== 'undefined' && aiAdjustments
                ? JSON.stringify(aiAdjustments)
                : null,
            ]
          )

          if (outcome === 'failed') {
            // no notification
          }
        }

        return {
          done: scheduledLists.length < DUE_LISTS_BATCH_SIZE,
          executed: batchExecuted,
          errors: batchErrors,
          skipped: batchSkipped,
          postCommitNotifications,
        }
      })

      executed += batchResult.executed
      errors += batchResult.errors
      skipped += batchResult.skipped

      for (const entry of batchResult.postCommitNotifications ?? []) {
        const { quickList, notifyType, createdOrders } = entry
        try {
          await notifyScheduledOrderEvent(quickList, notifyType)
          if (createdOrders?.length) {
            for (const order of createdOrders) {
              await notifyOrderStatusChange(order, 'PLACED')
            }
          }
        } catch (notifyError) {
          logger.warn('Failed to send scheduled order notification', {
            error: notifyError.message,
            quickListId: quickList.id,
          })
        }
      }

      if (batchResult.done) break
    }

    if (executed === 0 && errors === 0 && skipped === 0) {
      logger.info('No scheduled orders to execute today')
    } else {
      logger.info('Scheduled orders execution completed', { executed, errors, skipped })
    }

    return { executed, errors, skipped }
  } catch (error) {
    logger.error('Error executing scheduled orders:', error)
    throw error
  }
}

/**
 * Create order from quick list items (within an open transaction when client is passed).
 */
async function createOrderFromQuickList(quickList, client) {
  const q = client ? client.query.bind(client) : query

  const { rows: items } = await q(
    `
    SELECT qli.*, p.name as product_name, p.sku
    FROM quick_list_item qli
    JOIN product p ON p.id = qli.product_id
    WHERE qli.quick_list_id = $1
    ORDER BY qli.created_at
  `,
    [quickList.id]
  )

  if (items.length === 0) {
    logger.warn(`Quick list ${quickList.id} has no items, skipping order creation`)
    return { orders: [], aiAdjustments: null }
  }

  const restaurantId = quickList.restaurant_id

  const smartResult = await applySmartQuantitiesToItems(restaurantId, quickList, items)
  const workingItems = smartResult.items
  const aiAdjustments = smartResult.adjustments

  const ordersToCreate = new Set(workingItems.map((item) => item.supplier_id)).size
  const scheduleLimit = await evaluateScheduledOrderLimit(restaurantId, ordersToCreate)

  if (!scheduleLimit.allowed) {
    const { limitCheck } = scheduleLimit
    const errorMessage = `Order limit exceeded: Cannot create ${ordersToCreate} order(s) as it would exceed your daily limit of ${limitCheck.limit} orders. Current usage: ${limitCheck.current}/${limitCheck.limit}. Please upgrade your subscription to obtain more features and higher order limits.`
    logger.warn(`Order limit exceeded for restaurant ${restaurantId}: ${errorMessage}`)
    throw new Error(errorMessage)
  }

  if (scheduleLimit.usesGrace) {
    logger.info('Scheduled order using daily grace slot', {
      restaurantId,
      excess: scheduleLimit.excess,
      graceUsed: scheduleLimit.graceUsed,
      graceLimit: scheduleLimit.graceLimit,
      quickListId: quickList.id,
    })
  }

  const supplierGroups = new Map()
  for (const item of workingItems) {
    if (!supplierGroups.has(item.supplier_id)) {
      supplierGroups.set(item.supplier_id, [])
    }
    supplierGroups.get(item.supplier_id).push(item)
  }

  const createdOrders = []

  for (const [supplierId, supplierItems] of supplierGroups) {
    const productIds = supplierItems.map((item) => item.product_id)

    const { rows: products } = await q(
      `
      SELECT p.*, pr.amount as current_price, pr.currency
      FROM product p
      LEFT JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      WHERE p.id = ANY($1::uuid[])
    `,
      [productIds]
    )

    const priceMap = new Map(products.map((p) => [p.id, p]))

    let totalAmount = 0
    const orderItems = []

    for (const item of supplierItems) {
      const product = priceMap.get(item.product_id)
      if (!product || !product.current_price) {
        logger.warn(`No valid price for product ${item.product_id}, skipping`)
        continue
      }

      const unitPrice = Number(product.current_price)
      const quantity = Number(item.quantity)
      const lineTotal = unitPrice * quantity
      totalAmount += lineTotal

      orderItems.push({
        productId: item.product_id,
        quantity,
        unitPrice,
        lineTotal,
        notes: item.notes || '',
      })
    }

    if (orderItems.length === 0) {
      logger.warn(`No valid items for supplier ${supplierId}, skipping order`)
      continue
    }

    const {
      rows: [order],
    } = await q(
      `
      INSERT INTO customer_order (
        restaurant_id, status, total_amount, placed_at, placement_source
      ) VALUES ($1, 'PLACED', $2, now(), 'scheduled_quick_list')
      RETURNING *
    `,
      [restaurantId, totalAmount]
    )

    for (const item of orderItems) {
      await q(
        `
        INSERT INTO order_item (
          order_id, product_id, supplier_id, quantity, unit_price, line_total, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          order.id,
          item.productId,
          supplierId,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.notes,
        ]
      )

      await q(
        `
        UPDATE inventory 
        SET available_qty = available_qty - $1, updated_at = now()
        WHERE product_id = $2
      `,
        [item.quantity, item.productId]
      )
    }

    createdOrders.push(order)
    logger.info(
      `Created order ${order.id} from quick list ${quickList.id} for supplier ${supplierId}`
    )
  }

  if (scheduleLimit.usesGrace && scheduleLimit.excess > 0) {
    await incrementUsage(
      restaurantId,
      'RESTAURANT',
      'scheduled_order_grace_per_day',
      scheduleLimit.excess
    )
  }

  return { orders: createdOrders, aiAdjustments }
}

/**
 * Compute next execution date based on frequency (UTC calendar dates).
 */
export function computeNextExecutionDate(quickList) {
  const today = new Date()
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
  let cursor = new Date(utcToday)
  let nextExecutionDate

  switch (quickList.frequency) {
    case 'DAILY': {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
      nextExecutionDate = formatUtcDate(cursor)
      break
    }

    case 'WEEKLY': {
      cursor.setUTCDate(cursor.getUTCDate() + 7)
      nextExecutionDate = formatUtcDate(cursor)
      break
    }

    case 'WEEKLY_3X': {
      const dayNames = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ]
      const currentDay = cursor.getUTCDay()
      const scheduledDays = normalizeDaysOfWeek(quickList.days_of_week) || []

      for (let i = 1; i <= 7; i++) {
        const nextDay = (currentDay + i) % 7
        const nextDayName = dayNames[nextDay]
        if (scheduledDays.includes(nextDayName)) {
          cursor.setUTCDate(cursor.getUTCDate() + i)
          nextExecutionDate = formatUtcDate(cursor)
          break
        }
      }

      if (!nextExecutionDate) {
        cursor.setUTCDate(cursor.getUTCDate() + 7)
        nextExecutionDate = formatUtcDate(cursor)
      }
      break
    }

    case 'BIWEEKLY': {
      cursor.setUTCDate(cursor.getUTCDate() + 14)
      nextExecutionDate = formatUtcDate(cursor)
      break
    }

    case 'MONTHLY': {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      nextExecutionDate = formatUtcDate(cursor)
      break
    }

    default: {
      cursor.setUTCDate(cursor.getUTCDate() + 7)
      nextExecutionDate = formatUtcDate(cursor)
    }
  }

  return nextExecutionDate
}

function formatUtcDate(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
