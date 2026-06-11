import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { sendTemplateEmail } from '../email/email.service.js'
import { notifyTenantUsers, sendNotification } from './in-app.js'

/**
 * Domain notification templates and typed notify* helpers.
 */

export const DEFAULT_NOTIFICATION_PREFS = {
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  push_enabled: true,
  in_app_enabled: true,
  notify_order_new: true,
  notify_order_acknowledged: true,
  notify_order_processing: true,
  notify_order_shipped: true,
  notify_order_delivered: true,
  notify_order_cancelled: true,
  notify_message_received: true,
  notify_invoice_issued: true,
  notify_invoice_overdue: true,
  notify_payment_received: true,
  notify_low_stock: true,
  notify_out_of_stock: true,
  notify_system_updates: true,
  notify_promotions: true,
  notify_reservation_created: true,
  notify_reservation_waitlist: true,
  notify_staff_pto: true,
  notify_staff_swap: true,
  notify_staff_clock: true,
  notify_staff_announcement: true,
  notify_staff_document: true,
  notify_scheduled_order: true,
  notify_inventory_expiring: true,
  notify_reorder_cadence: true,
  notify_billing: true,
  notify_email_digest: false,
}

const CATEGORY_PREF_MAP = {
  placed: 'notify_order_new',
  acknowledged: 'notify_order_acknowledged',
  processing: 'notify_order_processing',
  shipped: 'notify_order_shipped',
  delivered: 'notify_order_delivered',
  completed: 'notify_order_delivered',
  cancelled: 'notify_order_cancelled',
  order_new: 'notify_order_new',
  orders: 'notify_order_new',
  message_received: 'notify_message_received',
  invoice_issued: 'notify_invoice_issued',
  invoice_overdue: 'notify_invoice_overdue',
  payment_received: 'notify_payment_received',
  low_stock: 'notify_low_stock',
  inventory_alerts: 'notify_low_stock',
  inventory_expiring: 'notify_inventory_expiring',
  inventory_expired: 'notify_inventory_expiring',
  reorder_cadence_missed: 'notify_reorder_cadence',
  order_fulfillment_issue: 'notify_order_new',
  out_of_stock: 'notify_out_of_stock',
  system_updates: 'notify_system_updates',
  promotions: 'notify_promotions',
  reservation_created: 'notify_reservation_created',
  reservation_rescheduled: 'notify_reservation_created',
  reservation_cancelled: 'notify_reservation_created',
  reservation_waitlist: 'notify_reservation_waitlist',
  order_approval: 'notify_order_new',
  order_amendment: 'notify_order_new',
  amendment: 'notify_order_new',
  staff_pto: 'notify_staff_pto',
  staff_swap: 'notify_staff_swap',
  staff_clock: 'notify_staff_clock',
  staff_announcement: 'notify_staff_announcement',
  staff_document: 'notify_staff_document',
  scheduled_order: 'notify_scheduled_order',
  dispute_opened: 'notify_system_updates',
  dispute_resolved: 'notify_system_updates',
  dispute_rejected: 'notify_system_updates',
  billing_trial_started: 'notify_billing',
  billing_trial_ending: 'notify_billing',
  billing_trial_expired: 'notify_billing',
  billing_activated: 'notify_billing',
  billing_renewed: 'notify_billing',
  billing_payment_failed: 'notify_billing',
  billing_cancelled: 'notify_billing',
  billing_plan_changed: 'notify_billing',
  quote_request_received: 'notify_order_new',
  quote_response_received: 'notify_order_new',
  billing_trial_extended: 'notify_billing',
  billing_account_locked: 'notify_billing',
  deal_submitted: 'notify_promotions',
  deal_rejected: 'notify_promotions',
  deal_expired: 'notify_promotions',
  test: 'notify_system_updates',
}

function readPref(prefs, snakeKey) {
  if (!prefs || !snakeKey) return undefined
  const camelKey = snakeKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  if (prefs[camelKey] !== undefined) return prefs[camelKey]
  return prefs[snakeKey]
}

export function isPrefEnabled(prefs, snakeKey, defaultValue = true) {
  const value = readPref(prefs, snakeKey)
  if (value === undefined) return defaultValue
  return value !== false
}

export function resolvePreferenceKey(notificationCategory) {
  const normalized = String(notificationCategory || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  if (CATEGORY_PREF_MAP[normalized]) {
    return CATEGORY_PREF_MAP[normalized]
  }
  const directKey = `notify_${normalized}`
  if (DEFAULT_NOTIFICATION_PREFS[directKey] !== undefined) {
    return directKey
  }
  return null
}

/**
 * Resolve which notification channels are allowed for a given plan feature value.
 */
export function resolveAllowedChannels(notificationsFeatureValue) {
  switch (notificationsFeatureValue) {
    case 'in_app_and_email':
      return new Set(['in_app', 'email'])
    case 'email_and_whatsapp':
    case 'email_whatsapp_webhook':
      return new Set(['in_app', 'email', 'whatsapp'])
    case 'in_app_only':
    default:
      return new Set(['in_app'])
  }
}

export function formatReservationTime(scheduledAt) {
  if (!scheduledAt) return 'your scheduled time'
  return new Date(scheduledAt).toLocaleString()
}

async function getStaffMemberContext(staffId) {
  const { rows } = await query(
    `
      SELECT m.id, m.display_name, m.role, m.restaurant_id
      FROM staff_member m
      WHERE m.id = $1
    `,
    [staffId]
  )
  return rows[0] || null
}

export async function notifySupplierLowStock({
  productId,
  warehouseId,
  productName,
  threshold,
  currentValue,
}) {
  const { rows: productRows } = await query(
    `SELECT p.name, p.supplier_id FROM product p WHERE p.id = $1`,
    [productId]
  )
  if (productRows.length === 0) return null
  const supplierId = productRows[0].supplier_id
  const name = productName || productRows[0].name

  const { rows: userRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [supplierId]
  )
  if (userRows.length === 0) {
    logger.warn('No app_user found for supplier', { supplierId })
    return null
  }
  const userId = userRows[0].id

  const message = `Low stock: ${name}. Current: ${currentValue}, threshold: ${threshold}. Restock soon.`
  try {
    const sent = await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'LOW_STOCK',
      notificationCategory: 'inventory_alerts',
      title: 'Low stock alert',
      message,
      referenceId: productId,
      referenceType: 'PRODUCT',
      metadata: { productId, warehouseId, threshold, currentValue },
    })
    return sent[0] || null
  } catch (err) {
    logger.error('notifySupplierLowStock failed', { error: err.message, productId })
    return null
  }
}

/**
 * Helper functions for common notification types
 */

export async function notifyOrderStatusChange(order, status) {
  const messages = {
    PLACED: {
      title: 'New Order Received',
      message: order.restaurant_name
        ? `New order from ${order.restaurant_name} - Order #${order.id.slice(0, 8)} for $${order.total_amount}`
        : `New order #${order.id.slice(0, 8)} for $${order.total_amount}`,
    },
    ACKNOWLEDGED: {
      title: 'Order Acknowledged',
      message: `Your order #${order.id.slice(0, 8)} has been acknowledged by ${order.supplier_name || 'supplier'}`,
    },
    PROCESSING: {
      title: 'Order Processing',
      message: `Your order #${order.id.slice(0, 8)} is being prepared for shipping`,
    },
    SHIPPED: {
      title: 'Order Shipped',
      message: `Your order #${order.id.slice(0, 8)} has been shipped`,
    },
    DELIVERED: {
      title: 'Order Delivered',
      message: `Your order #${order.id.slice(0, 8)} has been delivered`,
    },
    COMPLETED: {
      title: 'Order Completed',
      message: `Your order #${order.id.slice(0, 8)} has been completed and delivered by ${order.supplier_name || 'supplier'}`,
    },
    CANCELLED: {
      title: 'Order Cancelled',
      message: order.restaurant_name
        ? `Order #${order.id.slice(0, 8)} from ${order.restaurant_name} has been cancelled`
        : `Order #${order.id.slice(0, 8)} has been cancelled`,
    },
    SUPPLIER_DECLINED: {
      title: 'Order declined by supplier',
      message: order.cancel_reason
        ? `Order #${order.id.slice(0, 8)} was declined: ${order.cancel_reason}`
        : `Order #${order.id.slice(0, 8)} was declined by ${order.supplier_name || 'your supplier'}`,
    },
  }

  const isSupplierDecline =
    status === 'CANCELLED' &&
    (order.cancelled_by === 'SUPPLIER' || order.cancelledBy === 'SUPPLIER')

  const msg = isSupplierDecline ? messages.SUPPLIER_DECLINED : messages[status]
  if (!msg) return null

  const payload = {
    notificationType: 'ORDER',
    notificationCategory: status,
    title: msg.title,
    message: msg.message,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: {
      order_id: order.id,
      status,
      cancelled_by: order.cancelled_by || order.cancelledBy,
      cancel_reason: order.cancel_reason || order.cancelReason,
    },
  }

  if (status === 'PLACED') {
    return notifyTenantUsers({
      tenantId: order.supplier_id,
      tenantType: 'SUPPLIER',
      ...payload,
    })
  }

  if (status === 'CANCELLED') {
    if (isSupplierDecline) {
      return notifyTenantUsers({
        tenantId: order.restaurant_id,
        tenantType: 'RESTAURANT',
        ...payload,
      })
    }
    return notifyTenantUsers({
      tenantId: order.supplier_id,
      tenantType: 'SUPPLIER',
      ...payload,
    })
  }

  return notifyTenantUsers({
    tenantId: order.restaurant_id,
    tenantType: 'RESTAURANT',
    ...payload,
  })
}

const DRIVER_MILESTONE_MESSAGES = {
  driver_assigned: {
    title: 'Driver assigned',
    restaurant: (o) => `A driver has been assigned to your order #${o.id.slice(0, 8)}`,
    supplier: (o) => `Driver assigned to order #${o.id.slice(0, 8)}`,
  },
  out_for_delivery: {
    title: 'Out for delivery',
    restaurant: (o) => `Your order #${o.id.slice(0, 8)} is out for delivery`,
    supplier: (o) => `Order #${o.id.slice(0, 8)} is out for delivery`,
  },
  delivered: {
    title: 'Delivery completed',
    restaurant: (o) => `Your order #${o.id.slice(0, 8)} has been delivered`,
    supplier: (o) => `Order #${o.id.slice(0, 8)} marked delivered`,
  },
  failed_delivery: {
    title: 'Delivery failed',
    restaurant: (o) => `Delivery failed for order #${o.id.slice(0, 8)}`,
    supplier: (o) => `Delivery failed for order #${o.id.slice(0, 8)}`,
  },
  delivery_rescheduled: {
    title: 'Delivery rescheduled',
    restaurant: (o) => `Delivery for order #${o.id.slice(0, 8)} was rescheduled for tomorrow`,
    supplier: (o) => `Delivery for order #${o.id.slice(0, 8)} was rescheduled for tomorrow`,
  },
}

/** Batch supplier notification after delivery rollover job (one message per supplier). */
export async function notifyDeliveryRolloverBatch({
  supplierId,
  items = [],
  notifyRestaurant = false,
}) {
  if (!supplierId || !items.length) return null
  const count = items.length
  const defs = DRIVER_MILESTONE_MESSAGES.delivery_rescheduled

  await notifyTenantUsers({
    tenantId: supplierId,
    tenantType: 'SUPPLIER',
    notificationType: 'ORDER',
    notificationCategory: 'delivery_rollover',
    title: 'Deliveries moved to tomorrow',
    message:
      count === 1
        ? '1 delivery was moved to tomorrow.'
        : `${count} deliveries were moved to tomorrow.`,
    referenceType: 'SUPPLIER',
    metadata: { count, order_ids: items.map((i) => i.orderId) },
  })

  if (!notifyRestaurant) return true

  for (const item of items) {
    const { rows } = await query(
      `SELECT o.id, o.restaurant_id FROM customer_order o WHERE o.id = $1`,
      [item.orderId]
    )
    const order = rows[0]
    if (!order) continue
    await notifyTenantUsers({
      tenantId: order.restaurant_id,
      tenantType: 'RESTAURANT',
      notificationType: 'ORDER',
      notificationCategory: 'delivery_rescheduled',
      title: defs.title,
      message: defs.restaurant(order),
      referenceId: order.id,
      referenceType: 'ORDER',
      metadata: { order_id: order.id, scheduled_date: item.scheduledDate },
    })
  }
  return true
}

/** In-app notifications for driver delivery milestones (no email per ping). */
export async function notifyDriverDeliveryMilestone({ order, supplierId, milestone, driverName }) {
  const defs = DRIVER_MILESTONE_MESSAGES[milestone]
  if (!defs || !order?.id) return null

  const base = {
    notificationType: 'ORDER',
    notificationCategory: milestone,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: {
      order_id: order.id,
      milestone,
      driver_name: driverName || null,
    },
  }

  await notifyTenantUsers({
    tenantId: order.restaurant_id,
    tenantType: 'RESTAURANT',
    title: defs.title,
    message: defs.restaurant(order),
    ...base,
  })

  if (supplierId) {
    await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      title: defs.title,
      message: defs.supplier(order),
      ...base,
    })
  }

  return true
}

export async function notifyReservationCreated(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const timeslot = scheduledAt ? new Date(scheduledAt).toLocaleString() : 'unscheduled time'
  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION_CREATED',
    notificationCategory: 'RESERVATION_CREATED',
    title: 'New reservation booked',
    message: `${customerName} party of ${partySize} for ${timeslot}`,
    referenceId: reservation.id || reservation.reservationId,
    referenceType: 'RESERVATION',
    metadata: {
      restaurantId,
      branchId,
      partySize,
      scheduledAt,
      status,
    },
  })
  return sent[0] || null
}

export async function notifyReservationWaitlist(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION_WAITLIST',
    notificationCategory: 'RESERVATION_WAITLIST',
    title: 'Reservation moved to waitlist',
    message: `${customerName} is waiting for a table (${partySize} guests).`,
    referenceId: reservation.id || reservation.reservationId,
    referenceType: 'RESERVATION',
    metadata: {
      restaurantId,
      branchId,
      partySize,
      scheduledAt,
      status,
    },
  })
  return sent[0] || null
}

/**
 * Restaurant team alert for reservation changes (reschedule, cancel, status).
 */
export async function notifyReservationStaffEvent(reservation, event = 'updated') {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  if (!restaurantId) return null

  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const timeslot = formatReservationTime(scheduledAt)
  const status = reservation.status || 'CONFIRMED'

  const copy = {
    rescheduled: {
      category: 'reservation_rescheduled',
      title: 'Reservation rescheduled',
      message: `${customerName} (party of ${partySize}) moved to ${timeslot}`,
    },
    cancelled: {
      category: 'reservation_cancelled',
      title: 'Reservation cancelled',
      message: `${customerName} cancelled their booking for ${timeslot}`,
    },
    status_changed: {
      category: 'reservation_created',
      title: 'Reservation updated',
      message: `${customerName} — now ${status} for ${timeslot}`,
    },
  }
  const chosen = copy[event] || copy.status_changed

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION',
    notificationCategory: chosen.category,
    title: chosen.title,
    message: chosen.message,
    referenceId: reservation.id,
    referenceType: 'RESERVATION',
    metadata: { restaurantId, partySize, scheduledAt, status, event },
  })
  return sent[0] || null
}

export async function notifyStaffPtoRequest(ptoRequest) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId
  const staffContext = await getStaffMemberContext(staffId)
  if (!staffContext) return null

  const startDate = ptoRequest.start_date || ptoRequest.startDate
  const endDate = ptoRequest.end_date || ptoRequest.endDate
  const type = ptoRequest.type || ptoRequest.requestType || 'PTO'
  const status = ptoRequest.status || ptoRequest.requestStatus
  const dateRange = `${startDate} → ${endDate}`
  const sent = await notifyTenantUsers({
    tenantId: staffContext.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'STAFF_PTO_REQUEST',
    notificationCategory: 'STAFF_PTO',
    title: 'New PTO request submitted',
    message: `${staffContext.display_name || 'Team member'} requested ${type} (${dateRange})`,
    referenceId: ptoRequest.id || ptoRequest.requestId,
    referenceType: 'STAFF_PTO',
    metadata: {
      staffId,
      restaurantId: staffContext.restaurant_id,
      status,
      startDate,
      endDate,
    },
  })
  return sent[0] || null
}

export async function notifyStaffSwapRequest(swap) {
  const requestedBy = swap.requested_by || swap.requestedBy
  const restaurantId = swap.restaurant_id || swap.restaurantId
  const shift = swap.shift || {}

  const staffContext = await getStaffMemberContext(requestedBy)
  if (!staffContext) return null

  const shiftDate = shift.date || swap.shift_date || swap.shiftDate || 'upcoming shift'
  const targetRestaurantId = restaurantId || staffContext.restaurant_id

  const sent = await notifyTenantUsers({
    tenantId: targetRestaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'STAFF_SWAP_REQUEST',
    notificationCategory: 'STAFF_SWAP',
    title: 'Shift swap requested',
    message: `${staffContext.display_name || 'Team member'} requested a swap for ${shiftDate}`,
    referenceId: swap.id || swap.swapId,
    referenceType: 'STAFF_SWAP',
    metadata: {
      staffId: staffContext.id,
      restaurantId: targetRestaurantId,
      shiftId: swap.shift_id || shift.id,
      status: swap.status,
    },
  })
  return sent[0] || null
}

async function notifyStaffLinkedUser(
  staffId,
  { notificationType, notificationCategory, title, message, referenceId, referenceType, metadata }
) {
  const { rows } = await query(
    `
      SELECT user_id, portal_access_enabled
      FROM staff_member
      WHERE id = $1
    `,
    [staffId]
  )
  const staff = rows[0]
  if (!staff?.user_id || !staff.portal_access_enabled) return null

  return sendNotification({
    userId: staff.user_id,
    userType: 'RESTAURANT',
    notificationType,
    notificationCategory,
    title,
    message,
    referenceId,
    referenceType,
    metadata,
  })
}

export async function notifyStaffPtoDecision(ptoRequest) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId
  const status = ptoRequest.status
  if (!staffId || !['APPROVED', 'DECLINED'].includes(status)) return null

  const approved = status === 'APPROVED'
  return notifyStaffLinkedUser(staffId, {
    notificationType: 'STAFF_PTO',
    notificationCategory: 'staff_pto',
    title: approved ? 'PTO request approved' : 'PTO request declined',
    message: approved
      ? 'Your time-off request was approved by your manager.'
      : 'Your time-off request was declined by your manager.',
    referenceId: ptoRequest.id,
    referenceType: 'STAFF_PTO',
    metadata: { staffId, status },
  })
}

export async function notifyStaffSwapDecision(swap, decisionStatus) {
  const staffId = swap.requested_by || swap.requestedBy
  if (!staffId || !['APPROVED', 'DECLINED'].includes(decisionStatus)) return null

  const approved = decisionStatus === 'APPROVED'
  return notifyStaffLinkedUser(staffId, {
    notificationType: 'STAFF_SWAP',
    notificationCategory: 'staff_swap',
    title: approved ? 'Shift swap approved' : 'Shift swap declined',
    message: approved
      ? 'Your shift swap request was approved.'
      : 'Your shift swap request was declined.',
    referenceId: swap.id,
    referenceType: 'STAFF_SWAP',
    metadata: { staffId, status: decisionStatus },
  })
}

export async function notifyScheduledOrderEvent(quickList, action) {
  const restaurantId = quickList.restaurant_id || quickList.restaurantId
  if (!restaurantId) return null

  const autoMessage =
    action === 'EXECUTED'
      ? `Scheduled order "${quickList.name}" has been created automatically.`
      : `Scheduled order "${quickList.name}" will run soon. Review inventory if you need to pause it.`

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'SCHEDULED_ORDER',
    notificationCategory: 'SCHEDULED_ORDER',
    title: action === 'EXECUTED' ? 'Scheduled order executed' : 'Scheduled order reminder',
    message: autoMessage,
    referenceId: quickList.id,
    referenceType: 'QUICK_LIST',
    metadata: {
      quickListId: quickList.id,
      autoCreate: quickList.auto_create_order,
      nextExecutionDate: quickList.next_execution_date,
    },
  })
  return sent[0] || null
}

export async function notifyInvoiceIssued(invoice) {
  const sent = await notifyTenantUsers({
    tenantId: invoice.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'INVOICE',
    notificationCategory: 'invoice_issued',
    title: 'Invoice Issued',
    message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} due ${invoice.due_date}`,
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount },
  })
  return sent[0] || null
}

export async function notifyPaymentReceived(payment) {
  const supplierId = payment.invoice?.supplier_id
  if (!supplierId) return null

  const sent = await notifyTenantUsers({
    tenantId: supplierId,
    tenantType: 'SUPPLIER',
    notificationType: 'PAYMENT',
    notificationCategory: 'payment_received',
    title: 'Payment Received',
    message: `Payment of $${payment.payment_amount} received for invoice ${payment.invoice_number || payment.invoice_id?.slice(0, 8)}`,
    referenceId: payment.invoice_id,
    referenceType: 'INVOICE',
    metadata: { payment_id: payment.id, amount: payment.payment_amount },
  })
  return sent[0] || null
}

export async function notifyLowStock(product, currentStock, threshold) {
  const restaurantId = product.restaurant_id
  if (!restaurantId) return null

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'INVENTORY',
    notificationCategory: 'low_stock',
    title: 'Low Stock Alert',
    message: `${product.name} is below threshold. Current: ${currentStock}, Threshold: ${threshold}`,
    referenceId: product.product_id,
    referenceType: 'PRODUCT',
    metadata: { product_name: product.name, current_stock: currentStock, threshold },
  })
  return sent[0] || null
}

export async function notifyInvoiceOverdue(invoice) {
  const payload = {
    notificationType: 'INVOICE',
    notificationCategory: 'invoice_overdue',
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: { invoice_number: invoice.invoice_number, due_date: invoice.due_date },
  }

  const results = await Promise.allSettled([
    notifyTenantUsers({
      tenantId: invoice.restaurant_id,
      tenantType: 'RESTAURANT',
      ...payload,
      title: 'Invoice Overdue',
      message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} was due on ${invoice.due_date} and is now overdue.`,
    }),
    notifyTenantUsers({
      tenantId: invoice.supplier_id,
      tenantType: 'SUPPLIER',
      ...payload,
      title: 'Payment Overdue',
      message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} is overdue since ${invoice.due_date}.`,
    }),
  ])
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('notifyInvoiceOverdue failed', { err: result.reason?.message })
    }
  }
  return results
}

export async function notifyOutOfStock({ productId, warehouseId, productName }) {
  const { rows: pRows } = await query(
    `SELECT p.name, p.supplier_id FROM product p WHERE p.id = $1`,
    [productId]
  )
  if (!pRows.length) return null

  try {
    const sent = await notifyTenantUsers({
      tenantId: pRows[0].supplier_id,
      tenantType: 'SUPPLIER',
      notificationType: 'OUT_OF_STOCK',
      notificationCategory: 'out_of_stock',
      title: 'Out of Stock',
      message: `${productName || pRows[0].name} is now out of stock.`,
      referenceId: productId,
      referenceType: 'PRODUCT',
      metadata: { productId, warehouseId },
    })
    return sent[0] || null
  } catch (err) {
    logger.error('notifyOutOfStock failed', { err: err.message })
    return null
  }
}

export async function notifyMessageReceived({ conversationId, senderType, messagePreview }) {
  const { rows: cRows } = await query(
    `SELECT supplier_id, restaurant_id FROM conversation WHERE id = $1`,
    [conversationId]
  )
  if (!cRows.length) return null
  const conv = cRows[0]

  let tenantId
  let tenantType
  let senderLabel
  if (senderType === 'RESTAURANT') {
    tenantId = conv.supplier_id
    tenantType = 'SUPPLIER'
    senderLabel = 'A restaurant'
  } else {
    tenantId = conv.restaurant_id
    tenantType = 'RESTAURANT'
    senderLabel = 'A supplier'
  }
  if (!tenantId) return null

  const preview = messagePreview ? `: "${messagePreview.slice(0, 80)}"` : ''
  try {
    const sent = await notifyTenantUsers({
      tenantId,
      tenantType,
      notificationType: 'MESSAGE',
      notificationCategory: 'message_received',
      title: 'New message',
      message: `${senderLabel} sent you a message${preview}`,
      referenceId: conversationId,
      referenceType: 'CONVERSATION',
      metadata: { conversationId },
    })
    return sent[0] || null
  } catch (err) {
    logger.error('notifyMessageReceived failed', { err: err.message })
    return null
  }
}

export async function notifyDisputeOpened(dispute) {
  const supplierId = dispute.supplierId || dispute.supplier_id
  if (!supplierId) return null

  try {
    const sent = await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'DISPUTE',
      notificationCategory: 'dispute_opened',
      title: 'New dispute opened',
      message: `A restaurant opened a dispute on order #${String(dispute.orderId || dispute.order_id || '').slice(0, 8)}`,
      referenceId: dispute.id,
      referenceType: 'DISPUTE',
      metadata: {
        disputeId: dispute.id,
        orderId: dispute.orderId || dispute.order_id,
        type: dispute.type,
      },
    })
    return sent[0] || null
  } catch (err) {
    logger.error('notifyDisputeOpened failed', { err: err.message })
    return null
  }
}

/**
 * Notify restaurants when a supplier deal is approved and live (or pending payment).
 */
export async function notifyDealApproved(deal, { supplierName } = {}) {
  const supplierId = deal.supplier_id || deal.supplierId
  const dealId = deal.id
  const dealName = String(deal.name || 'New deal')
  const supplierLabel = supplierName || deal.supplier_name || 'A supplier'
  const link = `/app/deals?highlight=${encodeURIComponent(String(dealId))}`

  if (!supplierId || !dealId) return { followers: 0, nonFollowers: 0 }

  try {
    const { rows: followers } = await query(
      `SELECT restaurant_id FROM supplier_follow WHERE supplier_id = $1`,
      [supplierId]
    )

    const { rows: targeted } = await query(
      `SELECT restaurant_id FROM promotion_restaurant_targets WHERE promotion_id = $1`,
      [dealId]
    )

    const recipientIds = new Set([
      ...followers.map((r) => r.restaurant_id),
      ...targeted.map((r) => r.restaurant_id),
    ])

    let notifiedCount = 0

    for (const restaurantId of recipientIds) {
      await notifyTenantUsers({
        tenantId: restaurantId,
        tenantType: 'RESTAURANT',
        notificationType: 'PROMOTION',
        notificationCategory: 'promotions',
        title: `New deal from ${supplierLabel}`,
        message: `${dealName} is now available. Open Deals to view and redeem.`,
        referenceId: dealId,
        referenceType: 'DEAL',
        metadata: { link, dealId, supplierId, audience: 'eligible' },
      })
      notifiedCount += 1
    }

    logger.info('notifyDealApproved completed', {
      dealId,
      supplierId,
      notifiedCount,
    })
    return { followers: notifiedCount, nonFollowers: 0 }
  } catch (err) {
    logger.error('notifyDealApproved failed', { err: err.message, dealId })
    return { followers: 0, nonFollowers: 0, error: err.message }
  }
}

export async function notifyDisputeResolved(dispute, outcome, { replacementOrderId = null } = {}) {
  const restaurantId = dispute.restaurantId || dispute.restaurant_id
  if (!restaurantId) return null

  const resolutionType = dispute.resolutionType || dispute.resolution_type
  const replacementId =
    replacementOrderId || dispute.replacementOrderId || dispute.replacement_order_id

  const title = outcome === 'rejected' ? 'Dispute rejected' : 'Dispute resolved'
  let message =
    outcome === 'rejected'
      ? `Your dispute was rejected. ${dispute.resolutionNotes || dispute.resolution_notes || ''}`.trim()
      : `Your dispute was resolved (${resolutionType || 'closed'}).`

  if (outcome !== 'rejected' && resolutionType === 'replacement' && replacementId) {
    message = `Your dispute was resolved with a replacement. Replacement order #${String(replacementId).slice(0, 8)} has been created.`
  }

  const metadata = {
    disputeId: dispute.id,
    resolutionType,
  }
  if (replacementId) {
    metadata.replacementOrderId = replacementId
    metadata.link = `/app/orders/${replacementId}`
  }

  try {
    const sent = await notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'DISPUTE',
      notificationCategory: outcome === 'rejected' ? 'dispute_rejected' : 'dispute_resolved',
      title,
      message,
      referenceId: dispute.id,
      referenceType: 'DISPUTE',
      metadata,
    })
    return sent[0] || null
  } catch (err) {
    logger.error('notifyDisputeResolved failed', { err: err.message })
    return null
  }
}

async function listPlatformAdminUserIds(limit = 50) {
  const { rows } = await query(
    `
    SELECT DISTINCT ur.user_id AS id
    FROM user_role ur
    JOIN role r ON r.id = ur.role_id
    WHERE r.tenant_type = 'ADMIN'
    LIMIT $1
    `,
    [limit]
  )
  return rows.map((r) => r.id)
}

async function notifyBillingEvent(tenantId, tenantType, category, title, message, metadata = {}) {
  try {
    const sent = await notifyTenantUsers({
      tenantId,
      tenantType,
      notificationType: 'BILLING',
      notificationCategory: category,
      title,
      message,
      referenceType: 'SUBSCRIPTION',
      referenceId: metadata.subscriptionId || null,
      metadata: { ctaUrl: '/app/billing', ...metadata },
    })
    return sent
  } catch (err) {
    logger.error('Billing notification failed', { err: err.message, category, tenantId })
    return []
  }
}

export async function notifyBillingTrialStarted({ tenantId, tenantType, planName, trialEndsAt }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_started',
    'Trial started',
    `Your Supplify trial${planName ? ` (${planName})` : ''} has started.${trialEndsAt ? ` It ends on ${trialEndsAt}.` : ''}`,
    { trialEndsAt }
  )
}

export async function notifyBillingTrialEnding({ tenantId, tenantType, daysLeft, trialEndsAt }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_ending',
    'Trial ending soon',
    `Your Supplify trial ends in ${daysLeft} day(s)${trialEndsAt ? ` (${trialEndsAt})` : ''}. Add a payment method to keep full access.`,
    { daysLeft, trialEndsAt }
  )
}

export async function notifyBillingTrialExpired({ tenantId, tenantType }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_expired',
    'Trial expired',
    'Your Supplify trial has expired. Subscribe to restore write access.',
    {}
  )
}

export async function notifyBillingActivated({ tenantId, tenantType, planName }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_activated',
    'Subscription activated',
    `Your Supplify subscription${planName ? ` (${planName})` : ''} is now active.`,
    { planName }
  )
}

export async function notifyBillingRenewed({ tenantId, tenantType, periodEnd }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_renewed',
    'Subscription renewed',
    `Your subscription was renewed${periodEnd ? ` through ${periodEnd}.` : '.'}`,
    { periodEnd }
  )
}

export async function notifyBillingPaymentFailed({ tenantId, tenantType, reason }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_payment_failed',
    'Payment failed',
    `We could not process your subscription payment.${reason ? ` ${reason}` : ''} Update your payment method to avoid interruption.`,
    { reason }
  )
}

export async function notifyBillingCancelled({ tenantId, tenantType }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_cancelled',
    'Subscription cancelled',
    'Your Supplify subscription has been cancelled.',
    {}
  )
}

export async function notifyBillingAccountLocked({ tenantId, tenantType, reason }) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_account_locked',
    'Account restricted',
    `Write access is restricted${reason ? `: ${reason}` : ''}. Visit billing to restore access.`,
    { reason }
  )
}

export async function notifyDealRejected(deal, { rejectionReason } = {}) {
  const supplierId = deal.supplier_id || deal.supplierId
  if (!supplierId) return null
  try {
    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_rejected',
      title: 'Deal rejected',
      message: `Your deal "${deal.name || deal.title || 'promotion'}" was not approved.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      referenceId: deal.id,
      referenceType: 'DEAL',
      metadata: { rejectionReason },
    })
  } catch (err) {
    logger.error('notifyDealRejected failed', { err: err.message, dealId: deal.id })
    return null
  }
}

export async function notifyDealSubmitted(deal, { supplierName } = {}) {
  const supplierId = deal.supplier_id || deal.supplierId
  const label = supplierName || 'A supplier'
  try {
    await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_submitted',
      title: 'Deal submitted for review',
      message: `Your deal "${deal.name || deal.title}" was submitted and is pending admin approval.`,
      referenceId: deal.id,
      referenceType: 'DEAL',
    })
    const adminIds = await listPlatformAdminUserIds(20)
    for (const userId of adminIds) {
      await sendNotification({
        userId,
        userType: 'ADMIN',
        notificationType: 'PROMOTION',
        notificationCategory: 'deal_submitted',
        title: 'Deal requires approval',
        message: `${label} submitted "${deal.name || deal.title}" for approval.`,
        referenceId: deal.id,
        referenceType: 'DEAL',
        metadata: { ctaUrl: '/admin/promotions' },
      }).catch(() => {})
    }
  } catch (err) {
    logger.error('notifyDealSubmitted failed', { err: err.message, dealId: deal.id })
  }
}

export async function notifyDealExpired(deal) {
  const supplierId = deal.supplier_id || deal.supplierId
  if (!supplierId) return null
  try {
    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_expired',
      title: 'Deal expired',
      message: `Your deal "${deal.name || deal.title || 'promotion'}" has expired.`,
      referenceId: deal.id,
      referenceType: 'DEAL',
    })
  } catch (err) {
    logger.error('notifyDealExpired failed', { err: err.message, dealId: deal.id })
    return null
  }
}

export async function notifyStaffShiftEvent(
  staffMemberId,
  restaurantId,
  { title, message, shiftId }
) {
  try {
    const { rows } = await query(
      `SELECT email, display_name, app_user_id FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
      [staffMemberId, restaurantId]
    )
    const staff = rows[0]
    if (staff?.email) {
      await sendTemplateEmail({
        to: staff.email,
        template: 'staff.shift',
        subject: title,
        data: { message, title, recipientName: staff.display_name, tenantName: null },
        tenantId: restaurantId,
        eventType: 'staff.shift',
        eventKey: shiftId ? `staff:shift:${shiftId}:${staffMemberId}` : undefined,
        entityId: shiftId,
      })
    }
    if (staff?.app_user_id) {
      return sendNotification({
        userId: staff.app_user_id,
        userType: 'RESTAURANT',
        notificationType: 'STAFF',
        notificationCategory: 'staff_clock',
        title,
        message,
        referenceId: shiftId || null,
        referenceType: 'STAFF_SHIFT',
      })
    }
    return null
  } catch (err) {
    logger.error('notifyStaffShiftEvent failed', { err: err.message })
    return null
  }
}

export async function notifyStaffAnnouncement(restaurantId, { title, message, announcementId }) {
  try {
    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'STAFF',
      notificationCategory: 'staff_announcement',
      title: title || 'Team announcement',
      message,
      referenceId: announcementId || null,
      referenceType: 'STAFF_ANNOUNCEMENT',
    })
  } catch (err) {
    logger.error('notifyStaffAnnouncement failed', { err: err.message })
    return null
  }
}

export async function notifyStaffDocumentUploaded(restaurantId, { title, message, documentId }) {
  try {
    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'STAFF',
      notificationCategory: 'staff_document',
      title: title || 'New document',
      message,
      referenceId: documentId || null,
      referenceType: 'STAFF_DOCUMENT',
    })
  } catch (err) {
    logger.error('notifyStaffDocumentUploaded failed', { err: err.message })
    return null
  }
}

async function hasRecentQuoteNotification({
  tenantId,
  tenantType,
  notificationCategory,
  referenceId,
  referenceType = 'QUOTE_REQUEST',
  windowMinutes = 60,
}) {
  const { rows } = await query(
    `
    SELECT 1
    FROM notification_log nl
    JOIN app_user au ON au.id = nl.user_id
    WHERE nl.notification_category = $1
      AND nl.reference_id = $2
      AND nl.reference_type = $3
      AND nl.created_at > now() - ($4 || ' minutes')::interval
      AND (
        ($5 = 'RESTAURANT' AND au.restaurant_id = $6)
        OR ($5 = 'SUPPLIER' AND au.supplier_id = $6)
      )
    LIMIT 1
    `,
    [notificationCategory, referenceId, referenceType, String(windowMinutes), tenantType, tenantId]
  )
  return rows.length > 0
}

export async function notifyQuoteRequestReceived({
  supplierId,
  quoteRequestId,
  quoteRequestSupplierId,
  restaurantId,
}) {
  try {
    const alreadySent = await hasRecentQuoteNotification({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationCategory: 'quote_request_received',
      referenceId: quoteRequestSupplierId,
    })
    if (alreadySent) return null

    const { rows } = await query(`SELECT name FROM restaurant WHERE id = $1`, [restaurantId])
    const restaurantName = rows[0]?.name || 'A restaurant'

    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'QUOTE_REQUEST',
      notificationCategory: 'quote_request_received',
      title: 'New quote request',
      message: `${restaurantName} requested your best price on selected items.`,
      referenceId: quoteRequestId,
      referenceType: 'QUOTE_REQUEST',
      metadata: {
        quoteRequestSupplierId,
        ctaUrl: `/app/quote-requests/supplier/${quoteRequestSupplierId}`,
      },
    })
  } catch (err) {
    logger.error('notifyQuoteRequestReceived failed', { err: err.message })
    return null
  }
}

export async function notifyQuoteResponseReceived({
  restaurantId,
  quoteRequestId,
  quoteRequestSupplierId,
  supplierId,
}) {
  try {
    const alreadySent = await hasRecentQuoteNotification({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationCategory: 'quote_response_received',
      referenceId: quoteRequestSupplierId,
    })
    if (alreadySent) return null

    const { rows } = await query(`SELECT name FROM supplier WHERE id = $1`, [supplierId])
    const supplierName = rows[0]?.name || 'A supplier'

    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'QUOTE_RESPONSE',
      notificationCategory: 'quote_response_received',
      title: 'Supplier response received',
      message: `${supplierName} responded to your quote request.`,
      referenceId: quoteRequestId,
      referenceType: 'QUOTE_REQUEST',
      metadata: {
        quoteRequestSupplierId,
        supplierId,
        ctaUrl: `/app/quote-requests/${quoteRequestId}`,
      },
    })
  } catch (err) {
    logger.error('notifyQuoteResponseReceived failed', { err: err.message })
    return null
  }
}

export async function notifyAdminNewTenant({ tenantId, tenantType, tenantName, contactEmail }) {
  try {
    const adminIds = await listPlatformAdminUserIds(50)
    const message = `New ${tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'} "${tenantName}" registered${contactEmail ? ` (${contactEmail})` : ''}.`
    for (const userId of adminIds) {
      await sendNotification({
        userId,
        userType: 'ADMIN',
        notificationType: 'SYSTEM',
        notificationCategory: 'system_updates',
        title: `New ${tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'} registered`,
        message,
        referenceId: tenantId,
        referenceType: 'TENANT',
        metadata: { tenantType, tenantName, ctaUrl: '/admin' },
      }).catch(() => {})
    }
  } catch (err) {
    logger.error('notifyAdminNewTenant failed', { err: err.message })
  }
}
