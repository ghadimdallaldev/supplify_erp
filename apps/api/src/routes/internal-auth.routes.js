import express from 'express'
import rateLimit from 'express-rate-limit'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config/env.js'
import { normalizeIdentityEmail } from '../lib/identity-normalize.js'
import { createRateLimitStore } from '../lib/rate-limit-store.js'
import { writeAuditLog } from '../lib/audit.js'
import { sendEmail, sendTemplateEmail } from '../services/email/email.service.js'

const router = express.Router()
const otpEmailSchema = z.object({
  email: z.string().max(320),
  code: z.string().regex(/^\d{4,10}$/),
  purpose: z.enum(['login_email_mfa', 'signup_email_verification']),
  locale: z.string().max(12).optional(),
  challengeId: z.string().min(1).max(200),
})

function validSecret(req) {
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const expected = config.AUTH_EMAIL_OTP_INTERNAL_SECRET || ''
  if (!provided || !expected) return false
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function redactEmail(email) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

const otpEmailLimiter = rateLimit({
  windowMs: config.AUTH_EMAIL_OTP_SEND_WINDOW_MS,
  limit: config.AUTH_EMAIL_OTP_SEND_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    return `otp-email:${req.ip}:${email}`
  },
  store: createRateLimitStore('rl:auth-email-otp'),
  message: { ok: false, error: { name: 'OTP_RATE_LIMITED', message: 'Too many code requests' } },
})

const keycloakEmailSchema = z
  .object({
    email: z.string().max(320),
    subject: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/),
    text: z.string().max(180000).nullable().optional(),
    html: z.string().max(180000).nullable().optional(),
  })
  .refine((message) => Boolean(message.text || message.html))

// Keycloak renders its own expiring recovery/verification links. This internal
// relay uses the same shared secret and transport as OTP, with no stored body.
router.post('/auth/keycloak/email', otpEmailLimiter, async (req, res, next) => {
  if (!validSecret(req)) {
    return res
      .status(401)
      .json({ ok: false, error: { name: 'UNAUTHORIZED', message: 'Unauthorized' } })
  }
  const parsed = keycloakEmailSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { name: 'VALIDATION_ERROR', message: 'Invalid email request' } })
  }
  let email
  try {
    email = normalizeIdentityEmail(parsed.data.email)
  } catch {
    return res
      .status(400)
      .json({ ok: false, error: { name: 'VALIDATION_ERROR', message: 'Invalid email address' } })
  }
  try {
    const { subject, text, html } = parsed.data
    const eventKey =
      'auth:keycloak:' +
      createHash('sha256')
        .update(JSON.stringify([email, subject, text, html]))
        .digest('hex')
    const result = await sendEmail({
      to: email,
      subject,
      text,
      html,
      eventType: 'auth.keycloak_email',
      eventKey,
      sensitive: true,
      throwOnError: true,
    })
    if (!result.sent && !result.duplicate) {
      return res.status(503).json({
        ok: false,
        error: { name: 'EMAIL_NOT_DELIVERED', message: 'Email delivery unavailable' },
      })
    }
    await writeAuditLog(req, {
      action_type: 'auth.keycloak_email.sent',
      payload_json: { recipient: redactEmail(email), delivery: result.provider || 'duplicate' },
    })
    return res.json({ ok: true, data: { sent: true }, error: null })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/otp/email', otpEmailLimiter, async (req, res) => {
  if (!config.AUTH_EMAIL_OTP_ENABLED || !validSecret(req)) {
    return res
      .status(401)
      .json({ ok: false, error: { name: 'UNAUTHORIZED', message: 'Unauthorized' } })
  }

  const parsed = otpEmailSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { name: 'VALIDATION_ERROR', message: 'Invalid OTP request' } })
  }

  const { email: rawEmail, code, purpose, locale, challengeId } = parsed.data
  let email
  try {
    email = normalizeIdentityEmail(rawEmail)
  } catch {
    return res
      .status(400)
      .json({ ok: false, error: { name: 'VALIDATION_ERROR', message: 'Invalid email address' } })
  }

  const eventType = purpose === 'login_email_mfa' ? 'auth.email_otp_login' : 'auth.email_otp_verify'
  const eventKey = `auth:email-otp:${challengeId}:${purpose}:${Date.now()}`
  const result = await sendTemplateEmail({
    to: email,
    template: purpose === 'login_email_mfa' ? 'auth.email_otp_login' : 'auth.email_otp_verify',
    locale,
    data: { code, locale },
    eventType,
    eventKey,
    skipDedup: false,
    throwOnError: true,
    sensitive: true,
  })

  await writeAuditLog(req, {
    action_type: `${eventType}.sent`,
    payload_json: { purpose, recipient: redactEmail(email), delivery: result.provider || 'smtp' },
  })
  return res.json({ ok: true, data: { sent: true }, error: null })
})

export { router as internalAuthRoutes }
