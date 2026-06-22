import webpush from 'web-push'
import { config } from '../config/env.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

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

const EXPO_ENDPOINT_PREFIX = 'expo:'

export function expoPushEndpoint(token) {
  return `${EXPO_ENDPOINT_PREFIX}${token}`
}

export function isExpoPushSubscription(subscriptionRow) {
  return subscriptionRow?.endpoint?.startsWith(EXPO_ENDPOINT_PREFIX)
}

export async function saveExpoPushDevice(userId, { token, platform }) {
  if (!token || !['ios', 'android'].includes(platform)) {
    throw new Error('Invalid expo push device payload')
  }
  const { rows } = await query(
    `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, endpoint)
    DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
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
