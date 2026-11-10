import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'

const DEFAULT_API_URL = 'https://api.resend.com'
const DEFAULT_TIMEOUT_MS = 15000
const RESEND_SMTP_HOST = 'smtp.resend.com'

let keySourceLogged = false
let smtpHintLogged = false

export function __resetResendForTests() {
  keySourceLogged = false
  smtpHintLogged = false
}

export function isResendProvider() {
  return String(config.EMAIL_PROVIDER || '').toLowerCase() === 'resend'
}

function isResendSmtpHost() {
  return String(config.SMTP_HOST || '').toLowerCase() === RESEND_SMTP_HOST
}

/**
 * Resolve the Resend API key: RESEND_API_KEY, else SMTP_PASS when SMTP_HOST is smtp.resend.com
 * (the same key is used as the SMTP password). `source` is a variable name, never the value.
 */
export function resolveResendApiKey() {
  if (config.RESEND_API_KEY) return { key: config.RESEND_API_KEY, source: 'RESEND_API_KEY' }
  if (isResendSmtpHost() && config.SMTP_PASS) return { key: config.SMTP_PASS, source: 'SMTP_PASS' }
  return { key: '', source: null }
}

export function isResendConfigured() {
  return Boolean(resolveResendApiKey().key)
}

/** One-time startup hint when Resend SMTP is configured but the HTTPS API is not selected. */
export function warnIfResendSmtpHost() {
  if (smtpHintLogged || isResendProvider() || !isResendSmtpHost()) return
  smtpHintLogged = true
  logger.warn(
    'SMTP_HOST is smtp.resend.com but EMAIL_PROVIDER is not "resend". Outbound SMTP is blocked on some hosts (e.g. Railway Trial/Hobby); set EMAIL_PROVIDER=resend to send via the Resend HTTPS API.'
  )
}

function toBase64(content, encoding) {
  if (Buffer.isBuffer(content)) return content.toString('base64')
  if (encoding === 'base64') return String(content)
  return Buffer.from(String(content), encoding || 'utf8').toString('base64')
}

function resendError(message, { status, retryable, cause } = {}) {
  const err = new Error(message)
  err.provider = 'resend'
  err.status = status
  err.statusCode = status
  err.retryable = retryable
  if (cause) err.cause = cause
  return err
}

function mapAttachments(attachments) {
  if (!attachments?.length) return undefined
  return attachments.map((a) => {
    const out = { filename: a.filename }
    if (a.content != null) {
      out.content = toBase64(a.content, a.encoding)
    } else if (a.path && /^https?:\/\//i.test(a.path)) {
      out.path = a.path
    } else {
      throw resendError('Resend attachment requires content or an http(s) path', {
        retryable: false,
      })
    }
    if (a.contentType) out.content_type = a.contentType
    if (a.cid) out.content_id = a.cid
    return out
  })
}

function formatFrom(from) {
  if (typeof from === 'string') return from
  if (from?.email) return from.name ? `${from.name} <${from.email}>` : from.email
  return undefined
}

/**
 * Send via POST {RESEND_API_URL}/emails. Throws on failure with `status` and `retryable`
 * (429, 5xx and network/timeout errors are retryable; other 4xx are not).
 */
export async function sendViaResend(payload, { idempotencyKey } = {}) {
  const { key, source } = resolveResendApiKey()
  if (!key) {
    throw resendError('Resend API key is not configured (set RESEND_API_KEY)', { retryable: false })
  }
  if (!keySourceLogged) {
    keySourceLogged = true
    logger.info('Resend API key resolved', { source })
  }

  const body = {
    from: formatFrom(payload.from),
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    reply_to: payload.replyTo || undefined,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    attachments: mapAttachments(payload.attachments),
  }

  const baseUrl = String(config.RESEND_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  const timeoutMs = Number(config.RESEND_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256)

  let res
  try {
    res = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    throw resendError(
      timedOut
        ? `Resend API request timed out after ${timeoutMs}ms`
        : `Resend API request failed: ${error?.message || 'network error'}`,
      { retryable: true, cause: error }
    )
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const detail = data?.message || data?.error?.message || res.statusText || 'unknown error'
    const name = data?.name ? ` [${data.name}]` : ''
    throw resendError(`Resend API error ${res.status}${name}: ${detail}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
    })
  }

  logger.info('Email sent via Resend', { messageId: data?.id, subject: payload.subject })
  return { messageId: data?.id, provider: 'resend' }
}
