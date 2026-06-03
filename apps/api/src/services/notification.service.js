import { query } from '../lib/db.js'
import { getCache, setCache, deleteCache } from '../lib/cache.js'
import { logger } from '../lib/logger.js'
import { buildWhatsAppUrl } from '../lib/whatsapp.js'
import { getEntitlements, isFeatureEnabled } from '../lib/subscription.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from './whatsapp.service.js'
import { sendWebPushToUser, isPushConfigured } from './push.service.js'
import { emitNotificationNew } from '../lib/socket.js'
import { sendTemplateEmail } from './email/email.service.js'
import {
  buildNotificationEventKey,
  resolveNotificationTemplate,
} from './email/template-resolver.js'

/**
 * Notification Service — email via email.service (SMTP/SendGrid); WhatsApp via Twilio.
 */

const emailService = {
  async send({
    email,
    subject,
    message,
    notificationType,
    notificationCategory,
    referenceId,
    referenceType,
    metadata,
    userId,
    tenantId,
  }) {
    if (!email) return false
    try {
      const template = resolveNotificationTemplate(notificationCategory, notificationType)
      const eventKey = buildNotificationEventKey({
        notificationCategory,
        referenceType,
        referenceId,
        userId,
        tenantId,
      })
      const result = await sendTemplateEmail({
        to: email,
        template,
        subject,
        data: {
          title: subject,
          message,
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
        },
        tenantId,
        eventType: notificationCategory || notificationType || 'notification',
        eventKey,
        entityId: referenceId,
      })
      return Boolean(result.sent || result.logOnly || result.preview)
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

const NOTIFICATION_PREFS_CACHE_TTL = 180

function notificationPrefsCacheKey(userId, userType) {
  return `prefs:${userId}:${userType}`
}

export async function invalidateNotificationPreferencesCache(userId, userType) {
  await deleteCache(notificationPrefsCacheKey(userId, userType)).catch(() => {})
}

/**
 * Ensure notification preferences row exists for a user
 */
export async function ensureNotificationPreferences(userId, userType) {
  const cacheKey = notificationPrefsCacheKey(userId, userType)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached

  const { rows } = await query(
    `
      SELECT *
      FROM notification_preferences
      WHERE user_id = $1 AND user_type = $2
    `,
    [userId, userType]
  )

  if (rows.length) {
    await setCache(cacheKey, rows[0], NOTIFICATION_PREFS_CACHE_TTL).catch(() => {})
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

  await setCache(cacheKey, inserted[0], NOTIFICATION_PREFS_CACHE_TTL).catch(() => {})
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
 * All app users for a restaurant or supplier (team roles + primary contact).
 */
export async function listTenantUserIds(tenantId, tenantType) {
  if (!tenantId || !tenantType) return []
  const tenantTable = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `
      SELECT DISTINCT u.id
      FROM app_user u
      WHERE u.id IN (
        SELECT tur.user_id
        FROM tenant_user_roles tur
        WHERE tur.tenant_id = $1 AND tur.tenant_type = $2
      )
      OR u.email = (
        SELECT contact_email FROM ${tenantTable} WHERE id = $1 LIMIT 1
      )
    `,
    [tenantId, tenantType]
  )
  return rows.map((row) => row.id).filter(Boolean)
}

/**
 * Fan-out in-app / push / email to every user on the tenant account.
 */
export async function notifyTenantUsers({
  tenantId,
  tenantType,
  notificationType,
  notificationCategory,
  title,
  message,
  referenceId = null,
  referenceType = null,
  metadata = null,
}) {
  const userIds = await listTenantUserIds(tenantId, tenantType)
  if (!userIds.length) {
    logger.warn('notifyTenantUsers: no recipients', { tenantId, tenantType, notificationCategory })
    return []
  }

  const sent = []
  for (const userId of userIds) {
    try {
      const row = await sendNotification({
        userId,
        userType: tenantType,
        notificationType,
        notificationCategory,
        title,
        message,
        referenceId,
        referenceType,
        metadata,
      })
      if (row) sent.push(row)
    } catch (error) {
      logger.error('notifyTenantUsers: recipient failed', {
        userId,
        tenantId,
        notificationCategory,
        error: error.message,
      })
    }
  }
  return sent
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
    let tenantId = null
    let pushFeatureEnabled = false
    try {
      tenantId = await getTenantIdForUser(userId, userType)
      if (tenantId) {
        const entitlements = await getEntitlements(tenantId, userType)
        allowedChannels = resolveAllowedChannels(entitlements?.features?.notifications)
        pushFeatureEnabled = await isFeatureEnabled(tenantId, userType, 'push_notifications')
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
      push: isPushConfigured() && isPrefEnabled(prefs, 'push_enabled', false) && pushFeatureEnabled,
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
        results.email = await emailService.send({
          email: contact.email,
          subject: title,
          message,
          notificationType,
          notificationCategory,
          referenceId,
          referenceType,
          metadata: metadataPayload,
          userId,
          tenantId,
        })
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
            : referenceType === 'RESERVATION'
              ? '/app/reservations'
              : referenceType === 'INVOICE'
                ? '/app/invoices'
                : referenceType === 'CONVERSATION' || referenceType === 'CHAT'
                  ? '/app/chat'
                  : referenceType === 'QUICK_LIST'
                    ? '/app/quick-lists'
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

    if (channels.inApp) {
      emitNotificationNew({ ...notification, user_id: userId })
    }

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
      const template = status === 'WAITLIST' ? 'reservation.waitlist' : 'reservation.confirmation'
      const result = await sendTemplateEmail({
        to: customerEmail,
        template,
        subject: title,
        data: { title, message, tenantName: venue },
        eventType: 'guest_reservation',
        eventKey: `reservation:guest:${reservation.id}:${status}`,
        entityId: reservation.id,
        skipDedup: false,
      })
      results.email = Boolean(result.sent || result.logOnly || result.preview)
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

  if (!staffContext) return null

  const shiftDate = shift.date || swap.shift_date || 'upcoming shift'
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
    const followerIds = new Set(followers.map((r) => r.restaurant_id))

    const { rows: nonFollowers } = await query(
      `
      SELECT id AS restaurant_id
      FROM restaurant r
      WHERE r.id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM supplier_follow sf
          WHERE sf.supplier_id = $1 AND sf.restaurant_id = r.id
        )
      `,
      [supplierId]
    )

    let followerCount = 0
    let nonFollowerCount = 0

    for (const { restaurant_id: restaurantId } of followers) {
      await notifyTenantUsers({
        tenantId: restaurantId,
        tenantType: 'RESTAURANT',
        notificationType: 'PROMOTION',
        notificationCategory: 'promotions',
        title: `New deal from ${supplierLabel}`,
        message: `${dealName} is now available. Open Deals to view and redeem.`,
        referenceId: dealId,
        referenceType: 'DEAL',
        metadata: { link, dealId, supplierId, audience: 'follower' },
      })
      followerCount += 1
    }

    for (const { restaurant_id: restaurantId } of nonFollowers) {
      if (followerIds.has(restaurantId)) continue
      await notifyTenantUsers({
        tenantId: restaurantId,
        tenantType: 'RESTAURANT',
        notificationType: 'PROMOTION',
        notificationCategory: 'promotions',
        title: `New deal on Supplify`,
        message: `${supplierLabel} published "${dealName}". Open Deals to explore.`,
        referenceId: dealId,
        referenceType: 'DEAL',
        metadata: { link, dealId, supplierId, audience: 'non_follower' },
      })
      nonFollowerCount += 1
    }

    logger.info('notifyDealApproved completed', {
      dealId,
      supplierId,
      followerCount,
      nonFollowerCount,
    })
    return { followers: followerCount, nonFollowers: nonFollowerCount }
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
