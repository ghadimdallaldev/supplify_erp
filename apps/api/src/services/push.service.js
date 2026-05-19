import webpush from 'web-push'
import { config } from '../config/env.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = config
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
    return false
  }
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidConfigured = true
  return true
}

export function isPushConfigured() {
  return !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_EMAIL)
}

export function getVapidPublicKey() {
  return config.VAPID_PUBLIC_KEY || null
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
    ON CONFLICT (user_id, endpoint)
    DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
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
      const result = await sendPushToSubscription(sub, payloadString)
      if (result.sent) sent += 1
    }
    return { sent, total: subscriptions.length }
  })().catch((err) => {
    logger.error('sendWebPushToUser failed', { userId, error: err.message })
    return { sent: 0, error: err.message }
  })
}
