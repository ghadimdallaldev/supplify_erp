import { beforeEach, describe, expect, it, vi } from 'vitest'

const sgSend = vi.fn()
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: sgSend,
  },
}))

const smtpSendMail = vi.fn().mockResolvedValue({ messageId: 'smtp-1' })
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: smtpSendMail,
    })),
  },
}))

const mockConfig = {
  NODE_ENV: 'test',
  SENDGRID_API_KEY: '',
  SENDGRID_FROM_EMAIL: '',
  SENDGRID_FROM_NAME: 'Supplify',
  SMTP_HOST: '',
  SMTP_FROM: 'noreply@test.local',
  SMTP_PORT: 587,
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_SECURE: false,
}

vi.mock('../config/env.js', () => ({
  config: mockConfig,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('mailer.service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockConfig.SENDGRID_API_KEY = ''
    mockConfig.SENDGRID_FROM_EMAIL = ''
    mockConfig.SMTP_HOST = ''
    vi.resetModules()
    const mod = await import('./mailer.service.js')
    mod.__resetMailerForTests?.()
  })

  it('isEmailConfigured is false when no providers set', async () => {
    const { isEmailConfigured } = await import('./mailer.service.js')
    expect(isEmailConfigured()).toBe(false)
  })

  it('sendMail uses SendGrid when SENDGRID_API_KEY is set', async () => {
    mockConfig.SENDGRID_API_KEY = 'SG.test'
    mockConfig.SENDGRID_FROM_EMAIL = 'noreply@supplify.com'
    vi.resetModules()
    sgSend.mockResolvedValue([{ statusCode: 202, headers: { 'x-message-id': 'sg-1' } }])

    const { sendMail, isEmailConfigured } = await import('./mailer.service.js')
    expect(isEmailConfigured()).toBe(true)

    const result = await sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    })

    expect(sgSend).toHaveBeenCalled()
    expect(result.provider).toBe('sendgrid')
  })

  it('sendMail previews when no provider configured', async () => {
    const { sendMail, isEmailConfigured } = await import('./mailer.service.js')
    expect(isEmailConfigured()).toBe(false)
    const result = await sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    })
    expect(result.provider).toBe('none')
    expect(result.accepted).toContain('user@example.com')
    expect(sgSend).not.toHaveBeenCalled()
    expect(smtpSendMail).not.toHaveBeenCalled()
  })
})
