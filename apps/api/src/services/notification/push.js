import { query } from '../../lib/db.js'
import { sendWebPushToUser, sendExpoPushToUser, isPushConfigured } from '../push.service.js'
import { logger } from '../../lib/logger.js'
import { ensureNotificationPreferences, invalidateNotificationPreferencesCache } from './in-app.js'

/** Opt-in/out browser push at the preference layer (paired with push_subscriptions). */
export async function setPushEnabledPreference(userId, userType, enabled) {
  await ensureNotificationPreferences(userId, userType)
  await query(
    `
      UPDATE notification_preferences
      SET push_enabled = $3, updated_at = now()
      WHERE user_id = $1 AND user_type = $2
    `,
    [userId, userType, Boolean(enabled)]
  )
  await invalidateNotificationPreferencesCache(userId, userType)
}

/** Resolve deep-link URL for a push notification from reference metadata. */
export function resolvePushUrl(referenceType, referenceId) {
  if (referenceType === 'DISPUTE') return `/app/disputes/${referenceId}`
  if (referenceType === 'ORDER') return `/app/orders/${referenceId}`
  if (referenceType === 'RESERVATION') return '/app/reservations'
  if (referenceType === 'INVOICE') return '/app/invoices'
  if (referenceType === 'CONVERSATION' || referenceType === 'CHAT') return '/app/chat'
  if (referenceType === 'QUICK_LIST') return '/app/quick-lists'
  if (referenceType === 'QUOTE_REQUEST') return `/app/quote-requests/${referenceId}`
  if (referenceType === 'SUBSCRIPTION' || referenceType === 'BILLING') {
    return '/app/settings?tab=subscription'
  }
  return '/app/notifications'
}

/** Dispatch browser and native push independently. */
export function dispatchPushNotification({
  userId,
  title,
  message,
  referenceId,
  referenceType,
  notificationId,
  notificationType,
  notificationCategory,
  metadata = null,
}) {
  const url = resolvePushUrl(referenceType, referenceId)

  const markWebPushSent = () => {
    if (!notificationId) return
    query(`UPDATE notification_log SET push_sent = true WHERE id = $1`, [notificationId]).catch(
      () => {}
    )
  }

  const webPush = sendWebPushToUser({
    userId,
    title,
    message,
    referenceId,
    referenceType,
    url,
  })
    .then((pushResult) => {
      if (pushResult?.sent > 0) markWebPushSent()
      return pushResult
    })
    .catch((error) => {
      logger.error('Web push send failed', { error: error.message })
      return { sent: 0, error: error.message }
    })

  const clientData = {
    notificationId,
    notification_id: notificationId,
    notificationType,
    notification_type: notificationType,
    notificationCategory,
    notification_category: notificationCategory,
    referenceId,
    reference_id: referenceId,
    referenceType,
    reference_type: referenceType,
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  }
  const expoPush = sendExpoPushToUser(userId, {
    title,
    body: message,
    data: clientData,
    url,
    notificationId,
  }).catch((error) => {
    logger.error('Expo push send failed', { error: error.message })
    return { sent: 0, error: error.message }
  })

  return Promise.all([webPush, expoPush]).then(([web, expo]) => ({ web, expo }))
}

export { isPushConfigured }
