import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMailMock = vi.fn().mockResolvedValue({ provider: 'smtp', messageId: '1' })
const queryMock = vi.fn()

vi.mock('../mailer.service.js', () => ({
  sendMail: (...args) => sendMailMock(...args),
  isEmailConfigured: vi.fn(() => true),
}))

vi.mock('../../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockConfig = {
  NODE_ENV: 'test',
  EMAIL_ENABLED: true,
  EMAIL_LOG_ONLY: false,
  EMAIL_FROM_NAME: 'Supplify',
  EMAIL_FROM_ADDRESS: 'noreply@test.local',
  EMAIL_REPLY_TO: '',
  SMTP_HOST: 'smtp.test.local',
}

vi.mock('../../config/env.js', () => ({
  config: mockConfig,
}))

describe('email.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.EMAIL_ENABLED = true
    mockConfig.EMAIL_LOG_ONLY = false
    queryMock.mockResolvedValue({ rows: [{ id: 'log-1' }] })
  })

  it('sendEmail calls transporter via sendMail', async () => {
    const { sendEmail } = await import('./email.service.js')
    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
      skipDedup: true,
    })
    expect(sendMailMock).toHaveBeenCalled()
    expect(result.sent).toBe(true)
  })

  it('EMAIL_ENABLED=false skips sending', async () => {
    mockConfig.EMAIL_ENABLED = false
    vi.resetModules()
    const { sendEmail } = await import('./email.service.js')
    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      skipDedup: true,
    })
    expect(sendMailMock).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
  })

  it('EMAIL_LOG_ONLY logs without sending', async () => {
    mockConfig.EMAIL_LOG_ONLY = true
    vi.resetModules()
    const { sendEmail } = await import('./email.service.js')
    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      skipDedup: true,
    })
    expect(sendMailMock).not.toHaveBeenCalled()
    expect(result.logOnly).toBe(true)
  })

  it('missing recipient is handled safely', async () => {
    const { sendEmail } = await import('./email.service.js')
    const result = await sendEmail({ to: '', subject: 'Hi', skipDedup: true })
    expect(result.skipped).toBe(true)
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('duplicate event_key does not send twice', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }) // claim first send
      .mockResolvedValueOnce({ rows: [] }) // persist retry payload
      .mockResolvedValueOnce({ rows: [] }) // finalize first send
      .mockResolvedValueOnce({ rows: [] }) // claim duplicate
    vi.resetModules()
    const { sendEmail } = await import('./email.service.js')
    const opts = {
      to: 'user@example.com',
      subject: 'Order',
      text: 'Placed',
      eventKey: 'order:1:placed',
      eventType: 'order.placed',
    }
    await sendEmail(opts)
    const second = await sendEmail(opts)
    expect(second.duplicate).toBe(true)
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  })

  it('sendTemplateEmail renders order template', async () => {
    const { sendTemplateEmail } = await import('./email.service.js')
    await sendTemplateEmail({
      to: 'supplier@example.com',
      template: 'order.placed',
      data: { message: 'New order #123', title: 'New order' },
      skipDedup: true,
    })
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'supplier@example.com',
        subject: expect.any(String),
        html: expect.stringContaining('Supplify'),
      })
    )
  })
})
