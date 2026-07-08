import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Meta WhatsApp webhook verification (GET hub.challenge handshake).
 */
export function verifyWhatsAppChallenge(query, expectedVerifyToken) {
  const mode = String(query['hub.mode'] || '')
  const token = String(query['hub.verify_token'] || '')
  const challenge = query['hub.challenge']

  if (mode !== 'subscribe' || !expectedVerifyToken || token !== expectedVerifyToken) {
    return { ok: false, challenge: null }
  }

  if (challenge == null || challenge === '') {
    return { ok: false, challenge: null }
  }

  return { ok: true, challenge: String(challenge) }
}

/**
 * Verify X-Hub-Signature-256 using the Meta app secret and raw request body.
 */
export function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !Buffer.isBuffer(rawBody)) {
    return false
  }

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const provided = String(signatureHeader)

  try {
    const expectedBuf = Buffer.from(expected, 'utf8')
    const providedBuf = Buffer.from(provided, 'utf8')
    if (expectedBuf.length !== providedBuf.length) return false
    return timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}

export function parseWhatsAppWebhookBody(rawBody) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new Error('EMPTY_BODY')
  }

  const text = rawBody.toString('utf8')
  return JSON.parse(text)
}

/**
 * Flatten Meta webhook payload into normalized events for processing.
 */
export function extractWhatsAppWebhookEvents(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return []
  }

  const events = []

  for (const entry of payload.entry) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value || {}
      const phoneNumberId = value?.metadata?.phone_number_id || null
      const field = change?.field || 'unknown'

      const messages = Array.isArray(value.messages) ? value.messages : []
      for (const message of messages) {
        events.push({
          kind: 'message',
          field,
          phoneNumberId,
          waMessageId: message?.id || null,
          fromPhone: message?.from || null,
          toPhone: value?.metadata?.display_phone_number || null,
          messageType: message?.type || 'unknown',
          textBody: message?.text?.body || null,
          raw: message,
        })
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : []
      for (const status of statuses) {
        events.push({
          kind: 'status',
          field,
          phoneNumberId,
          waMessageId: status?.id || null,
          fromPhone: null,
          toPhone: status?.recipient_id || null,
          messageType: null,
          textBody: null,
          deliveryStatus: status?.status || 'unknown',
          errorMessage: status?.errors?.[0]?.message || status?.errors?.[0]?.title || null,
          raw: status,
        })
      }

      if (messages.length === 0 && statuses.length === 0) {
        events.push({
          kind: 'other',
          field,
          phoneNumberId,
          waMessageId: null,
          fromPhone: null,
          toPhone: null,
          messageType: null,
          textBody: null,
          raw: value,
        })
      }
    }
  }

  return events
}
