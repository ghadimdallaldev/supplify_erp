import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { csrfProtection } from '../middlewares/csrf.js'

const sendTemplateEmail = vi.fn().mockResolvedValue({ sent: true, provider: 'smtp' })
const sendEmail = vi.fn().mockResolvedValue({ sent: true, provider: 'resend' })
const writeAuditLog = vi.fn().mockResolvedValue(undefined)

vi.mock('../config/env.js', () => ({
  config: {
    AUTH_EMAIL_OTP_ENABLED: true,
    AUTH_EMAIL_OTP_INTERNAL_SECRET: 'test-internal-secret',
    AUTH_EMAIL_OTP_SEND_WINDOW_MS: 60_000,
    AUTH_EMAIL_OTP_SEND_MAX: 10,
  },
}))
vi.mock('../services/email/email.service.js', () => ({ sendTemplateEmail, sendEmail }))
vi.mock('../lib/audit.js', () => ({ writeAuditLog }))
vi.mock('../lib/rate-limit-store.js', () => ({ createRateLimitStore: () => undefined }))

describe('internal email OTP delivery', () => {
  let app

  beforeEach(async () => {
    sendTemplateEmail.mockClear()
    sendEmail.mockClear()
    writeAuditLog.mockClear()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'otp-test'
      next()
    })
    app.use(csrfProtection)
    const { internalAuthRoutes } = await import('./internal-auth.routes.js')
    app.use('/api/internal', internalAuthRoutes)
  })

  it('rejects a missing shared secret', async () => {
    await request(app)
      .post('/api/internal/auth/otp/email')
      .send({
        email: 'User@example.com',
        code: '123456',
        purpose: 'login_email_mfa',
        challengeId: 'c1',
      })
      .expect(401)
    expect(sendTemplateEmail).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated Keycloak recovery mail', async () => {
    await request(app)
      .post('/api/internal/auth/keycloak/email')
      .send({ email: 'owner@outlook.com', subject: 'Reset password', text: 'private link' })
      .expect(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('relays sensitive recovery links with stable deduplication and redacted audit data', async () => {
    const body = {
      email: ' Owner@Outlook.com ',
      subject: 'Reset password',
      text: 'https://keycloak.example/reset?key=private',
      html: '<a href="https://keycloak.example/reset?key=private">Reset</a>',
    }
    for (let i = 0; i < 2; i++)
      await request(app)
        .post('/api/internal/auth/keycloak/email')
        .set('Authorization', 'Bearer test-internal-secret')
        .send(body)
        .expect(200)
    const first = sendEmail.mock.calls[0][0]
    expect(first).toMatchObject({
      to: 'owner@outlook.com',
      sensitive: true,
      throwOnError: true,
      eventType: 'auth.keycloak_email',
    })
    expect(first.eventKey).toBe(sendEmail.mock.calls[1][0].eventKey)
    const auditPayloads = writeAuditLog.mock.calls.map(([, entry]) => entry)
    expect(JSON.stringify(auditPayloads)).not.toContain('private')
    expect(JSON.stringify(auditPayloads)).not.toContain('Owner@Outlook.com')
  })

  it('reports disabled or suppressed delivery as unavailable', async () => {
    sendEmail.mockResolvedValueOnce({ sent: false, skipped: true })
    await request(app)
      .post('/api/internal/auth/keycloak/email')
      .set('Authorization', 'Bearer test-internal-secret')
      .send({ email: 'owner@outlook.com', subject: 'Reset', text: 'Private link' })
      .expect(503)
  })

  it('rejects header injection before delivery', async () => {
    await request(app)
      .post('/api/internal/auth/keycloak/email')
      .set('Authorization', 'Bearer test-internal-secret')
      .send({
        email: 'owner@outlook.com',
        subject: 'Reset\r\nBcc: other@example.com',
        text: 'Private link',
      })
      .expect(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('normalizes the recipient and marks the message sensitive', async () => {
    await request(app)
      .post('/api/internal/auth/otp/email')
      .set('Authorization', 'Bearer test-internal-secret')
      .send({
        email: ' User@Example.COM ',
        code: '123456',
        purpose: 'login_email_mfa',
        challengeId: 'c1',
      })
      .expect(200)

    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        template: 'auth.email_otp_login',
        sensitive: true,
        data: { code: '123456', locale: undefined },
      })
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action_type: 'auth.email_otp_login.sent',
        payload_json: expect.not.objectContaining({ code: expect.anything() }),
      })
    )
  })
})
