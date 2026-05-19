import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { sendMail } from './mailer.service.js'
import { buildWhatsAppUrl } from '../lib/whatsapp.js'
import { getEntitlements } from '../lib/subscription.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from './whatsapp.service.js'
import { sendWebPushToUser, isPushConfigured } from './push.service.js'

/**
 * Notification Service — email via Twilio SendGrid or SMTP; WhatsApp via Twilio (with wa.me fallback in metadata).
 */

const emailService = {
  async send(email, subject, html, text) {
    if (!email) return false
    try {
      await sendMail({ to: email, subject, text, html })
      return true
    } catch (error) {
      logger.error('Email send failed', { error: error.message })
      return false
    }
  },
}

const DEFAULT_NOTIFICATION_PREFS = {
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  push_enabled: false,
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
  out_of_stock: 'notify_out_of_stock',
  system_updates: 'notify_system_updates',
  promotions: 'notify_promotions',
  reservation_created: 'notify_reservation_created',
  reservation_waitlist: 'notify_reservation_waitlist',
  staff_pto: 'notify_staff_pto',
  staff_swap: 'notify_staff_swap',
  staff_clock: 'notify_staff_clock',
  staff_announcement: 'notify_staff_announcement',
  staff_document: 'notify_staff_document',
  scheduled_order: 'notify_scheduled_order',
  dispute_opened: 'notify_system_updates',
  dispute_resolved: 'notify_system_updates',
  dispute_rejected: 'notify_system_updates',
  test: 'notify_system_updates',
}

function readPref(prefs, snakeKey) {
  if (!prefs || !snakeKey) return undefined
  const camelKey = snakeKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  if (prefs[camelKey] !== undefined) return prefs[camelKey]
  return prefs[snakeKey]
}

function isPrefEnabled(prefs, snakeKey, defaultValue = true) {
  const value = readPref(prefs, snakeKey)
  if (value === undefined) return defaultValue
  return value !== false
}

function resolvePreferenceKey(notificationCategory) {
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

async function getRestaurantUserContext(restaurantId) {
  const { rows } = await query(
    `
      SELECT r.id AS restaurant_id, r.name AS restaurant_name, u.id AS user_id, u.email
      FROM restaurant r
      JOIN app_user u ON u.email = r.contact_email
      WHERE r.id = $1
    `,
    [restaurantId]
  )
  return rows[0] || null
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

function mapPreferencesRow(row) {
  if (!row) return null
  const entries = Object.entries(row).map(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    return [camelKey, value]
  })
  return Object.fromEntries(entries)
}

/**
 * Ensure notification preferences row exists for a user
 */
export async function ensureNotificationPreferences(userId, userType) {
  const { rows } = await query(
    `
      SELECT *
      FROM notification_preferences
      WHERE user_id = $1 AND user_type = $2
    `,
    [userId, userType]
  )

  if (rows.length) {
    return rows[0]
  }

  const { rows: inserted } = await query(
    `
      INSERT INTO notification_preferences (user_id, user_type)
      VALUES ($1, $2)
      ON CONFLICT (user_id, user_type)
      DO UPDATE SET updated_at = now()
      RETURNING *
    `,
    [userId, userType]
  )

  return inserted[0]
}

/**
 * Get or create notification preferences for a user
 */
export async function getUserPreferences(userId, userType) {
  const row = await ensureNotificationPreferences(userId, userType)
  return mapPreferencesRow({ ...DEFAULT_NOTIFICATION_PREFS, ...row })
}

/**
 * Get user contact information (syncs from tenant profile when missing)
 */
export async function getUserContactInfo(userId, userType) {
  const idTable = userType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const idColumn = userType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
  const contactTable = userType === 'SUPPLIER' ? 'supplier_contact_info' : 'restaurant_contact_info'

  const { rows: tenantRows } = await query(
    `
      SELECT s.id AS tenant_id, s.contact_email AS email, s.phone
      FROM ${idTable} s
      JOIN app_user u ON u.email = s.contact_email
      WHERE u.id = $1
    `,
    [userId]
  )

  if (!tenantRows.length) {
    return {
      email: null,
      phone: null,
      email_verified: false,
      phone_verified: false,
    }
  }

  const tenant = tenantRows[0]
  const { rows } = await query(`SELECT * FROM ${contactTable} WHERE ${idColumn} = $1`, [
    tenant.tenant_id,
  ])

  if (rows.length) {
    return {
      email: rows[0].email || tenant.email,
      phone: rows[0].phone || tenant.phone,
      email_verified: rows[0].email_verified ?? false,
      phone_verified: rows[0].phone_verified ?? false,
    }
  }

  if (tenant.email || tenant.phone) {
    await query(
      `
        INSERT INTO ${contactTable} (${idColumn}, email, phone, email_verified, phone_verified)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (${idColumn}) DO UPDATE
        SET email = COALESCE(EXCLUDED.email, ${contactTable}.email),
            phone = COALESCE(EXCLUDED.phone, ${contactTable}.phone),
            updated_at = now()
      `,
      [tenant.tenant_id, tenant.email, tenant.phone, !!tenant.email, !!tenant.phone]
    )
  }

  return {
    email: tenant.email || null,
    phone: tenant.phone || null,
    email_verified: !!tenant.email,
    phone_verified: !!tenant.phone,
  }
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

/**
 * Look up the tenant (restaurant/supplier) ID for a given app_user ID.
 */
async function getTenantIdForUser(userId, userType) {
  const table = userType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `SELECT s.id AS tenant_id
     FROM ${table} s
     JOIN app_user u ON u.email = s.contact_email
     WHERE u.id = $1`,
    [userId]
  )
  return rows[0]?.tenant_id || null
}

/**
 * Send a notification to a user
 */
export async function sendNotification({
  userId,
  userType,
  notificationType,
  notificationCategory,
  title,
  message,
  referenceId = null,
  referenceType = null,
  metadata = null,
}) {
  try {
    // Get user preferences
    const prefs = await getUserPreferences(userId, userType)
    const contact = await getUserContactInfo(userId, userType)

    // Tier enforcement: derive allowed channels from subscription plan
    let allowedChannels = new Set(['in_app']) // safe default
    try {
      const tenantId = await getTenantIdForUser(userId, userType)
      if (tenantId) {
        const entitlements = await getEntitlements(tenantId, userType)
        allowedChannels = resolveAllowedChannels(entitlements?.features?.notifications)
      }
    } catch (err) {
      logger.warn('Failed to resolve notification tier, defaulting to in_app', { err: err.message })
    }

    const channels = {
      email:
        allowedChannels.has('email') && isPrefEnabled(prefs, 'email_enabled') && !!contact?.email,
      whatsapp:
        allowedChannels.has('whatsapp') &&
        isPrefEnabled(prefs, 'whatsapp_enabled') &&
        !!contact?.phone,
      sms: false,
      push: isPushConfigured() && isPrefEnabled(prefs, 'push_enabled', false),
      inApp: isPrefEnabled(prefs, 'in_app_enabled'),
    }

    const preferenceKey = resolvePreferenceKey(notificationCategory)
    const shouldSend = preferenceKey ? isPrefEnabled(prefs, preferenceKey) : true
    if (!shouldSend) {
      logger.info('Notification skipped due to user preference', { userId, notificationCategory })
      return null
    }

    // Log notification
    const {
      rows: [notification],
    } = await query(
      `
      INSERT INTO notification_log (
        user_id, user_type, notification_type, notification_category,
        title, message, reference_id, reference_type, metadata,
        email_sent, sms_sent, push_sent, in_app_sent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        userId,
        userType,
        notificationType,
        notificationCategory,
        title,
        message,
        referenceId || null,
        referenceType || null,
        metadata ? JSON.stringify(metadata) : null,
        !!channels.email, // Convert to boolean
        !!channels.sms, // Convert to boolean
        !!channels.push, // Convert to boolean
        !!channels.inApp, // Convert to boolean
      ]
    )

    const results = {
      email: false,
      sms: false,
      push: false,
      inApp: true,
    }

    const metadataPayload = metadata && typeof metadata === 'object' ? { ...metadata } : {}

    if (channels.email && contact?.email) {
      try {
        results.email = await emailService.send(contact.email, title, null, message)
      } catch (error) {
        logger.error('Email send failed', { error: error.message })
      }
    }

    if (channels.whatsapp && contact?.phone) {
      const waResult = await sendWhatsAppMessageService({ to: contact.phone, message })
      results.sms = waResult.sent
      // Store deep link in metadata for in-app display
      const whatsappUrl = buildWhatsAppUrl(contact.phone, message)
      if (whatsappUrl) metadataPayload.whatsappUrl = whatsappUrl
    }

    if (Object.keys(metadataPayload).length) {
      await query(`UPDATE notification_log SET metadata = $1 WHERE id = $2`, [
        JSON.stringify(metadataPayload),
        notification.id,
      ])
    }

    if (channels.push) {
      const pushUrl =
        referenceType === 'DISPUTE'
          ? `/app/disputes/${referenceId}`
          : referenceType === 'ORDER'
            ? `/app/orders/${referenceId}`
            : '/app/notifications'
      sendWebPushToUser({
        userId,
        title,
        message,
        referenceId,
        referenceType,
        url: pushUrl,
      })
        .then((pushResult) => {
          if (pushResult?.sent > 0) {
            query(`UPDATE notification_log SET push_sent = true WHERE id = $1`, [
              notification.id,
            ]).catch(() => {})
          }
        })
        .catch((error) => {
          logger.error('Push send failed', { error: error.message })
        })
    }

    // Update notification log with actual send results
    await query(
      `
      UPDATE notification_log
      SET email_sent = $1, sms_sent = $2, push_sent = $3
      WHERE id = $4
    `,
      [results.email, results.sms, results.push, notification.id]
    )

    logger.info('Notification sent', {
      userId,
      notificationType,
      notificationCategory,
      channels: results,
    })

    return notification
  } catch (error) {
    logger.error('Failed to send notification', {
      error: error.message,
      userId,
      notificationCategory,
    })
    throw error
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId) {
  await query(
    `
    UPDATE notification_log
    SET is_read = true, read_at = now()
    WHERE id = $1
  `,
    [notificationId]
  )
}

/**
 * Get user's notifications
 */
export async function getUserNotifications(
  userId,
  userType,
  { limit = 50, offset = 0, unreadOnly = false }
) {
  let whereClause = 'user_id = $1 AND user_type = $2'
  const params = [userId, userType]
  let paramIndex = 3

  if (unreadOnly) {
    whereClause += ` AND is_read = false`
  }

  const { rows } = await query(
    `
    SELECT *
    FROM notification_log
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...params, limit, offset]
  )

  // Get unread count
  const { rows: countRows } = await query(
    `
    SELECT COUNT(*) as count
    FROM notification_log
    WHERE user_id = $1 AND user_type = $2 AND is_read = false
  `,
    [userId, userType]
  )

  return {
    notifications: rows,
    unreadCount: parseInt(countRows[0].count, 10),
  }
}

export async function sendWhatsAppMessage(phone, message) {
  if (!phone) {
    throw new Error('WhatsApp phone is required')
  }
  return buildWhatsAppUrl(phone, message)
}

function formatReservationTime(scheduledAt) {
  if (!scheduledAt) return 'your scheduled time'
  return new Date(scheduledAt).toLocaleString()
}

/**
 * Notify a guest about their reservation (email and/or WhatsApp based on contact provided).
 */
export async function notifyGuestReservationConfirmation(reservation, restaurantName) {
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const customerPhone = reservation.customer_phone || reservation.customerPhone || null
  const customerEmail = reservation.customer_email || reservation.customerEmail || null
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || 'CONFIRMED'
  const venue = restaurantName || 'the restaurant'

  if (!customerPhone && !customerEmail) {
    return { email: false, whatsapp: false }
  }

  const timeLabel = formatReservationTime(scheduledAt)
  const title =
    status === 'WAITLIST' ? `Waitlist update at ${venue}` : `Reservation confirmed at ${venue}`
  const message =
    status === 'WAITLIST'
      ? `Hi ${customerName}, you're on the waitlist at ${venue} for ${partySize} guests around ${timeLabel}. We'll message you when a table opens.`
      : `Hi ${customerName}, your table for ${partySize} at ${venue} is confirmed for ${timeLabel}. See you soon!`

  const results = { email: false, whatsapp: false }

  if (customerEmail) {
    try {
      await emailService.send(customerEmail, title, null, message)
      results.email = true
    } catch (error) {
      logger.error('Guest reservation email failed', { error: error.message })
    }
  }

  if (customerPhone) {
    const guestWhatsAppUrl = buildWhatsAppUrl(customerPhone, message)
    if (guestWhatsAppUrl) {
      results.whatsapp = true
      results.whatsappUrl = guestWhatsAppUrl
    }
  }

  return results
}

/**
 * Notify supplier when their warehouse/product stock is low.
 * Call after creating an inventory_alert (e.g. from inventory adjustment).
 */
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
    return await sendNotification({
      userId,
      userType: 'SUPPLIER',
      notificationType: 'LOW_STOCK',
      notificationCategory: 'inventory_alerts',
      title: 'Low stock alert',
      message,
      referenceId: productId,
      referenceType: 'PRODUCT',
      metadata: { productId, warehouseId, threshold, currentValue },
    })
  } catch (err) {
    logger.error('notifySupplierLowStock failed', { error: err.message, productId })
    return null
  }
}

/**
 * Helper functions for common notification types
 */

export async function notifyOrderStatusChange(order, status) {
  // Determine who to notify
  let userId, userType

  if (status === 'PLACED' || status === 'CANCELLED') {
    // Notify supplier for new orders and cancellations
    // Get supplier's Keycloak user ID from contact_email
    const { rows: suppliers } = await query(
      `
      SELECT s.id as supplier_id, u.id as user_id 
      FROM supplier s
      JOIN app_user u ON u.email = s.contact_email
      WHERE s.id = $1
    `,
      [order.supplier_id]
    )

    if (suppliers.length > 0 && suppliers[0].user_id) {
      userId = suppliers[0].user_id
      userType = 'SUPPLIER'
    } else {
      logger.warn('No user_id found for supplier', { supplier_id: order.supplier_id })
      return null
    }
  } else {
    // All other statuses (ACKNOWLEDGED, PROCESSING, SHIPPED, DELIVERED) notify restaurant
    // Get restaurant's Keycloak user ID from contact_email
    const { rows: restaurants } = await query(
      `
      SELECT r.id as restaurant_id, u.id as user_id 
      FROM restaurant r
      JOIN app_user u ON u.email = r.contact_email
      WHERE r.id = $1
    `,
      [order.restaurant_id]
    )

    if (restaurants.length > 0 && restaurants[0].user_id) {
      userId = restaurants[0].user_id
      userType = 'RESTAURANT'
    } else {
      logger.warn('No user_id found for restaurant', { restaurant_id: order.restaurant_id })
      return null
    }
  }

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
  }

  const msg = messages[status]
  if (!msg) return

  return sendNotification({
    userId,
    userType,
    notificationType: 'ORDER',
    notificationCategory: status,
    title: msg.title,
    message: msg.message,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: { order_id: order.id, status },
  })
}

export async function notifyReservationCreated(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const context = await getRestaurantUserContext(restaurantId)
  if (!context?.user_id) return null

  const timeslot = scheduledAt ? new Date(scheduledAt).toLocaleString() : 'unscheduled time'
  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
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
}

export async function notifyReservationWaitlist(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId
  const branchId = reservation.branch_id || reservation.branchId || null
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || reservation.reservationStatus

  const context = await getRestaurantUserContext(restaurantId)
  if (!context?.user_id) return null

  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
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
}

export async function notifyStaffPtoRequest(ptoRequest) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId
  const staffContext = await getStaffMemberContext(staffId)
  if (!staffContext) return null
  const restaurantContext = await getRestaurantUserContext(staffContext.restaurant_id)
  if (!restaurantContext?.user_id) return null

  const startDate = ptoRequest.start_date || ptoRequest.startDate
  const endDate = ptoRequest.end_date || ptoRequest.endDate
  const type = ptoRequest.type || ptoRequest.requestType || 'PTO'
  const status = ptoRequest.status || ptoRequest.requestStatus
  const dateRange = `${startDate} → ${endDate}`
  return sendNotification({
    userId: restaurantContext.user_id,
    userType: 'RESTAURANT',
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
}

export async function notifyStaffSwapRequest(swap) {
  const requestedBy = swap.requested_by || swap.requestedBy
  const restaurantId = swap.restaurant_id || swap.restaurantId
  const shift = swap.shift || {}

  const staffContext = await getStaffMemberContext(requestedBy)
  if (!staffContext) return null

  const restaurantContext = await getRestaurantUserContext(
    restaurantId || staffContext.restaurant_id
  )
  if (!staffContext) return null
  if (!restaurantContext?.user_id) return null

  const shiftDate = shift.date || swap.shift_date || 'upcoming shift'

  return sendNotification({
    userId: restaurantContext.user_id,
    userType: 'RESTAURANT',
    notificationType: 'STAFF_SWAP_REQUEST',
    notificationCategory: 'STAFF_SWAP',
    title: 'Shift swap requested',
    message: `${staffContext.display_name || 'Team member'} requested a swap for ${shiftDate}`,
    referenceId: swap.id || swap.swapId,
    referenceType: 'STAFF_SWAP',
    metadata: {
      staffId: staffContext.id,
      restaurantId: restaurantId || staffContext.restaurant_id,
      shiftId: swap.shift_id || shift.id,
      status: swap.status,
    },
  })
}

export async function notifyScheduledOrderEvent(quickList, action) {
  const restaurantId = quickList.restaurant_id || quickList.restaurantId
  const context = await getRestaurantUserContext(restaurantId)
  if (!context?.user_id) return null

  const autoMessage =
    action === 'EXECUTED'
      ? `Scheduled order "${quickList.name}" has been created automatically.`
      : `Scheduled order "${quickList.name}" will run soon. Review inventory if you need to pause it.`

  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
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
}

export async function notifyInvoiceIssued(invoice) {
  // Notify restaurant
  return sendNotification({
    userId: invoice.restaurant_id,
    userType: 'RESTAURANT',
    notificationType: 'INVOICE',
    notificationCategory: 'invoice_issued',
    title: 'Invoice Issued',
    message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} due ${invoice.due_date}`,
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount },
  })
}

export async function notifyPaymentReceived(payment) {
  // Notify supplier when payment is received
  // Note: payment object should contain invoice with supplier_id
  if (payment.invoice?.supplier_id) {
    return sendNotification({
      userId: payment.invoice.supplier_id,
      userType: 'SUPPLIER',
      notificationType: 'PAYMENT',
      notificationCategory: 'payment_received',
      title: 'Payment Received',
      message: `Payment of $${payment.payment_amount} received for invoice ${payment.invoice_number || payment.invoice_id.slice(0, 8)}`,
      referenceId: payment.invoice_id,
      referenceType: 'INVOICE',
      metadata: { payment_id: payment.id, amount: payment.payment_amount },
    })
  }
}

export async function notifyLowStock(product, currentStock, threshold) {
  return sendNotification({
    userId: product.restaurant_id,
    userType: 'RESTAURANT',
    notificationType: 'INVENTORY',
    notificationCategory: 'low_stock',
    title: 'Low Stock Alert',
    message: `${product.name} is below threshold. Current: ${currentStock}, Threshold: ${threshold}`,
    referenceId: product.product_id,
    referenceType: 'PRODUCT',
    metadata: { product_name: product.name, current_stock: currentStock, threshold },
  })
}

export async function notifyInvoiceOverdue(invoice) {
  const promises = []
  const { rows: rRows } = await query(
    `SELECT u.id FROM app_user u JOIN restaurant r ON r.contact_email = u.email WHERE r.id = $1`,
    [invoice.restaurant_id]
  )
  if (rRows.length > 0) {
    promises.push(
      sendNotification({
        userId: rRows[0].id,
        userType: 'RESTAURANT',
        notificationType: 'INVOICE',
        notificationCategory: 'invoice_overdue',
        title: 'Invoice Overdue',
        message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} was due on ${invoice.due_date} and is now overdue.`,
        referenceId: invoice.id,
        referenceType: 'INVOICE',
        metadata: { invoice_number: invoice.invoice_number, due_date: invoice.due_date },
      }).catch((err) =>
        logger.error('notifyInvoiceOverdue restaurant failed', { err: err.message })
      )
    )
  }
  const { rows: sRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [invoice.supplier_id]
  )
  if (sRows.length > 0) {
    promises.push(
      sendNotification({
        userId: sRows[0].id,
        userType: 'SUPPLIER',
        notificationType: 'INVOICE',
        notificationCategory: 'invoice_overdue',
        title: 'Payment Overdue',
        message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} is overdue since ${invoice.due_date}.`,
        referenceId: invoice.id,
        referenceType: 'INVOICE',
        metadata: { invoice_number: invoice.invoice_number, due_date: invoice.due_date },
      }).catch((err) => logger.error('notifyInvoiceOverdue supplier failed', { err: err.message }))
    )
  }
  return Promise.allSettled(promises)
}

export async function notifyOutOfStock({ productId, warehouseId, productName }) {
  const { rows: pRows } = await query(
    `SELECT p.name, p.supplier_id FROM product p WHERE p.id = $1`,
    [productId]
  )
  if (!pRows.length) return null
  const { rows: uRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [pRows[0].supplier_id]
  )
  if (!uRows.length) return null
  return sendNotification({
    userId: uRows[0].id,
    userType: 'SUPPLIER',
    notificationType: 'OUT_OF_STOCK',
    notificationCategory: 'out_of_stock',
    title: 'Out of Stock',
    message: `${productName || pRows[0].name} is now out of stock.`,
    referenceId: productId,
    referenceType: 'PRODUCT',
    metadata: { productId, warehouseId },
  }).catch((err) => {
    logger.error('notifyOutOfStock failed', { err: err.message })
    return null
  })
}

export async function notifyMessageReceived({ conversationId, senderType, messagePreview }) {
  const { rows: cRows } = await query(
    `SELECT supplier_id, restaurant_id FROM conversation WHERE id = $1`,
    [conversationId]
  )
  if (!cRows.length) return null
  const conv = cRows[0]
  let recipientUserId
  let recipientType
  let senderLabel
  if (senderType === 'RESTAURANT') {
    const { rows } = await query(
      `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
      [conv.supplier_id]
    )
    if (!rows.length) return null
    recipientUserId = rows[0].id
    recipientType = 'SUPPLIER'
    senderLabel = 'A restaurant'
  } else {
    const { rows } = await query(
      `SELECT u.id FROM app_user u JOIN restaurant r ON r.contact_email = u.email WHERE r.id = $1`,
      [conv.restaurant_id]
    )
    if (!rows.length) return null
    recipientUserId = rows[0].id
    recipientType = 'RESTAURANT'
    senderLabel = 'A supplier'
  }
  const preview = messagePreview ? `: "${messagePreview.slice(0, 80)}"` : ''
  return sendNotification({
    userId: recipientUserId,
    userType: recipientType,
    notificationType: 'MESSAGE',
    notificationCategory: 'message_received',
    title: 'New message',
    message: `${senderLabel} sent you a message${preview}`,
    referenceId: conversationId,
    referenceType: 'CONVERSATION',
    metadata: { conversationId },
  }).catch((err) => {
    logger.error('notifyMessageReceived failed', { err: err.message })
    return null
  })
}
