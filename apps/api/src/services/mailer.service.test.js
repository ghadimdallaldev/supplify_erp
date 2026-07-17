import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  EMAIL_ENABLED: true,
  EMAIL_LOG_ONLY: false,
  EMAIL_PROVIDER: 'smtp',
  EMAIL_FROM_ADDRESS: '',
  EMAIL_FROM_NAME: 'Supplify',
  SMTP_HOST: '',
  SMTP_FROM: 'noreply@test.local',
  SMTP_PORT: 587,
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_SECURE: false,
  EMAIL_REPLY_TO: '',
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
    mockConfig.SMTP_HOST = ''
    vi.resetModules()
    const mod = await import('./mailer.service.js')
    mod.__resetMailerForTests?.()
  })

  it('isEmailConfigured is false when no SMTP host set', async () => {
    const { isEmailConfigured } = await import('./mailer.service.js')
    expect(isEmailConfigured()).toBe(false)
  })

  it('isEmailConfigured is true when SMTP host is set', async () => {
    mockConfig.SMTP_HOST = 'smtp.test.local'
    vi.resetModules()
    const { isEmailConfigured } = await import('./mailer.service.js')
    expect(isEmailConfigured()).toBe(true)
  })

  it('sendMail uses SMTP when SMTP_HOST is set', async () => {
    mockConfig.SMTP_HOST = 'smtp.test.local'
    vi.resetModules()

    const { sendMail } = await import('./mailer.service.js')
    const result = await sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    })

    expect(smtpSendMail).toHaveBeenCalled()
    expect(result.provider).toBe('smtp')
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
    expect(smtpSendMail).not.toHaveBeenCalled()
  })
})
