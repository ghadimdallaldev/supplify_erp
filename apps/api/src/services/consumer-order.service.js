import { query, withTransaction } from '../lib/db.js'
import {
  consumerLoyaltyEarnBasis,
  earnConsumerLoyaltyOnOrderComplete,
  redeemConsumerLoyaltyAtCheckout,
  reverseConsumerLoyaltyOnOrderCancel,
  validateConsumerLoyaltyRedeem,
} from './loyalty.service.js'
import { validateConsumerOrderSchedule } from '../lib/consumer-ordering-hours.js'
import { getRestaurantTimezone } from '../lib/tenant-timezone.js'
import { addCalendarDays, getZonedParts } from '../lib/delivery-rollover-time.js'

export const CONSUMER_ORDER_STATUS_CHAIN = Object.freeze([
  'RECEIVED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
])

export const CONSUMER_ORDER_TERMINAL_STATUSES = Object.freeze(['DELIVERED', 'CANCELLED'])

export function getNextStatus(current) {
  const idx = CONSUMER_ORDER_STATUS_CHAIN.indexOf(current)
  if (idx >= 0 && idx < CONSUMER_ORDER_STATUS_CHAIN.length - 1) {
    return CONSUMER_ORDER_STATUS_CHAIN[idx + 1]
  }
  return null
}

export function getConsumerOrderStatusError(current, next) {
  if (current === next) return null
  if (current === 'CANCELLED') return 'Order is already cancelled'
  if (current === 'DELIVERED') return 'A delivered order cannot be cancelled'
  if (next === 'CANCELLED') return null
  const expectedNext = getNextStatus(current)
  if (expectedNext !== next) {
    return expectedNext
      ? `Invalid status transition from ${current} to ${next}; expected ${expectedNext}`
      : `Order is already in terminal status ${current}`
  }
  return null
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function nonNegativeFee(value) {
  const fee = Number(value)
  if (!Number.isFinite(fee) || fee < 0) return 0
  return fee
}

/** Branch minimum, or the higher of the branch and delivery-zone minimums. */
export function requiredOrderMinimum(config, zone) {
  const branchMin = Number(config?.min_order_amount ?? 0)
  const zoneMin = zone ? Number(zone.min_order_amount ?? 0) : 0
  return Math.max(
    0,
    Number.isFinite(branchMin) ? branchMin : 0,
    Number.isFinite(zoneMin) ? zoneMin : 0
  )
}

export function minimumOrderError(subtotal, minimum) {
  if (!(minimum > 0) || Number(subtotal) >= minimum) return null
  return Object.assign(new Error('Order below minimum'), {
    name: 'MIN_ORDER_NOT_MET',
    details: { minOrderAmount: minimum },
  })
}

async function loadItemPricing(itemIds, restaurantId, branchId) {
  if (!itemIds.length) return { items: {}, groups: {}, options: {} }

  const { rows: items } = await query(
    `
    SELECT i.id, i.name, i.base_price, i.is_available
    FROM menu_item i
    JOIN menu_category c ON c.id = i.category_id AND c.restaurant_id = i.restaurant_id
    WHERE i.id = ANY($1::uuid[])
      AND i.restaurant_id = $2
      AND c.is_active = TRUE
      AND (i.branch_id IS NULL OR i.branch_id = $3)
      AND (c.branch_id IS NULL OR c.branch_id = $3)
    `,
    [itemIds, restaurantId, branchId]
  )

  const { rows: groups } = await query(
    `
    SELECT g.id, g.menu_item_id, g.name, g.min_selections, g.max_selections, g.is_required
    FROM menu_modifier_group g
    WHERE g.menu_item_id = ANY($1::uuid[])
    `,
    [itemIds]
  )

  const groupIds = groups.map((g) => g.id)
  let options = []
  if (groupIds.length) {
    const { rows: optionRows } = await query(
      `
      SELECT o.id, o.modifier_group_id, o.name, o.price_delta, o.is_available
      FROM menu_modifier_option o
      WHERE o.modifier_group_id = ANY($1::uuid[])
      `,
      [groupIds]
    )
    options = optionRows
  }

  return {
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    groups: Object.fromEntries(groups.map((g) => [g.id, g])),
    options: Object.fromEntries(options.map((o) => [o.id, o])),
  }
}

function effectiveMinSelections(group) {
  const min = Number(group.min_selections ?? 0)
  return group.is_required ? Math.max(1, min) : min
}

function validateAndPriceLine(line, pricing) {
  const item = pricing.items[line.menuItemId]
  if (!item || !item.is_available) {
    throw Object.assign(new Error('Menu item unavailable'), { name: 'MENU_ITEM_UNAVAILABLE' })
  }

  const selectedModifiers = []
  let modifierTotal = 0
  const modifierIds = [...new Set(line.modifierOptionIds || [])]
  const selectedByGroup = {}

  for (const optionId of modifierIds) {
    const option = pricing.options[optionId]
    if (!option || !option.is_available) {
      throw Object.assign(new Error('Modifier option unavailable'), {
        name: 'MODIFIER_UNAVAILABLE',
      })
    }
    const group = pricing.groups[option.modifier_group_id]
    if (!group || group.menu_item_id !== line.menuItemId) {
      throw Object.assign(new Error('Invalid modifier for item'), { name: 'INVALID_MODIFIER' })
    }
    if (!selectedByGroup[group.id]) selectedByGroup[group.id] = []
    selectedByGroup[group.id].push(option)
    selectedModifiers.push({
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      priceDelta: Number(option.price_delta),
    })
    modifierTotal += Number(option.price_delta)
  }

  const itemGroups = Object.values(pricing.groups).filter(
    (group) => group.menu_item_id === line.menuItemId
  )
  for (const group of itemGroups) {
    const count = selectedByGroup[group.id]?.length ?? 0
    const minRequired = effectiveMinSelections(group)
    if (count < minRequired) {
      throw Object.assign(new Error(`Modifier selection required for ${group.name}`), {
        name: 'MODIFIER_MIN_NOT_MET',
        details: { groupId: group.id, groupName: group.name, minRequired },
      })
    }
    if (count > Number(group.max_selections)) {
      throw Object.assign(new Error(`Too many modifiers selected for ${group.name}`), {
        name: 'MODIFIER_MAX_EXCEEDED',
        details: {
          groupId: group.id,
          groupName: group.name,
          maxAllowed: Number(group.max_selections),
        },
      })
    }
  }

  const unitPrice = roundMoney(Number(item.base_price) + modifierTotal)
  if (unitPrice < 0) {
    throw Object.assign(new Error('Item price cannot be negative'), { name: 'INVALID_PRICE' })
  }
  const quantity = Number(line.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw Object.assign(new Error('Invalid quantity'), { name: 'INVALID_QUANTITY' })
  }

  return {
    menuItemId: item.id,
    itemName: item.name,
    quantity,
    unitPrice,
    lineTotal: roundMoney(unitPrice * quantity),
    modifiers: selectedModifiers,
    notes: line.notes || null,
  }
}

async function resolveDeliveryFee(branchId, fulfillmentType, subtotal, deliveryZoneId) {
  const { rows: configs } = await query(
    `SELECT * FROM branch_fulfillment_config WHERE branch_id = $1`,
    [branchId]
  )
  const config = configs[0]

  if (fulfillmentType !== 'DELIVERY') {
    const belowMinimum = minimumOrderError(subtotal, requiredOrderMinimum(config, null))
    if (belowMinimum) throw belowMinimum
    return { deliveryFee: 0, config }
  }

  if (deliveryZoneId) {
    const { rows: zones } = await query(
      `SELECT * FROM delivery_zone WHERE id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [deliveryZoneId, branchId]
    )
    const zone = zones[0]
    if (!zone) {
      throw Object.assign(new Error('Delivery zone not found'), { name: 'DELIVERY_ZONE_NOT_FOUND' })
    }
    const zoneMinimum = minimumOrderError(subtotal, requiredOrderMinimum(config, zone))
    if (zoneMinimum) throw zoneMinimum
    return { deliveryFee: nonNegativeFee(zone.delivery_fee), config, zone }
  }

  const fee = nonNegativeFee(config?.delivery_fee)
  const belowMinimum = minimumOrderError(subtotal, requiredOrderMinimum(config, null))
  if (belowMinimum) throw belowMinimum
  return { deliveryFee: fee, config }
}

function assertFulfillmentAllowed(fulfillmentType, config) {
  const deliveryEnabled = config?.delivery_enabled ?? false
  const takeawayEnabled = config?.takeaway_enabled ?? true
  const dineInEnabled = config?.dine_in_enabled ?? true

  if (fulfillmentType === 'DELIVERY' && !deliveryEnabled) {
    throw Object.assign(new Error('Delivery not available'), { name: 'FULFILLMENT_NOT_AVAILABLE' })
  }
  if (fulfillmentType === 'TAKEAWAY' && !takeawayEnabled) {
    throw Object.assign(new Error('Takeaway not available'), { name: 'FULFILLMENT_NOT_AVAILABLE' })
  }
  if (fulfillmentType === 'DINE_IN' && !dineInEnabled) {
    throw Object.assign(new Error('Dine-in not available'), { name: 'FULFILLMENT_NOT_AVAILABLE' })
  }
}

export function consumerTicketDay(now, timeZone) {
  const parts = getZonedParts(now instanceof Date ? now : new Date(now), timeZone)
  const calendarDate =
    parts.hour === 24 ? addCalendarDays(parts.calendarDate, 1) : parts.calendarDate
  return calendarDate.replace(/-/g, '')
}

export function nextConsumerOrderNumber(existingNumber, day) {
  const prefix = `CO-${day}-`
  const raw = existingNumber ? String(existingNumber) : ''
  const seq = raw.startsWith(prefix) ? Number(raw.slice(prefix.length)) : 0
  const next = Number.isFinite(seq) && seq > 0 ? seq + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

async function nextOrderNumber(restaurantId, client, timeZone) {
  await client.query(`SELECT id FROM restaurant WHERE id = $1 FOR UPDATE`, [restaurantId])
  const day = consumerTicketDay(new Date(), timeZone)
  const prefix = `CO-${day}-`
  const { rows } = await client.query(
    `
    SELECT order_number
    FROM consumer_order
    WHERE restaurant_id = $1 AND order_number LIKE $2
    ORDER BY length(order_number) DESC, order_number DESC
    LIMIT 1
    `,
    [restaurantId, `${prefix}%`]
  )
  return nextConsumerOrderNumber(rows[0]?.order_number, day)
}

export async function createConsumerOrder(restaurantId, payload) {
  const {
    branchId,
    fulfillmentType,
    lines,
    guestName,
    guestEmail,
    guestPhone,
    deliveryAddress,
    deliveryZoneId,
    notes,
    scheduledFor,
    consumerMemberId: authMemberId,
    pointsToRedeem,
  } = payload

  if (!lines?.length) {
    throw Object.assign(new Error('Order must include at least one line'), { name: 'EMPTY_ORDER' })
  }

  const { rows: branchRows } = await query(
    `SELECT id FROM branch WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [branchId, restaurantId]
  )
  if (!branchRows.length) {
    throw Object.assign(new Error('Branch not found'), { name: 'BRANCH_NOT_FOUND' })
  }

  const itemIds = [...new Set(lines.map((l) => l.menuItemId))]
  const pricing = await loadItemPricing(itemIds, restaurantId, branchId)
  const pricedLines = lines.map((line) => validateAndPriceLine(line, pricing))
  const subtotal = roundMoney(pricedLines.reduce((sum, line) => sum + line.lineTotal, 0))

  const { deliveryFee, config } = await resolveDeliveryFee(
    branchId,
    fulfillmentType,
    subtotal,
    deliveryZoneId
  )
  assertFulfillmentAllowed(fulfillmentType, config)

  const timeZone = await getRestaurantTimezone(restaurantId)
  validateConsumerOrderSchedule(config, scheduledFor || null, new Date(), 'en', timeZone)

  if (fulfillmentType === 'DELIVERY' && !deliveryAddress) {
    throw Object.assign(new Error('Delivery address required'), {
      name: 'DELIVERY_ADDRESS_REQUIRED',
    })
  }

  let loyaltyDiscount = 0
  let loyaltyPointsRedeemed = 0
  if (pointsToRedeem) {
    if (!authMemberId) {
      throw Object.assign(new Error('Sign in to redeem rewards points'), {
        name: 'LOYALTY_AUTH_REQUIRED',
      })
    }
    try {
      const preview = await validateConsumerLoyaltyRedeem({
        restaurantId,
        memberId: authMemberId,
        pointsToRedeem,
        orderSubtotal: subtotal,
      })
      loyaltyDiscount = preview.discountValue
      loyaltyPointsRedeemed = preview.pointsToRedeem
    } catch (err) {
      throw Object.assign(new Error(err.message), { name: 'LOYALTY_REDEEM_INVALID' })
    }
  }

  const totalAmount = roundMoney(Math.max(0, subtotal - loyaltyDiscount + deliveryFee))

  return withTransaction(async (client) => {
    const consumerMemberId = authMemberId || null

    const orderNumber = await nextOrderNumber(restaurantId, client, timeZone)

    const { rows: lockedItems } = await client.query(
      `
      SELECT id, is_available
      FROM menu_item
      WHERE id = ANY($1::uuid[]) AND restaurant_id = $2
      FOR UPDATE
      `,
      [itemIds, restaurantId]
    )
    const availableIds = new Set(lockedItems.filter((row) => row.is_available).map((row) => row.id))
    if (pricedLines.some((line) => !availableIds.has(line.menuItemId))) {
      throw Object.assign(new Error('Menu item unavailable'), { name: 'MENU_ITEM_UNAVAILABLE' })
    }

    const optionIds = [
      ...new Set(lines.flatMap((line) => line.modifierOptionIds || []).filter(Boolean)),
    ]
    if (optionIds.length) {
      const { rows: lockedOptions } = await client.query(
        `
        SELECT id, is_available
        FROM menu_modifier_option
        WHERE id = ANY($1::uuid[])
        FOR UPDATE
        `,
        [optionIds]
      )
      const availableOptions = new Set(
        lockedOptions.filter((row) => row.is_available).map((row) => row.id)
      )
      if (optionIds.some((id) => !availableOptions.has(id))) {
        throw Object.assign(new Error('Modifier option unavailable'), {
          name: 'MODIFIER_UNAVAILABLE',
        })
      }
    }

    const { rows: orders } = await client.query(
      `
      INSERT INTO consumer_order (
        restaurant_id, branch_id, order_number, fulfillment_type, status,
        consumer_member_id, guest_name, guest_email, guest_phone,
        delivery_address, subtotal, delivery_fee, tax_amount, total_amount,
        loyalty_points_redeemed, loyalty_discount_amount,
        notes, scheduled_for
      )
      VALUES ($1, $2, $3, $4, 'RECEIVED', $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, $15, $16)
      RETURNING *
      `,
      [
        restaurantId,
        branchId,
        orderNumber,
        fulfillmentType,
        consumerMemberId,
        guestName,
        guestEmail || null,
        guestPhone || null,
        deliveryAddress ? JSON.stringify(deliveryAddress) : null,
        subtotal,
        deliveryFee,
        totalAmount,
        loyaltyPointsRedeemed,
        loyaltyDiscount,
        notes || null,
        scheduledFor || null,
      ]
    )

    const order = orders[0]

    if (loyaltyPointsRedeemed > 0 && consumerMemberId) {
      await redeemConsumerLoyaltyAtCheckout(client, {
        restaurantId,
        memberId: consumerMemberId,
        consumerOrderId: order.id,
        pointsToRedeem: loyaltyPointsRedeemed,
        orderSubtotal: subtotal,
      })
    }

    for (const line of pricedLines) {
      await client.query(
        `
        INSERT INTO consumer_order_line (
          order_id, menu_item_id, item_name, quantity, unit_price, line_total, modifiers, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          order.id,
          line.menuItemId,
          line.itemName,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
          JSON.stringify(line.modifiers),
          line.notes,
        ]
      )
    }

    await client.query(
      `
      INSERT INTO consumer_order_status_history (order_id, status, notes)
      VALUES ($1, 'RECEIVED', 'Order placed')
      `,
      [order.id]
    )

    const { rows: orderLines } = await client.query(
      `SELECT * FROM consumer_order_line WHERE order_id = $1 ORDER BY created_at`,
      [order.id]
    )

    return { order, lines: orderLines }
  })
}

export async function getOrderReceipt(receiptToken) {
  const { rows: orders } = await query(
    `
    SELECT o.*, r.name AS restaurant_name, r.slug AS restaurant_slug, b.name AS branch_name
    FROM consumer_order o
    JOIN restaurant r ON r.id = o.restaurant_id
    JOIN branch b ON b.id = o.branch_id AND b.tenant_id = o.restaurant_id
    WHERE o.receipt_token = $1
    `,
    [receiptToken]
  )

  if (!orders.length) return null

  const order = orders[0]
  const { rows: lines } = await query(
    `SELECT * FROM consumer_order_line WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  )
  const { rows: history } = await query(
    `SELECT * FROM consumer_order_status_history WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  )

  const loyalty = {
    pointsRedeemed: Number(order.loyalty_points_redeemed || 0),
    discountAmount: Number(order.loyalty_discount_amount || 0),
    pointsEarned: null,
  }

  if (order.consumer_member_id && order.status === 'DELIVERED') {
    const { rows: earnRows } = await query(
      `
      SELECT points_delta FROM consumer_loyalty_ledger
      WHERE consumer_order_id = $1 AND entry_type = 'EARN'
      LIMIT 1
      `,
      [order.id]
    )
    if (earnRows.length) {
      loyalty.pointsEarned = Number(earnRows[0].points_delta)
    }
  }

  return { order, lines, history, loyalty }
}

export async function trackConsumerOrder(restaurantId, { orderNumber, email, phone }) {
  const normalizedNumber = String(orderNumber || '').trim()
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null
  const normalizedPhone = phone ? String(phone).trim() : null

  if (!normalizedNumber || (!normalizedEmail && !normalizedPhone)) {
    throw Object.assign(new Error('Order number and email or phone required'), {
      name: 'TRACK_LOOKUP_INVALID',
    })
  }

  const params = [restaurantId, normalizedNumber]
  const contactFilters = []
  if (normalizedEmail) {
    params.push(normalizedEmail)
    contactFilters.push(`LOWER(o.guest_email) = $${params.length}`)
  }
  if (normalizedPhone) {
    params.push(normalizedPhone)
    contactFilters.push(`o.guest_phone = $${params.length}`)
  }

  const { rows: orders } = await query(
    `
    SELECT o.*, r.name AS restaurant_name, r.slug AS restaurant_slug, b.name AS branch_name
    FROM consumer_order o
    JOIN restaurant r ON r.id = o.restaurant_id
    JOIN branch b ON b.id = o.branch_id AND b.tenant_id = o.restaurant_id
    WHERE o.restaurant_id = $1
      AND o.order_number = $2
      AND (${contactFilters.join(' OR ')})
    ORDER BY o.created_at DESC
    LIMIT 1
    `,
    params
  )

  if (!orders.length) return null

  const order = orders[0]
  const { rows: lines } = await query(
    `SELECT * FROM consumer_order_line WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  )
  const { rows: history } = await query(
    `SELECT * FROM consumer_order_status_history WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  )

  return { order, lines, history }
}

export async function listRestaurantConsumerOrders(
  restaurantId,
  { branchId, status, limit = 50 } = {}
) {
  const params = [restaurantId]
  const filters = ['o.restaurant_id = $1']

  if (branchId) {
    params.push(branchId)
    filters.push(`o.branch_id = $${params.length}`)
  }
  if (status) {
    params.push(status)
    filters.push(`o.status = $${params.length}`)
  }

  params.push(Math.min(Number(limit) || 50, 100))

  const { rows } = await query(
    `
    SELECT o.*
    FROM consumer_order o
    WHERE ${filters.join(' AND ')}
    ORDER BY o.created_at DESC
    LIMIT $${params.length}
    `,
    params
  )

  if (!rows.length) return []

  const orderIds = rows.map((row) => row.id)
  const { rows: lineRows } = await query(
    `
    SELECT *
    FROM consumer_order_line
    WHERE order_id = ANY($1::uuid[])
    ORDER BY created_at
    `,
    [orderIds]
  )

  const linesByOrder = lineRows.reduce((acc, line) => {
    if (!acc[line.order_id]) acc[line.order_id] = []
    acc[line.order_id].push(line)
    return acc
  }, {})

  return rows.map((order) => ({
    ...order,
    lines: linesByOrder[order.id] || [],
  }))
}

export async function updateConsumerOrderStatus(orderId, restaurantId, status, changedBy, notes) {
  return withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT * FROM consumer_order WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [orderId, restaurantId]
    )
    if (!existing.length) {
      throw Object.assign(new Error('Order not found'), { name: 'ORDER_NOT_FOUND' })
    }

    const current = existing[0].status
    if (current === status) return existing[0]
    const transitionError = getConsumerOrderStatusError(current, status)
    if (transitionError) {
      throw Object.assign(new Error(transitionError), { name: 'INVALID_STATUS_TRANSITION' })
    }

    const { rows } = await client.query(
      `
      UPDATE consumer_order
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
      `,
      [status, orderId]
    )

    await client.query(
      `
      INSERT INTO consumer_order_status_history (order_id, status, changed_by, notes)
      VALUES ($1, $2, $3, $4)
      `,
      [orderId, status, changedBy || null, notes || null]
    )

    const order = rows[0]
    if (status === 'CANCELLED' && order.consumer_member_id) {
      await reverseConsumerLoyaltyOnOrderCancel(client, {
        restaurantId,
        memberId: order.consumer_member_id,
        consumerOrderId: orderId,
      })
    }
    if (status === 'DELIVERED' && order.consumer_member_id) {
      try {
        const earnSubtotal = consumerLoyaltyEarnBasis(order.subtotal, order.loyalty_discount_amount)
        await earnConsumerLoyaltyOnOrderComplete(client, {
          restaurantId,
          memberId: order.consumer_member_id,
          consumerOrderId: orderId,
          spendAmount: earnSubtotal,
          fulfillmentType: order.fulfillment_type,
        })
      } catch {
        // Points earn must not block the kitchen from completing the ticket.
      }
    }

    return order
  })
}
