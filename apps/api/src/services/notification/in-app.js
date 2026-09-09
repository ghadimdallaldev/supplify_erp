import { query } from '../../lib/db.js'
import { getCache, setCache, deleteCache, deleteCacheByPrefix } from '../../lib/cache.js'
import { singleflight } from '../../lib/singleflight.js'
import { mapWithConcurrency } from '../../lib/concurrency.js'
import { logger } from '../../lib/logger.js'
import { getEntitlements, isFeatureEnabled } from '../../lib/subscription.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from '../whatsapp.service.js'
import { emitNotificationNew } from '../../lib/socket.js'
import { emailService } from './email.js'
import { dispatchPushNotification, isPushConfigured } from './push.js'
import { dispatchNotificationWebhook } from './webhook.js'
import { fetchUserLocales, resolveLocale, DEFAULT_LOCALE } from '../../i18n/index.js'
import {
  DEFAULT_NOTIFICATION_PREFS,
  isPrefEnabled,
  resolvePreferenceKey,
  resolveAllowedChannels,
} from './templates.js'

/**
 * Notification Service — in-app delivery, preferences, and orchestration.
 */

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
 * Look up the tenant (restaurant/supplier) ID for a given app_user ID.
 */
async function getTenantIdForUser(userId, userType) {
  const table = userType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `SELECT s.id AS tenant_id
     FROM ${table} s
     JOIN app_user u ON u.email = s.contact_email
     WHERE u.id = $1
     UNION
     SELECT tur.tenant_id
     FROM tenant_user_roles tur
     WHERE tur.user_id = $1 AND tur.tenant_type = $2
     LIMIT 1`,
    [userId, userType]
  )
  return rows[0]?.tenant_id || null
}

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

/** Max parallel sendNotification calls per tenant fan-out. */
export const NOTIFY_TENANT_USERS_CONCURRENCY = 5

/**
 * Fan-out in-app / push / email to every user on the tenant account.
 * Returns the sent notification rows; array also carries recipientCount, failedCount, durationMs.
 */
export async function notifyTenantUsers({
  tenantId,
  tenantType,
  notificationType,
  notificationCategory,
  title,
  message,
  contentForLocale = null,
  referenceId = null,
  referenceType = null,
  metadata = null,
  concurrency = NOTIFY_TENANT_USERS_CONCURRENCY,
}) {
  const userIds = await listTenantUserIds(tenantId, tenantType)
  if (!userIds.length) {
    logger.warn('notifyTenantUsers: no recipients', { tenantId, tenantType, notificationCategory })
    const empty = []
    Object.assign(empty, { recipientCount: 0, failedCount: 0, durationMs: 0 })
    return empty
  }

  const startedAt = performance.now()
  const localesByUser = await fetchUserLocales(userIds)
  const results = await mapWithConcurrency(userIds, concurrency, async (userId) => {
    try {
      const locale = localesByUser.get(userId) || DEFAULT_LOCALE
      const localized = contentForLocale ? contentForLocale(locale) : { title, message }
      const row = await sendNotification({
        userId,
        userType: tenantType,
        notificationType,
        notificationCategory,
        title: localized.title,
        message: localized.message,
        locale,
        referenceId,
        referenceType,
        metadata,
      })
      return { ok: true, row }
    } catch (error) {
      logger.error('notifyTenantUsers: recipient failed', {
        userId,
        tenantId,
        notificationCategory,
        error: error.message,
      })
      return { ok: false, row: null }
    }
  })

  const sent = []
  let failedCount = 0
  for (const result of results) {
    if (result?.ok && result.row) {
      sent.push(result.row)
    } else if (result && !result.ok) {
      failedCount += 1
    }
  }

  const durationMs = Math.round(performance.now() - startedAt)
  Object.assign(sent, {
    recipientCount: userIds.length,
    failedCount,
    durationMs,
  })

  logger.info({
    event: 'notification.tenant_users.complete',
    tenantId,
    tenantType,
    notificationCategory,
    recipientCount: userIds.length,
    sentCount: sent.length,
    failedCount,
    durationMs,
  })

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
  locale = null,
  referenceId = null,
  referenceType = null,
  metadata = null,
}) {
  try {
    const resolvedLocale = resolveLocale(locale || DEFAULT_LOCALE)
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

    const metadataPayload = metadata && typeof metadata === 'object' ? { ...metadata } : {}

    const channels = {
      email:
        !metadataPayload.skipEmail &&
        allowedChannels.has('email') &&
        isPrefEnabled(prefs, 'email_enabled') &&
        !!contact?.email,
      whatsapp:
        !metadataPayload.skipWhatsapp &&
        allowedChannels.has('whatsapp') &&
        isPrefEnabled(prefs, 'whatsapp_enabled') &&
        !!contact?.phone,
      sms: false,
      push: isPushConfigured() && isPrefEnabled(prefs, 'push_enabled', false) && pushFeatureEnabled,
      inApp: isPrefEnabled(prefs, 'in_app_enabled'),
      webhook: allowedChannels.has('webhook'),
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
        email_sent, sms_sent, push_sent, in_app_sent, whatsapp_sent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        !!channels.whatsapp, // Convert to boolean
      ]
    )

    const results = {
      email: false,
      sms: false,
      whatsapp: false,
      push: false,
      inApp: true,
    }

    if (metadataPayload.skipEmail) {
      delete metadataPayload.skipEmail
    }
    if (metadataPayload.skipWhatsapp) {
      delete metadataPayload.skipWhatsapp
    }

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
          locale: resolvedLocale,
        })
      } catch (error) {
        logger.error('Email send failed', { error: error.message })
      }
    }

    if (channels.whatsapp && contact?.phone) {
      const waResult = await sendWhatsAppMessageService({
        to: contact.phone,
        message,
        tenantId,
        eventType: notificationCategory || 'notification',
      })
      results.whatsapp = waResult.sent
    }

    if (Object.keys(metadataPayload).length) {
      await query(`UPDATE notification_log SET metadata = $1 WHERE id = $2`, [
        JSON.stringify(metadataPayload),
        notification.id,
      ])
    }

    if (channels.push) {
      dispatchPushNotification({
        userId,
        title,
        message,
        referenceId,
        referenceType,
        notificationId: notification.id,
      })
    }

    // Outbound webhook for eligible plans; best-effort, does not block the request.
    if (channels.webhook && tenantId) {
      dispatchNotificationWebhook({
        tenantId,
        tenantType: userType,
        notification: { ...notification, notification_category: notificationCategory },
      }).catch((err) => logger.warn('Notification webhook dispatch failed', { error: err.message }))
    }

    // Update notification log with actual send results
    await query(
      `
      UPDATE notification_log
      SET email_sent = $1, sms_sent = $2, push_sent = $3, whatsapp_sent = $4
      WHERE id = $5
    `,
      [results.email, results.sms, results.push, results.whatsapp, notification.id]
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

    await invalidateUserNotificationsListCache(userId, userType).catch(() => {})

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

const NOTIFICATION_LIST_CACHE_TTL_SECONDS = 25

const NOTIFICATION_LIST_COLUMNS = `
  id, user_id, user_type, title, message, notification_type, notification_category,
  reference_id, reference_type, metadata, is_read, read_at, created_at
`.trim()

export function notificationListCacheKey(userId, userType, limit, offset, unreadOnly) {
  return `notif:list:${userId}:${userType}:${limit}:${offset}:${unreadOnly ? '1' : '0'}`
}

export function notificationUnreadCacheKey(userId, userType) {
  return `notif:unread:${userId}:${userType}`
}

export async function invalidateUserNotificationsListCache(userId, userType = null) {
  if (!userId) return
  const userTypes = userType ? [userType] : ['RESTAURANT', 'SUPPLIER', 'ADMIN', 'PENDING']
  await Promise.all(
    userTypes.flatMap((type) => [
      deleteCache(notificationUnreadCacheKey(userId, type)).catch(() => {}),
      // Prefix clears all limit/offset/unreadOnly list pages for this user
      deleteCacheByPrefix(`notif:list:${userId}:${type}:`).catch(() => {}),
    ])
  )
}

const NOTIFICATION_UNREAD_CACHE_TTL_SECONDS = 30

/**
 * Lightweight unread count for badge polling (no list payload).
 */
export async function getUnreadNotificationCount(userId, userType) {
  const cacheKey = notificationUnreadCacheKey(userId, userType)
  const cached = await getCache(cacheKey)
  if (cached !== null && typeof cached === 'object' && typeof cached.unreadCount === 'number') {
    return cached
  }

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null && typeof again === 'object' && typeof again.unreadCount === 'number') {
      return again
    }

    const { rows } = await query(
      `
    SELECT COUNT(*)::int AS count
    FROM notification_log
    WHERE user_id = $1 AND user_type = $2 AND is_read = false
  `,
      [userId, userType]
    )

    const result = { unreadCount: rows[0]?.count ?? 0 }
    await setCache(cacheKey, result, NOTIFICATION_UNREAD_CACHE_TTL_SECONDS).catch(() => {})
    return result
  })
}

/**
 * Get user's notifications
 */
export async function getUserNotifications(
  userId,
  userType,
  { limit = 50, offset = 0, unreadOnly = false }
) {
  const cacheKey = notificationListCacheKey(userId, userType, limit, offset, unreadOnly)
  const cached = await getCache(cacheKey)
  if (cached && typeof cached === 'object' && Array.isArray(cached.notifications)) {
    return cached
  }

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again && typeof again === 'object' && Array.isArray(again.notifications)) {
      return again
    }

    let whereClause = 'user_id = $1 AND user_type = $2'
    const params = [userId, userType]
    let paramIndex = 3

    if (unreadOnly) {
      whereClause += ` AND is_read = false`
    }

    const listQuery = query(
      `
    SELECT ${NOTIFICATION_LIST_COLUMNS}
    FROM notification_log
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
      [...params, limit, offset]
    )

    // Share unread cache/singleflight with GET /notifications/unread-count
    const [{ rows }, unread] = await Promise.all([
      listQuery,
      getUnreadNotificationCount(userId, userType),
    ])

    const result = {
      notifications: rows,
      unreadCount: unread.unreadCount ?? 0,
    }

    await setCache(cacheKey, result, NOTIFICATION_LIST_CACHE_TTL_SECONDS).catch(() => {})
    return result
  })
}
