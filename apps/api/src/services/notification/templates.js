import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { t, resolveLocale, DEFAULT_LOCALE } from '../../i18n/index.js'
import { sendTemplateEmail } from '../email/email.service.js'
import { getUpgradePathForTenant } from '../../lib/subscription/plans.js'
import { notifyTenantUsers, sendNotification } from './in-app.js'

/**
 * Domain notification templates and typed notify* helpers.
 */

function nt(key, locale = DEFAULT_LOCALE, params = {}) {
  return t(`notifications.${key}`, resolveLocale(locale), params)
}

function orderShortId(order) {
  return order.id.slice(0, 8)
}

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
  supplier_connection_request: 'notify_promotions',
  connection_request_accepted: 'notify_promotions',
  connection_request_declined: 'notify_promotions',
  invoice_reminder_manual: 'notify_invoice_overdue',
  invoice_reminder_due: 'notify_invoice_overdue',
  invoice_reminder_overdue: 'notify_invoice_overdue',
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
      return new Set(['in_app', 'email', 'whatsapp'])
    case 'email_whatsapp_webhook':
      return new Set(['in_app', 'email', 'whatsapp', 'webhook'])
    case 'in_app_only':
    default:
      return new Set(['in_app'])
  }
}

export function formatReservationTime(scheduledAt, locale = DEFAULT_LOCALE) {
  if (!scheduledAt) return nt('reservation.unscheduled', locale)
  const lng = resolveLocale(locale)
  return new Date(scheduledAt).toLocaleString(lng === 'ar' ? 'ar' : 'en')
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

  const message = nt('lowStock.supplierMessage', DEFAULT_LOCALE, {
    name,
    currentValue,
    threshold,
  })
  try {
    const sent = await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'LOW_STOCK',
      notificationCategory: 'inventory_alerts',
      contentForLocale: (locale) => ({
        title: nt('lowStock.supplierTitle', locale),
        message: nt('lowStock.supplierMessage', locale, { name, currentValue, threshold }),
      }),
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

export function buildOrderStatusNotification(order, status, locale = DEFAULT_LOCALE) {
  const lng = resolveLocale(locale)
  const orderId = orderShortId(order)
  const supplierName = order.supplier_name || nt('common.supplier', lng)
  const isSupplierDecline =
    status === 'CANCELLED' &&
    (order.cancelled_by === 'SUPPLIER' || order.cancelledBy === 'SUPPLIER')

  if (isSupplierDecline) {
    const reason = order.cancel_reason || order.cancelReason
    return {
      title: nt('order.supplierDeclined.title', lng),
      message: reason
        ? nt('order.supplierDeclined.messageWithReason', lng, { orderId, reason })
        : nt('order.supplierDeclined.message', lng, { orderId, supplierName }),
    }
  }

  const keyMap = {
    PLACED: 'placed',
    ACKNOWLEDGED: 'acknowledged',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  }
  const key = keyMap[status]
  if (!key) return null

  if (status === 'PLACED') {
    return {
      title: nt('order.placed.title', lng),
      message: order.restaurant_name
        ? nt('order.placed.messageWithRestaurant', lng, {
            restaurantName: order.restaurant_name,
            orderId,
            amount: order.total_amount,
          })
        : nt('order.placed.message', lng, { orderId, amount: order.total_amount }),
    }
  }

  if (status === 'CANCELLED') {
    return {
      title: nt('order.cancelled.title', lng),
      message: order.restaurant_name
        ? nt('order.cancelled.messageWithRestaurant', lng, {
            orderId,
            restaurantName: order.restaurant_name,
          })
        : nt('order.cancelled.message', lng, { orderId }),
    }
  }

  if (status === 'ACKNOWLEDGED') {
    return {
      title: nt('order.acknowledged.title', lng),
      message: nt('order.acknowledged.message', lng, { orderId, supplierName }),
    }
  }

  if (status === 'COMPLETED') {
    return {
      title: nt('order.completed.title', lng),
      message: nt('order.completed.message', lng, { orderId, supplierName }),
    }
  }

  return {
    title: nt(`order.${key}.title`, lng),
    message: nt(`order.${key}.message`, lng, { orderId, supplierName }),
  }
}

export async function notifyOrderStatusChange(order, status) {
  const msg = buildOrderStatusNotification(order, status)
  if (!msg) return null

  const payload = {
    notificationType: 'ORDER',
    notificationCategory: status,
    contentForLocale: (locale) => buildOrderStatusNotification(order, status, locale),
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: {
      order_id: order.id,
      status,
      cancelled_by: order.cancelled_by || order.cancelledBy,
      cancel_reason: order.cancel_reason || order.cancelReason,
    },
  }

  const isSupplierDecline =
    status === 'CANCELLED' &&
    (order.cancelled_by === 'SUPPLIER' || order.cancelledBy === 'SUPPLIER')

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
  driver_assigned: 'driver_assigned',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  failed_delivery: 'failed_delivery',
  delivery_rescheduled: 'delivery_rescheduled',
}

function buildDriverMilestoneNotification(order, milestone, audience, locale = DEFAULT_LOCALE) {
  const lng = resolveLocale(locale)
  const key = DRIVER_MILESTONE_MESSAGES[milestone]
  if (!key) return null
  return {
    title: nt(`driver.${key}.title`, lng),
    message: nt(`driver.${key}.${audience}`, lng, { orderId: orderShortId(order) }),
  }
}

/** Batch supplier notification after delivery rollover job (one message per supplier). */
export async function notifyDeliveryRolloverBatch({
  supplierId,
  items = [],
  notifyRestaurant = false,
}) {
  if (!supplierId || !items.length) return null
  const count = items.length

  await notifyTenantUsers({
    tenantId: supplierId,
    tenantType: 'SUPPLIER',
    notificationType: 'ORDER',
    notificationCategory: 'delivery_rollover',
    contentForLocale: (locale) => ({
      title: nt('driver.rollover.title', locale),
      message:
        count === 1
          ? nt('driver.rollover.messageOne', locale)
          : nt('driver.rollover.messageMany', locale, { count }),
    }),
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
      contentForLocale: (locale) =>
        buildDriverMilestoneNotification(order, 'delivery_rescheduled', 'restaurant', locale),
      referenceId: order.id,
      referenceType: 'ORDER',
      metadata: { order_id: order.id, scheduled_date: item.scheduledDate },
    })
  }
  return true
}

/** In-app notifications for driver delivery milestones (no email per ping). */
export async function notifyDriverDeliveryMilestone({ order, supplierId, milestone, driverName }) {
  if (!DRIVER_MILESTONE_MESSAGES[milestone] || !order?.id) return null

  const base = {
    notificationType: 'ORDER',
    notificationCategory: milestone,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: {
      order_id: order.id,
      milestone,
      driver_name: driverName || null,
      skipEmail: true,
      skipWhatsapp: true,
    },
  }

  await notifyTenantUsers({
    tenantId: order.restaurant_id,
    tenantType: 'RESTAURANT',
    contentForLocale: (locale) =>
      buildDriverMilestoneNotification(order, milestone, 'restaurant', locale),
    ...base,
  })

  if (supplierId) {
    await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      contentForLocale: (locale) =>
        buildDriverMilestoneNotification(order, milestone, 'supplier', locale),
      ...base,
    })
  }

  return true
}

export async function notifyReservationCreated(reservation, locale = DEFAULT_LOCALE) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName =
    reservation.customer_name || reservation.customerName || nt('common.guest', locale)
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const timeslot = scheduledAt
    ? formatReservationTime(scheduledAt, locale)
    : nt('reservation.unscheduled', locale)
  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION_CREATED',
    notificationCategory: 'RESERVATION_CREATED',
    contentForLocale: (userLocale) => ({
      title: nt('reservationEvents.created.title', userLocale),
      message: nt('reservationEvents.created.message', userLocale, {
        customerName,
        partySize,
        timeslot: scheduledAt
          ? formatReservationTime(scheduledAt, userLocale)
          : nt('reservation.unscheduled', userLocale),
      }),
    }),
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

export async function notifyReservationWaitlist(reservation, locale = DEFAULT_LOCALE) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName =
    reservation.customer_name || reservation.customerName || nt('common.guest', locale)
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION_WAITLIST',
    notificationCategory: 'RESERVATION_WAITLIST',
    contentForLocale: (userLocale) => ({
      title: nt('reservationEvents.waitlist.title', userLocale),
      message: nt('reservationEvents.waitlist.message', userLocale, { customerName, partySize }),
    }),
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
export async function notifyReservationStaffEvent(
  reservation,
  event = 'updated',
  locale = DEFAULT_LOCALE
) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  if (!restaurantId) return null

  const customerName =
    reservation.customer_name || reservation.customerName || nt('common.guest', locale)
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || 'CONFIRMED'

  const copy = {
    rescheduled: 'rescheduled',
    cancelled: 'cancelled',
    status_changed: 'statusChanged',
  }
  const chosen = copy[event] || copy.status_changed

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'RESERVATION',
    notificationCategory:
      event === 'rescheduled'
        ? 'reservation_rescheduled'
        : event === 'cancelled'
          ? 'reservation_cancelled'
          : 'reservation_created',
    contentForLocale: (userLocale) => ({
      title: nt(`reservationEvents.${chosen}.title`, userLocale),
      message: nt(`reservationEvents.${chosen}.message`, userLocale, {
        customerName,
        partySize,
        timeslot: formatReservationTime(scheduledAt, userLocale),
        status,
      }),
    }),
    referenceId: reservation.id,
    referenceType: 'RESERVATION',
    metadata: { restaurantId, partySize, scheduledAt, status, event },
  })
  return sent[0] || null
}

export async function notifyStaffPtoRequest(ptoRequest, locale = DEFAULT_LOCALE) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId
  const staffContext = await getStaffMemberContext(staffId)
  if (!staffContext) return null

  const startDate = ptoRequest.start_date || ptoRequest.startDate
  const endDate = ptoRequest.end_date || ptoRequest.endDate
  const type = ptoRequest.type || ptoRequest.requestType || 'PTO'
  const status = ptoRequest.status || ptoRequest.requestStatus
  const dateRange = `${startDate} → ${endDate}`
  const displayName = staffContext.display_name || nt('common.teamMember', locale)
  const sent = await notifyTenantUsers({
    tenantId: staffContext.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'STAFF_PTO_REQUEST',
    notificationCategory: 'STAFF_PTO',
    contentForLocale: (userLocale) => ({
      title: nt('staff.ptoRequest.title', userLocale),
      message: nt('staff.ptoRequest.message', userLocale, {
        name: staffContext.display_name || nt('common.teamMember', userLocale),
        type,
        dateRange,
      }),
    }),
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

export async function notifyStaffSwapRequest(swap, locale = DEFAULT_LOCALE) {
  const requestedBy = swap.requested_by || swap.requestedBy
  const restaurantId = swap.restaurant_id || swap.restaurantId
  const shift = swap.shift || {}

  const staffContext = await getStaffMemberContext(requestedBy)
  if (!staffContext) return null

  const shiftDate =
    shift.date || swap.shift_date || swap.shiftDate || nt('common.upcomingShift', locale)
  const targetRestaurantId = restaurantId || staffContext.restaurant_id

  const sent = await notifyTenantUsers({
    tenantId: targetRestaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'STAFF_SWAP_REQUEST',
    notificationCategory: 'STAFF_SWAP',
    contentForLocale: (userLocale) => ({
      title: nt('staff.swapRequest.title', userLocale),
      message: nt('staff.swapRequest.message', userLocale, {
        name: staffContext.display_name || nt('common.teamMember', userLocale),
        shiftDate,
      }),
    }),
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
  { notificationType, notificationCategory, title, message, referenceId, referenceType, metadata },
  locale = DEFAULT_LOCALE
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
    locale,
    referenceId,
    referenceType,
    metadata,
  })
}

export async function notifyStaffPtoDecision(ptoRequest, locale = DEFAULT_LOCALE) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId
  const status = ptoRequest.status
  if (!staffId || !['APPROVED', 'DECLINED'].includes(status)) return null

  const approved = status === 'APPROVED'
  return notifyStaffLinkedUser(
    staffId,
    {
      notificationType: 'STAFF_PTO',
      notificationCategory: 'staff_pto',
      title: approved
        ? nt('staff.ptoApproved.title', locale)
        : nt('staff.ptoDeclined.title', locale),
      message: approved
        ? nt('staff.ptoApproved.message', locale)
        : nt('staff.ptoDeclined.message', locale),
      referenceId: ptoRequest.id,
      referenceType: 'STAFF_PTO',
      metadata: { staffId, status },
    },
    locale
  )
}

export async function notifyStaffSwapDecision(swap, decisionStatus, locale = DEFAULT_LOCALE) {
  const staffId = swap.requested_by || swap.requestedBy
  if (!staffId || !['APPROVED', 'DECLINED'].includes(decisionStatus)) return null

  const approved = decisionStatus === 'APPROVED'
  return notifyStaffLinkedUser(
    staffId,
    {
      notificationType: 'STAFF_SWAP',
      notificationCategory: 'staff_swap',
      title: approved
        ? nt('staff.swapApproved.title', locale)
        : nt('staff.swapDeclined.title', locale),
      message: approved
        ? nt('staff.swapApproved.message', locale)
        : nt('staff.swapDeclined.message', locale),
      referenceId: swap.id,
      referenceType: 'STAFF_SWAP',
      metadata: { staffId, status: decisionStatus },
    },
    locale
  )
}

export async function notifyScheduledOrderEvent(quickList, action, locale = DEFAULT_LOCALE) {
  const restaurantId = quickList.restaurant_id || quickList.restaurantId
  if (!restaurantId) return null

  const listName = quickList.name
  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'SCHEDULED_ORDER',
    notificationCategory: 'SCHEDULED_ORDER',
    contentForLocale: (userLocale) => ({
      title:
        action === 'EXECUTED'
          ? nt('scheduledOrder.executedTitle', userLocale)
          : nt('scheduledOrder.reminderTitle', userLocale),
      message:
        action === 'EXECUTED'
          ? nt('scheduledOrder.executedMessage', userLocale, { name: listName })
          : nt('scheduledOrder.reminderMessage', userLocale, { name: listName }),
    }),
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

export async function notifyInvoiceIssued(invoice, locale = DEFAULT_LOCALE) {
  const sent = await notifyTenantUsers({
    tenantId: invoice.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'INVOICE',
    notificationCategory: 'invoice_issued',
    contentForLocale: (userLocale) => ({
      title: nt('invoice.issuedTitle', userLocale),
      message: nt('invoice.issuedMessage', userLocale, {
        invoiceNumber: invoice.invoice_number,
        amount: invoice.total_amount,
        dueDate: invoice.due_date,
      }),
    }),
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount },
  })
  return sent[0] || null
}

export async function notifyPaymentReceived(payment, locale = DEFAULT_LOCALE) {
  const supplierId = payment.invoice?.supplier_id
  if (!supplierId) return null

  const invoiceRef = payment.invoice_number || payment.invoice_id?.slice(0, 8)
  const sent = await notifyTenantUsers({
    tenantId: supplierId,
    tenantType: 'SUPPLIER',
    notificationType: 'PAYMENT',
    notificationCategory: 'payment_received',
    contentForLocale: (userLocale) => ({
      title: nt('payment.receivedTitle', userLocale),
      message: nt('payment.receivedMessage', userLocale, {
        amount: payment.payment_amount,
        invoiceRef,
      }),
    }),
    referenceId: payment.invoice_id,
    referenceType: 'INVOICE',
    metadata: { payment_id: payment.id, amount: payment.payment_amount },
  })
  return sent[0] || null
}

export async function notifyLowStock(product, currentStock, threshold, locale = DEFAULT_LOCALE) {
  const restaurantId = product.restaurant_id
  if (!restaurantId) return null

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'INVENTORY',
    notificationCategory: 'low_stock',
    contentForLocale: (userLocale) => ({
      title: nt('inventory.lowStockTitle', userLocale),
      message: nt('inventory.lowStockMessage', userLocale, {
        productName: product.name,
        currentStock,
        threshold,
      }),
    }),
    referenceId: product.product_id,
    referenceType: 'PRODUCT',
    metadata: { product_name: product.name, current_stock: currentStock, threshold },
  })
  return sent[0] || null
}

export async function notifyInvoiceOverdue(invoice, locale = DEFAULT_LOCALE) {
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
      contentForLocale: (userLocale) => ({
        title: nt('invoice.overdueRestaurantTitle', userLocale),
        message: nt('invoice.overdueRestaurantMessage', userLocale, {
          invoiceNumber: invoice.invoice_number,
          amount: invoice.total_amount,
          dueDate: invoice.due_date,
        }),
      }),
    }),
    notifyTenantUsers({
      tenantId: invoice.supplier_id,
      tenantType: 'SUPPLIER',
      ...payload,
      contentForLocale: (userLocale) => ({
        title: nt('invoice.overdueSupplierTitle', userLocale),
        message: nt('invoice.overdueSupplierMessage', userLocale, {
          invoiceNumber: invoice.invoice_number,
          amount: invoice.total_amount,
          dueDate: invoice.due_date,
        }),
      }),
    }),
  ])
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('notifyInvoiceOverdue failed', { err: result.reason?.message })
    }
  }
  return results
}

export async function notifyOutOfStock(
  { productId, warehouseId, productName },
  locale = DEFAULT_LOCALE
) {
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
      contentForLocale: (userLocale) => ({
        title: nt('inventory.outOfStockTitle', userLocale),
        message: nt('inventory.outOfStockMessage', userLocale, {
          productName: productName || pRows[0].name,
        }),
      }),
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

export async function notifyMessageReceived(
  { conversationId, senderType, messagePreview },
  locale = DEFAULT_LOCALE
) {
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
    senderLabel = nt('common.aRestaurant', locale)
  } else {
    tenantId = conv.restaurant_id
    tenantType = 'RESTAURANT'
    senderLabel = nt('common.aSupplier', locale)
  }
  if (!tenantId) return null

  const preview = messagePreview ? `: "${messagePreview.slice(0, 80)}"` : ''
  try {
    const sent = await notifyTenantUsers({
      tenantId,
      tenantType,
      notificationType: 'MESSAGE',
      notificationCategory: 'message_received',
      contentForLocale: (userLocale) => ({
        title: nt('message.title', userLocale),
        message: nt('message.body', userLocale, {
          senderLabel:
            senderType === 'RESTAURANT'
              ? nt('common.aRestaurant', userLocale)
              : nt('common.aSupplier', userLocale),
          preview,
        }),
      }),
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

export async function notifyDisputeOpened(dispute, locale = DEFAULT_LOCALE) {
  const supplierId = dispute.supplierId || dispute.supplier_id
  if (!supplierId) return null

  try {
    const sent = await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'DISPUTE',
      notificationCategory: 'dispute_opened',
      contentForLocale: (userLocale) => ({
        title: nt('dispute.openedTitle', userLocale),
        message: nt('dispute.openedMessage', userLocale, {
          orderId: String(dispute.orderId || dispute.order_id || '').slice(0, 8),
        }),
      }),
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
export async function notifyDealApproved(deal, { supplierName } = {}, locale = DEFAULT_LOCALE) {
  const supplierId = deal.supplier_id || deal.supplierId
  const dealId = deal.id
  const dealName = String(deal.name || nt('common.newDeal', locale))
  const supplierLabel = supplierName || deal.supplier_name || nt('common.aSupplier', locale)
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
        contentForLocale: (userLocale) => ({
          title: nt('deal.approvedTitle', userLocale, {
            supplierLabel: supplierName || deal.supplier_name || nt('common.aSupplier', userLocale),
          }),
          message: nt('deal.approvedMessage', userLocale, {
            dealName: String(deal.name || nt('common.newDeal', userLocale)),
          }),
        }),
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

export async function notifyDisputeResolved(
  dispute,
  outcome,
  { replacementOrderId = null } = {},
  locale = DEFAULT_LOCALE
) {
  const restaurantId = dispute.restaurantId || dispute.restaurant_id
  if (!restaurantId) return null

  const resolutionType = dispute.resolutionType || dispute.resolution_type
  const replacementId =
    replacementOrderId || dispute.replacementOrderId || dispute.replacement_order_id
  const notes = dispute.resolutionNotes || dispute.resolution_notes || ''

  const buildContent = (userLocale) => {
    const title =
      outcome === 'rejected'
        ? nt('dispute.rejectedTitle', userLocale)
        : nt('dispute.resolvedTitle', userLocale)
    let message
    if (outcome === 'rejected') {
      message = nt('dispute.rejectedMessage', userLocale, { notes }).trim()
    } else if (resolutionType === 'replacement' && replacementId) {
      message = nt('dispute.replacementMessage', userLocale, {
        orderId: String(replacementId).slice(0, 8),
      })
    } else {
      message = nt('dispute.resolvedMessage', userLocale, {
        resolutionType: resolutionType || 'closed',
      })
    }
    return { title, message }
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
      contentForLocale: buildContent,
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

async function notifyBillingEvent(
  tenantId,
  tenantType,
  category,
  contentForLocale,
  metadata = {},
  locale = DEFAULT_LOCALE
) {
  try {
    const billingPath = getUpgradePathForTenant(tenantType)
    const sent = await notifyTenantUsers({
      tenantId,
      tenantType,
      notificationType: 'BILLING',
      notificationCategory: category,
      contentForLocale,
      referenceType: 'SUBSCRIPTION',
      referenceId: metadata.subscriptionId || null,
      metadata: { ...metadata, ctaUrl: billingPath, link: billingPath },
    })
    return sent
  } catch (err) {
    logger.error('Billing notification failed', { err: err.message, category, tenantId })
    return []
  }
}

function billingReasonSuffix(reason, locale) {
  return reason ? nt('billing.reasonPrefix', locale, { reason }) : ''
}

export async function notifyBillingTrialStarted(
  { tenantId, tenantType, planName, trialEndsAt },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_started',
    (userLocale) => ({
      title: nt('billing.trialStartedTitle', userLocale),
      message: nt('billing.trialStartedMessage', userLocale, {
        planSuffix: planName ? nt('billing.trialStartedPlan', userLocale, { planName }) : '',
        endsSuffix: trialEndsAt ? nt('billing.trialStartedEnds', userLocale, { trialEndsAt }) : '',
      }),
    }),
    { trialEndsAt },
    locale
  )
}

export async function notifyBillingTrialEnding(
  { tenantId, tenantType, daysLeft, trialEndsAt },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_ending',
    (userLocale) => ({
      title: nt('billing.trialEndingTitle', userLocale),
      message: nt('billing.trialEndingMessage', userLocale, {
        daysLeft,
        endsSuffix: trialEndsAt ? nt('billing.trialEndingEnds', userLocale, { trialEndsAt }) : '',
      }),
    }),
    { daysLeft, trialEndsAt },
    locale
  )
}

export async function notifyBillingTrialExpired({ tenantId, tenantType }, locale = DEFAULT_LOCALE) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_expired',
    (userLocale) => ({
      title: nt('billing.trialExpiredTitle', userLocale),
      message: nt('billing.trialExpiredMessage', userLocale),
    }),
    {},
    locale
  )
}

export async function notifyBillingActivated(
  { tenantId, tenantType, planName },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_activated',
    (userLocale) => ({
      title: nt('billing.activatedTitle', userLocale),
      message: nt('billing.activatedMessage', userLocale, {
        planSuffix: planName ? nt('billing.trialStartedPlan', userLocale, { planName }) : '',
      }),
    }),
    { planName },
    locale
  )
}

export async function notifyBillingRenewed(
  { tenantId, tenantType, periodEnd },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_renewed',
    (userLocale) => ({
      title: nt('billing.renewedTitle', userLocale),
      message: nt('billing.renewedMessage', userLocale, {
        periodSuffix: periodEnd
          ? nt('billing.renewedPeriod', userLocale, { periodEnd })
          : nt('billing.renewedPeriodFallback', userLocale),
      }),
    }),
    { periodEnd },
    locale
  )
}

export async function notifyBillingPaymentFailed(
  { tenantId, tenantType, reason },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_payment_failed',
    (userLocale) => ({
      title: nt('billing.paymentFailedTitle', userLocale),
      message: nt('billing.paymentFailedMessage', userLocale, {
        reasonSuffix: billingReasonSuffix(reason, userLocale),
      }),
    }),
    { reason },
    locale
  )
}

export async function notifyBillingCancelled({ tenantId, tenantType }, locale = DEFAULT_LOCALE) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_cancelled',
    (userLocale) => ({
      title: nt('billing.cancelledTitle', userLocale),
      message: nt('billing.cancelledMessage', userLocale),
    }),
    {},
    locale
  )
}

export async function notifyBillingPlanChanged(
  { tenantId, tenantType, planName, previousPlanName },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_plan_changed',
    (userLocale) => ({
      title: nt('billing.planChangedTitle', userLocale),
      message: nt('billing.planChangedMessage', userLocale, {
        planSuffix: planName ? nt('billing.trialStartedPlan', userLocale, { planName }) : '',
        previousSuffix: previousPlanName
          ? nt('billing.planChangedPrevious', userLocale, { previousPlanName })
          : '',
      }),
    }),
    { planName, previousPlanName },
    locale
  )
}

export async function notifyBillingTrialExtended(
  { tenantId, tenantType, trialEndsAt, trialDays },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_trial_extended',
    (userLocale) => ({
      title: nt('billing.trialExtendedTitle', userLocale),
      message: nt('billing.trialExtendedMessage', userLocale, {
        daysSuffix: trialDays ? nt('billing.trialExtendedDays', userLocale, { trialDays }) : '',
        endsSuffix: trialEndsAt ? nt('billing.trialStartedEnds', userLocale, { trialEndsAt }) : '',
      }),
    }),
    { trialEndsAt, trialDays },
    locale
  )
}

export async function notifyBillingAccountLocked(
  { tenantId, tenantType, reason },
  locale = DEFAULT_LOCALE
) {
  return notifyBillingEvent(
    tenantId,
    tenantType,
    'billing_account_locked',
    (userLocale) => ({
      title: nt('billing.accountLockedTitle', userLocale),
      message: nt('billing.accountLockedMessage', userLocale, {
        reasonSuffix: billingReasonSuffix(reason, userLocale),
      }),
    }),
    { reason },
    locale
  )
}

export async function notifyDealRejected(deal, { rejectionReason } = {}, locale = DEFAULT_LOCALE) {
  const supplierId = deal.supplier_id || deal.supplierId
  if (!supplierId) return null
  const dealName = deal.name || deal.title || nt('common.promotion', locale)
  try {
    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_rejected',
      contentForLocale: (userLocale) => ({
        title: nt('deal.rejectedTitle', userLocale),
        message: nt('deal.rejectedMessage', userLocale, {
          dealName,
          reasonSuffix: rejectionReason
            ? nt('deal.rejectedReason', userLocale, { reason: rejectionReason })
            : '',
        }),
      }),
      referenceId: deal.id,
      referenceType: 'DEAL',
      metadata: { rejectionReason },
    })
  } catch (err) {
    logger.error('notifyDealRejected failed', { err: err.message, dealId: deal.id })
    return null
  }
}

export async function notifyDealSubmitted(deal, { supplierName } = {}, locale = DEFAULT_LOCALE) {
  const supplierId = deal.supplier_id || deal.supplierId
  const label = supplierName || nt('common.aSupplier', locale)
  const dealName = deal.name || deal.title
  try {
    await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_submitted',
      contentForLocale: (userLocale) => ({
        title: nt('deal.submittedSupplierTitle', userLocale),
        message: nt('deal.submittedSupplierMessage', userLocale, { dealName }),
      }),
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
        title: nt('deal.submittedAdminTitle', locale),
        message: nt('deal.submittedAdminMessage', locale, { supplierLabel: label, dealName }),
        locale,
        referenceId: deal.id,
        referenceType: 'DEAL',
        metadata: { ctaUrl: '/admin/promotions' },
      }).catch(() => {})
    }
  } catch (err) {
    logger.error('notifyDealSubmitted failed', { err: err.message, dealId: deal.id })
  }
}

export async function notifyDealExpired(deal, locale = DEFAULT_LOCALE) {
  const supplierId = deal.supplier_id || deal.supplierId
  if (!supplierId) return null
  const dealName = deal.name || deal.title || nt('common.promotion', locale)
  try {
    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'PROMOTION',
      notificationCategory: 'deal_expired',
      contentForLocale: (userLocale) => ({
        title: nt('deal.expiredTitle', userLocale),
        message: nt('deal.expiredMessage', userLocale, {
          dealName: deal.name || deal.title || nt('common.promotion', userLocale),
        }),
      }),
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
  { title, message, shiftId },
  locale = DEFAULT_LOCALE
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
        locale,
        data: { message, title, recipientName: staff.display_name, tenantName: null, locale },
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
        locale,
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

export async function notifyStaffAnnouncement(
  restaurantId,
  { title, message, announcementId },
  locale = DEFAULT_LOCALE
) {
  try {
    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'STAFF',
      notificationCategory: 'staff_announcement',
      contentForLocale: (userLocale) => ({
        title: title || nt('staff.announcementDefault', userLocale),
        message,
      }),
      referenceId: announcementId || null,
      referenceType: 'STAFF_ANNOUNCEMENT',
    })
  } catch (err) {
    logger.error('notifyStaffAnnouncement failed', { err: err.message })
    return null
  }
}

export async function notifyStaffDocumentUploaded(
  restaurantId,
  { title, message, documentId },
  locale = DEFAULT_LOCALE
) {
  try {
    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'STAFF',
      notificationCategory: 'staff_document',
      contentForLocale: (userLocale) => ({
        title: title || nt('staff.documentDefault', userLocale),
        message,
      }),
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

export async function notifyQuoteRequestReceived(
  { supplierId, quoteRequestId, quoteRequestSupplierId, restaurantId },
  locale = DEFAULT_LOCALE
) {
  try {
    const alreadySent = await hasRecentQuoteNotification({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationCategory: 'quote_request_received',
      referenceId: quoteRequestSupplierId,
    })
    if (alreadySent) return null

    const { rows } = await query(`SELECT name FROM restaurant WHERE id = $1`, [restaurantId])
    const restaurantName = rows[0]?.name || nt('common.aRestaurant', locale)

    return notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'QUOTE_REQUEST',
      notificationCategory: 'quote_request_received',
      contentForLocale: (userLocale) => ({
        title: nt('quote.requestTitle', userLocale),
        message: nt('quote.requestMessage', userLocale, {
          restaurantName: rows[0]?.name || nt('common.aRestaurant', userLocale),
        }),
      }),
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

export async function notifyQuoteResponseReceived(
  { restaurantId, quoteRequestId, quoteRequestSupplierId, supplierId },
  locale = DEFAULT_LOCALE
) {
  try {
    const alreadySent = await hasRecentQuoteNotification({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationCategory: 'quote_response_received',
      referenceId: quoteRequestSupplierId,
    })
    if (alreadySent) return null

    const { rows } = await query(`SELECT name FROM supplier WHERE id = $1`, [supplierId])
    const supplierName = rows[0]?.name || nt('common.aSupplier', locale)

    return notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'QUOTE_RESPONSE',
      notificationCategory: 'quote_response_received',
      contentForLocale: (userLocale) => ({
        title: nt('quote.responseTitle', userLocale),
        message: nt('quote.responseMessage', userLocale, {
          supplierName: rows[0]?.name || nt('common.aSupplier', userLocale),
        }),
      }),
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

export async function notifyAdminNewTenant(
  { tenantId, tenantType, tenantName, contactEmail },
  locale = DEFAULT_LOCALE
) {
  try {
    const adminIds = await listPlatformAdminUserIds(50)
    const tenantTypeLabel =
      tenantType === 'SUPPLIER'
        ? nt('admin.tenantTypeSupplier', locale)
        : nt('admin.tenantTypeRestaurant', locale)
    for (const userId of adminIds) {
      await sendNotification({
        userId,
        userType: 'ADMIN',
        notificationType: 'SYSTEM',
        notificationCategory: 'admin_new_tenant',
        title: nt('admin.newTenantTitle', locale, { tenantType: tenantTypeLabel }),
        message: nt('admin.newTenantMessage', locale, {
          tenantType: tenantTypeLabel,
          tenantName,
          emailSuffix: contactEmail ? nt('admin.newTenantEmail', locale, { contactEmail }) : '',
        }),
        locale,
        referenceId: tenantId,
        referenceType: 'TENANT',
        metadata: { tenantType, tenantName, contactEmail, ctaUrl: '/admin' },
      }).catch(() => {})
    }
  } catch (err) {
    logger.error('notifyAdminNewTenant failed', { err: err.message })
  }
}
