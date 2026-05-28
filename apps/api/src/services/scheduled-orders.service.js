import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { normalizeDaysOfWeek } from '../lib/quick-list-schedule.js'
import { evaluateScheduledOrderLimit, incrementUsage } from '../lib/subscription.js'
import { notifyScheduledOrderEvent } from './notification.service.js'

/**
 * Execute scheduled quick lists and create orders if auto_create_order is true
 */
export async function executeScheduledOrders() {
  try {
    logger.info('Checking for scheduled orders to execute...')

    const today = new Date()
    // Use local date, not UTC date, to match database DATE comparison
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const todayDate = `${year}-${month}-${day}` // YYYY-MM-DD in local timezone
    // Format time as HH:MM:SS for PostgreSQL TIME comparison
    const hours = String(today.getHours()).padStart(2, '0')
    const minutes = String(today.getMinutes()).padStart(2, '0')
    const seconds = String(today.getSeconds()).padStart(2, '0')
    const currentTime = `${hours}:${minutes}:${seconds}` // HH:MM:SS in local timezone

    logger.info(
      `Server time: ${todayDate} ${currentTime} (Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`
    )

    // Find all active scheduled quick lists ready to execute
    // If next_execution_date is in the past, execute immediately (ignore preferred_time)
    // If next_execution_date is today, check if preferred_time has passed
    const { rows: scheduledLists } = await query(
      `
      SELECT ql.*, r.id as restaurant_id
      FROM quick_list ql
      JOIN restaurant r ON r.id = ql.restaurant_id
      WHERE ql.is_scheduled = true
        AND ql.status = 'ACTIVE'
        AND ql.next_execution_date <= $1
        AND (
          -- If execution date is in the past, execute regardless of time
          ql.next_execution_date < $1
          -- Or if execution date is today, check if preferred time has passed (or is null)
          OR (ql.next_execution_date = $1 AND (
            ql.preferred_time IS NULL 
            OR ql.preferred_time::time <= $2::time
          ))
        )
      ORDER BY ql.next_execution_date ASC, ql.preferred_time ASC, ql.created_at ASC
    `,
      [todayDate, currentTime]
    )

    logger.debug('Scheduled orders check', {
      todayDate,
      currentTime,
      readyCount: scheduledLists.length,
    })

    if (scheduledLists.length === 0) {
      logger.info('No scheduled orders to execute today')
      return { executed: 0, errors: 0 }
    }

    logger.info('Executing scheduled lists', { count: scheduledLists.length })

    let executed = 0
    let errors = 0

    for (const quickList of scheduledLists) {
      try {
        // Check if we should create order or just send reminder
        if (quickList.auto_create_order) {
          await createOrderFromQuickList(quickList)
          try {
            await notifyScheduledOrderEvent(quickList, 'EXECUTED')
          } catch (notifyError) {
            logger.warn('Failed to send scheduled order execution notification', {
              error: notifyError.message,
              quickListId: quickList.id,
            })
          }
        } else {
          try {
            await notifyScheduledOrderEvent(quickList, 'REMINDER')
          } catch (notifyError) {
            logger.warn('Failed to send scheduled order reminder', {
              error: notifyError.message,
              quickListId: quickList.id,
            })
          }
        }

        // Update next execution date
        await updateNextExecutionDate(quickList)

        // Update last execution date
        await query(
          `
          UPDATE quick_list
          SET last_execution_date = $1, updated_at = now()
          WHERE id = $2
        `,
          [todayDate, quickList.id]
        )

        executed++
        logger.info(`✓ Executed scheduled quick list: ${quickList.name} (${quickList.id})`)
      } catch (error) {
        errors++
        logger.error(`✗ Failed to execute scheduled quick list ${quickList.id}:`, error)
      }
    }

    logger.info(`Scheduled orders execution completed: ${executed} executed, ${errors} errors`)
    return { executed, errors }
  } catch (error) {
    logger.error('Error executing scheduled orders:', error)
    throw error
  }
}

/**
 * Create order from quick list items
 */
async function createOrderFromQuickList(quickList) {
  // Get quick list items
  const { rows: items } = await query(
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
    return
  }

  const restaurantId = quickList.restaurant_id

  const ordersToCreate = new Set(items.map((item) => item.supplier_id)).size
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

  // Group items by supplier
  const supplierGroups = new Map()
  for (const item of items) {
    if (!supplierGroups.has(item.supplier_id)) {
      supplierGroups.set(item.supplier_id, [])
    }
    supplierGroups.get(item.supplier_id).push(item)
  }

  // Create orders (one per supplier)
  const createdOrders = []

  for (const [supplierId, supplierItems] of supplierGroups) {
    // Get current prices for all products
    const productIds = supplierItems.map((item) => item.product_id)

    const { rows: products } = await query(
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

    // Calculate order total
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

    // Create order - customer_order doesn't have supplier_id, it's in order_item
    const {
      rows: [order],
    } = await query(
      `
      INSERT INTO customer_order (
        restaurant_id, status, total_amount, placed_at, placement_source
      ) VALUES ($1, 'PLACED', $2, now(), 'scheduled_quick_list')
      RETURNING *
    `,
      [restaurantId, totalAmount]
    )

    // Create order items
    for (const item of orderItems) {
      await query(
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

      // Update inventory
      await query(
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

  return createdOrders
}

/**
 * Update next execution date based on frequency
 */
async function updateNextExecutionDate(quickList) {
  const today = new Date()
  let nextExecutionDate

  switch (quickList.frequency) {
    case 'DAILY': {
      today.setDate(today.getDate() + 1)
      nextExecutionDate = today.toISOString().split('T')[0]
      break
    }

    case 'WEEKLY': {
      today.setDate(today.getDate() + 7)
      nextExecutionDate = today.toISOString().split('T')[0]
      break
    }

    case 'WEEKLY_3X': {
      // Find the next scheduled day
      const dayNames = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ]
      const currentDay = today.getDay()
      const scheduledDays = normalizeDaysOfWeek(quickList.days_of_week) || []

      // Find the next scheduled day within the next 7 days
      for (let i = 1; i <= 7; i++) {
        const nextDay = (currentDay + i) % 7
        const nextDayName = dayNames[nextDay]
        if (scheduledDays.includes(nextDayName)) {
          today.setDate(today.getDate() + i)
          nextExecutionDate = today.toISOString().split('T')[0]
          break
        }
      }

      // If no day found, default to next week
      if (!nextExecutionDate) {
        today.setDate(today.getDate() + 7)
        nextExecutionDate = today.toISOString().split('T')[0]
      }
      break
    }

    case 'BIWEEKLY': {
      today.setDate(today.getDate() + 14)
      nextExecutionDate = today.toISOString().split('T')[0]
      break
    }

    case 'MONTHLY': {
      today.setMonth(today.getMonth() + 1)
      nextExecutionDate = today.toISOString().split('T')[0]
      break
    }

    default: {
      // Default to next week if frequency is unknown
      today.setDate(today.getDate() + 7)
      nextExecutionDate = today.toISOString().split('T')[0]
    }
  }

  await query(
    `
    UPDATE quick_list
    SET next_execution_date = $1, updated_at = now()
    WHERE id = $2
  `,
    [nextExecutionDate, quickList.id]
  )

  return nextExecutionDate
}
