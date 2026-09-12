import webpush from 'web-push'
import { Expo } from 'expo-server-sdk'
import { config } from '../config/env.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

const _expo = new Expo()

let vapidConfigured = false

function isValidVapidValue(value) {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed === 'CHANGE_ME' || trimmed.startsWith('CHANGE_')) return false
  return true
}

function getVapidConfig() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = config
  if (
    !isValidVapidValue(VAPID_PUBLIC_KEY) ||
    !isValidVapidValue(VAPID_PRIVATE_KEY) ||
    !isValidVapidValue(VAPID_EMAIL)
  ) {
    return null
  }
  return {
    publicKey: VAPID_PUBLIC_KEY.trim(),
    privateKey: VAPID_PRIVATE_KEY.trim(),
    email: VAPID_EMAIL.trim(),
  }
}

function ensureVapid() {
  if (vapidConfigured) return true
  const vapid = getVapidConfig()
  if (!vapid) return false
  webpush.setVapidDetails(`mailto:${vapid.email}`, vapid.publicKey, vapid.privateKey)
  vapidConfigured = true
  return true
}

export function isPushConfigured() {
  return getVapidConfig() != null
}

export function getVapidPublicKey() {
  return getVapidConfig()?.publicKey ?? null
}

export function buildPushPayload({ title, message, url, referenceId, referenceType }) {
  return JSON.stringify({
    title: title || 'Supplify',
    body: message || '',
    url: url || '/app/notifications',
    referenceId: referenceId || null,
    referenceType: referenceType || null,
  })
}

export async function savePushSubscription(userId, { endpoint, keys, userAgent }) {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Invalid push subscription payload')
  }
  const { rows } = await query(
    `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint)
    DO UPDATE SET user_id = EXCLUDED.user_id,
                  p256dh = EXCLUDED.p256dh,
                  auth = EXCLUDED.auth,
                  user_agent = EXCLUDED.user_agent
    RETURNING *
    `,
    [userId, endpoint, keys.p256dh, keys.auth, userAgent || null]
  )
  return rows[0]
}

export async function removePushSubscription(userId, endpoint) {
  const { rowCount } = await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint]
  )
  return rowCount > 0
}

const EXPO_ENDPOINT_PREFIX = 'expo:'

export function expoPushEndpoint(token) {
  return `${EXPO_ENDPOINT_PREFIX}${token}`
}

export function isExpoPushSubscription(subscriptionRow) {
  return subscriptionRow?.endpoint?.startsWith(EXPO_ENDPOINT_PREFIX)
}

export function isValidExpoPushToken(token) {
  return Expo.isExpoPushToken(token)
}

export async function saveExpoPushDevice(userId, { token, platform }) {
  if (!isValidExpoPushToken(token) || !['ios', 'android'].includes(platform)) {
    throw new Error('Invalid expo push device payload')
  }
  const { rows } = await query(
    `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint)
    DO UPDATE SET user_id = EXCLUDED.user_id,
                  p256dh = EXCLUDED.p256dh,
                  auth = EXCLUDED.auth,
                  user_agent = EXCLUDED.user_agent
    RETURNING *
    `,
    [userId, expoPushEndpoint(token), 'expo', platform, null]
  )
  return rows[0]
}

export async function removeExpoPushDevice(userId, token) {
  const { rowCount } = await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, expoPushEndpoint(token)]
  )
  return rowCount > 0
}

export async function deleteStaleSubscription(subscriptionId) {
  await query(`DELETE FROM push_subscriptions WHERE id = $1`, [subscriptionId])
}

export async function getSubscriptionsForUser(userId) {
  const { rows } = await query(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId])
  return rows
}

export async function sendPushToSubscription(subscriptionRow, payloadString) {
  if (!ensureVapid()) return { sent: false, reason: 'NOT_CONFIGURED' }

  const pushSubscription = {
    endpoint: subscriptionRow.endpoint,
    keys: {
      p256dh: subscriptionRow.p256dh,
      auth: subscriptionRow.auth,
    },
  }

  try {
    await webpush.sendNotification(pushSubscription, payloadString)
    return { sent: true }
  } catch (error) {
    const statusCode = error.statusCode || error.status
    if (statusCode === 410 || statusCode === 404) {
      await deleteStaleSubscription(subscriptionRow.id)
      return { sent: false, reason: 'STALE', statusCode }
    }
    logger.warn('Web push send failed', {
      subscriptionId: subscriptionRow.id,
      statusCode,
      message: error.message,
    })
    return { sent: false, reason: 'ERROR', statusCode }
  }
}

export function buildExpoPushMessage({ token, title, body, data = {}, url }) {
  return {
    to: token,
    title,
    body,
    data: { ...data, url },
    sound: 'default',
    priority: 'high',
    channelId: 'supplify-alerts',
    badge: 1,
  }
}

const EXPO_RECEIPT_RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000]

export async function reconcileExpoPushReceipts(ticketMappings) {
  if (!ticketMappings.length) return { delivered: 0, failed: 0, pending: [] }

  const receipts = {}
  const receiptIds = ticketMappings.map((item) => item.ticketId)
  for (const chunk of _expo.chunkPushNotificationReceiptIds(receiptIds)) {
    try {
      Object.assign(receipts, await _expo.getPushNotificationReceiptsAsync(chunk))
    } catch (error) {
      logger.error({ error }, 'Expo push receipt request failed')
    }
  }

  const pending = []
  const staleSubscriptionIds = new Set()
  const deliveredNotificationIds = new Set()
  let delivered = 0
  let failed = 0

  for (const mapping of ticketMappings) {
    const receipt = receipts[mapping.ticketId]
    if (!receipt) {
      pending.push(mapping)
      continue
    }
    if (receipt.status === 'ok') {
      delivered += 1
      if (mapping.notificationId) deliveredNotificationIds.add(mapping.notificationId)
      continue
    }

    failed += 1
    logger.warn(
      {
        receipt,
        ticketId: mapping.ticketId,
        subscriptionId: mapping.subscriptionId,
      },
      'Expo push delivery receipt error'
    )
    if (receipt.details?.error === 'DeviceNotRegistered') {
      staleSubscriptionIds.add(mapping.subscriptionId)
    }
  }

  if (staleSubscriptionIds.size > 0) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [[...staleSubscriptionIds]])
  }
  if (deliveredNotificationIds.size > 0) {
    await query('UPDATE notification_log SET push_sent = true WHERE id = ANY($1)', [
      [...deliveredNotificationIds],
    ])
  }

  return { delivered, failed, pending }
}

function scheduleExpoPushReceiptCheck(ticketMappings, attempt = 0) {
  if (!ticketMappings.length) return
  const delay = EXPO_RECEIPT_RETRY_DELAYS_MS[attempt]
  if (delay == null) {
    logger.warn(
      { receiptCount: ticketMappings.length },
      'Expo push receipts were not available after all retries'
    )
    return
  }

  const timer = setTimeout(() => {
    reconcileExpoPushReceipts(ticketMappings)
      .then((result) => {
        if (result.pending.length) scheduleExpoPushReceiptCheck(result.pending, attempt + 1)
      })
      .catch((error) => logger.error({ error }, 'Expo push receipt reconciliation failed'))
  }, delay)
  timer.unref?.()
}

/**
 * Send Expo push notifications to all registered devices for a user.
 * Invalid and stale tokens are removed. Accepted tickets are reconciled with
 * FCM/APNs receipts before notification_log.push_sent is marked true.
 */
export async function sendExpoPushToUser(
  userId,
  { title, body, data = {}, url, notificationId = null }
) {
  const { rows } = await query(
    `SELECT id, endpoint, auth AS platform
     FROM push_subscriptions
     WHERE user_id = $1 AND endpoint LIKE 'expo:%'`,
    [userId]
  )
  if (rows.length === 0) return { sent: 0, failed: 0, total: 0 }

  const invalidSubscriptionIds = []
  const deliveries = rows.flatMap((row) => {
    const token = row.endpoint.replace('expo:', '')
    if (!isValidExpoPushToken(token)) {
      invalidSubscriptionIds.push(row.id)
      logger.warn({ subscriptionId: row.id }, 'Invalid Expo push token removed')
      return []
    }
    return [
      {
        subscriptionId: row.id,
        notificationId,
        message: buildExpoPushMessage({ token, title, body, data, url }),
      },
    ]
  })

  if (invalidSubscriptionIds.length > 0) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [invalidSubscriptionIds])
  }
  if (deliveries.length === 0) {
    return { sent: 0, failed: invalidSubscriptionIds.length, total: rows.length }
  }

  const chunks = _expo.chunkPushNotifications(deliveries.map((item) => item.message))
  const ticketMappings = []
  const immediateStaleIds = new Set()
  let deliveryOffset = 0
  let failed = invalidSubscriptionIds.length

  for (const chunk of chunks) {
    try {
      const chunkTickets = await _expo.sendPushNotificationsAsync(chunk)
      chunkTickets.forEach((ticket, index) => {
        const delivery = deliveries[deliveryOffset + index]
        if (!delivery) return

        if (ticket.status === 'ok') {
          ticketMappings.push({
            ticketId: ticket.id,
            subscriptionId: delivery.subscriptionId,
            notificationId: delivery.notificationId,
          })
          return
        }

        failed += 1
        logger.warn({ ticket, subscriptionId: delivery.subscriptionId }, 'Expo push ticket error')
        if (ticket.details?.error === 'DeviceNotRegistered') {
          immediateStaleIds.add(delivery.subscriptionId)
        }
      })
    } catch (error) {
      failed += chunk.length
      logger.error({ error }, 'Expo push chunk send error')
    }
    deliveryOffset += chunk.length
  }

  if (immediateStaleIds.size > 0) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [[...immediateStaleIds]])
  }

  scheduleExpoPushReceiptCheck(ticketMappings)
  return { sent: ticketMappings.length, failed, total: rows.length }
}

/**
 * Fire-and-forget web push for all subscriptions of a user.
 */
export function sendWebPushToUser({ userId, title, message, referenceId, referenceType, url }) {
  if (!isPushConfigured()) return Promise.resolve({ sent: 0 })

  const payloadString = buildPushPayload({
    title,
    message,
    url,
    referenceId,
    referenceType,
  })

  return (async () => {
    const subscriptions = await getSubscriptionsForUser(userId)
    if (!subscriptions.length) return { sent: 0 }

    let sent = 0
    for (const sub of subscriptions) {
      if (isExpoPushSubscription(sub)) continue
      const result = await sendPushToSubscription(sub, payloadString)
      if (result.sent) sent += 1
    }
    return { sent, total: subscriptions.length }
  })().catch((err) => {
    logger.error('sendWebPushToUser failed', { userId, error: err.message })
    return { sent: 0, error: err.message }
  })
}
