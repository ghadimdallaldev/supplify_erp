import crypto from 'node:crypto'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { assertPublicHttpUrl } from '../../lib/ssrf-guard.js'

const WEBHOOK_TIMEOUT_MS = 5000

/**
 * Load a tenant's configured notification webhook, or null.
 * @param {string} tenantId
 * @param {'SUPPLIER'|'RESTAURANT'|'ADMIN'} tenantType
 */
export async function getTenantWebhook(tenantId, tenantType) {
  if (!tenantId || !tenantType) return null
  try {
    const { rows } = await query(
      `SELECT id, tenant_id, tenant_type, url, secret, enabled
       FROM notification_webhook
       WHERE tenant_id = $1 AND tenant_type = $2`,
      [tenantId, tenantType]
    )
    return rows[0] || null
  } catch (error) {
    if (error.code === '42P01') return null
    logger.warn('Failed to load notification webhook', { error: error.message })
    return null
  }
}

/**
 * Upsert a tenant's webhook config. A null/blank secret keeps the existing one.
 */
export async function upsertTenantWebhook(tenantId, tenantType, { url, enabled = true, secret }) {
  const setSecret = secret != null && String(secret).trim().length > 0
  const { rows } = await query(
    `
    INSERT INTO notification_webhook (tenant_id, tenant_type, url, enabled, secret)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, tenant_type) DO UPDATE SET
      url = EXCLUDED.url,
      enabled = EXCLUDED.enabled,
      secret = CASE WHEN $6 THEN EXCLUDED.secret ELSE notification_webhook.secret END,
      updated_at = now()
    RETURNING id, tenant_id, tenant_type, url, enabled, (secret IS NOT NULL) AS has_secret
    `,
    [tenantId, tenantType, url, enabled, setSecret ? secret : null, setSecret]
  )
  return rows[0]
}

async function logWebhookDelivery({
  tenantId,
  tenantType,
  url,
  eventCategory,
  status,
  httpStatus = null,
  errorMessage = null,
}) {
  try {
    await query(
      `
      INSERT INTO notification_webhook_delivery_log (
        tenant_id, tenant_type, url, event_category, status, http_status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        tenantType,
        url,
        eventCategory || null,
        status,
        httpStatus,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
      ]
    )
  } catch (error) {
    if (error.code === '42P01') return
    logger.warn('Failed to record notification webhook delivery', { error: error.message })
  }
}

/**
 * Build the signed request body + headers for a webhook event.
 * Exposed for testing.
 */
export function buildWebhookRequest(event, secret) {
  const body = JSON.stringify(event)
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Supplify-Webhook/1' }
  if (secret) {
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Supplify-Signature'] = `sha256=${signature}`
  }
  return { body, headers }
}

/**
 * Best-effort outbound webhook delivery for a notification. Never throws.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {'SUPPLIER'|'RESTAURANT'|'ADMIN'} params.tenantType
 * @param {object} params.notification - The persisted notification row / payload.
 * @returns {Promise<{ delivered: boolean, reason?: string, httpStatus?: number }>}
 */
export async function dispatchNotificationWebhook({ tenantId, tenantType, notification }) {
  const webhook = await getTenantWebhook(tenantId, tenantType)
  if (!webhook || !webhook.enabled || !webhook.url) {
    return { delivered: false, reason: 'NOT_CONFIGURED' }
  }

  const event = {
    type: 'notification',
    tenantId,
    tenantType,
    category: notification?.notification_category ?? notification?.notificationCategory ?? null,
    notification: {
      id: notification?.id ?? null,
      title: notification?.title ?? null,
      message: notification?.message ?? null,
      referenceId: notification?.reference_id ?? notification?.referenceId ?? null,
      referenceType: notification?.reference_type ?? notification?.referenceType ?? null,
    },
    sentAt: new Date().toISOString(),
  }

  // Re-check at send time: rows stored before this guard existed, and DNS for a
  // once-public host can be repointed at an internal address later.
  try {
    assertPublicHttpUrl(webhook.url, { protocols: ['https:'], label: 'Webhook URL' })
  } catch (error) {
    await logWebhookDelivery({
      tenantId,
      tenantType,
      url: webhook.url,
      eventCategory: event.category,
      status: 'failed',
      errorMessage: 'BLOCKED_URL',
    })
    logger.warn({
      msg: 'Blocked notification webhook to non-public URL',
      tenantId,
      tenantType,
      reason: error.message,
    })
    return { delivered: false, reason: 'BLOCKED_URL' }
  }

  const { body, headers } = buildWebhookRequest(event, webhook.secret)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      // Following redirects would let a public URL bounce the request to an
      // internal address, defeating the check above.
      redirect: 'manual',
    })
    if (response.status >= 300 && response.status < 400) {
      await logWebhookDelivery({
        tenantId,
        tenantType,
        url: webhook.url,
        eventCategory: event.category,
        status: 'failed',
        httpStatus: response.status,
        errorMessage: 'REDIRECT_NOT_ALLOWED',
      })
      return { delivered: false, reason: 'REDIRECT_NOT_ALLOWED', httpStatus: response.status }
    }
    if (!response.ok) {
      await logWebhookDelivery({
        tenantId,
        tenantType,
        url: webhook.url,
        eventCategory: event.category,
        status: 'failed',
        httpStatus: response.status,
        errorMessage: `HTTP_${response.status}`,
      })
      return { delivered: false, reason: 'HTTP_ERROR', httpStatus: response.status }
    }
    await logWebhookDelivery({
      tenantId,
      tenantType,
      url: webhook.url,
      eventCategory: event.category,
      status: 'sent',
      httpStatus: response.status,
    })
    return { delivered: true, httpStatus: response.status }
  } catch (error) {
    await logWebhookDelivery({
      tenantId,
      tenantType,
      url: webhook.url,
      eventCategory: event.category,
      status: 'failed',
      errorMessage: error.name === 'AbortError' ? 'timeout' : error.message,
    })
    return { delivered: false, reason: 'REQUEST_ERROR' }
  } finally {
    clearTimeout(timeout)
  }
}
