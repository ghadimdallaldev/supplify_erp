import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendTemplateEmail = vi.fn().mockResolvedValue({ sent: true, provider: 'smtp' })
const writeAuditLog = vi.fn().mockResolvedValue(undefined)

vi.mock('../config/env.js', () => ({
  config: {
    AUTH_EMAIL_OTP_ENABLED: true,
    AUTH_EMAIL_OTP_INTERNAL_SECRET: 'test-internal-secret',
    AUTH_EMAIL_OTP_SEND_WINDOW_MS: 60_000,
    AUTH_EMAIL_OTP_SEND_MAX: 10,
  },
}))
vi.mock('../services/email/email.service.js', () => ({ sendTemplateEmail }))
vi.mock('../lib/audit.js', () => ({ writeAuditLog }))
vi.mock('../lib/rate-limit-store.js', () => ({ createRateLimitStore: () => undefined }))

describe('internal email OTP delivery', () => {
  let app

  beforeEach(async () => {
    sendTemplateEmail.mockClear()
    writeAuditLog.mockClear()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'otp-test'
      next()
    })
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
