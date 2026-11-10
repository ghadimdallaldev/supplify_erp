import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_secret_key',
  RESEND_API_URL: 'https://api.resend.test',
  SMTP_HOST: '',
  SMTP_PASS: '',
}))
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock('../config/env.js', () => ({ config: mockConfig }))
vi.mock('../lib/logger.js', () => ({ logger }))

const payload = {
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  text: 'Hi',
  from: '"Supplify" <noreply@example.com>',
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('resend-transport', () => {
  let mod
  beforeEach(async () => {
    vi.clearAllMocks()
    Object.assign(mockConfig, {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_secret_key',
      SMTP_HOST: '',
      SMTP_PASS: '',
    })
    mod = await import('./resend-transport.js')
    mod.__resetResendForTests()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('posts to the Resend API and returns messageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'msg_123' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await mod.sendViaResend(
      {
        ...payload,
        replyTo: 'support@example.com',
        cc: 'cc@example.com',
        attachments: [{ filename: 'a.txt', content: Buffer.from('hello') }],
      },
      { idempotencyKey: 'evt-1' }
    )
    expect(result).toEqual({ messageId: 'msg_123', provider: 'resend' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.test/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_secret_key')
    expect(init.headers['Idempotency-Key']).toBe('evt-1')
    expect(init.signal).toBeDefined()
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      from: payload.from,
      to: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
      reply_to: 'support@example.com',
      cc: 'cc@example.com',
      attachments: [{ filename: 'a.txt', content: Buffer.from('hello').toString('base64') }],
    })
  })

  it('omits Idempotency-Key when none is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'm' }))
    vi.stubGlobal('fetch', fetchMock)
    await mod.sendViaResend(payload)
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined()
  })

  it('throws a non-retryable error on 403 without leaking the key', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { name: 'validation_error', message: 'The domain is not verified' })
        )
    )
    const err = await mod.sendViaResend(payload).catch((e) => e)
    expect(err.status).toBe(403)
    expect(err.retryable).toBe(false)
    expect(err.message).toContain('403')
    expect(err.message).toContain('The domain is not verified')
    expect(err.message).not.toContain('re_secret_key')
  })

  it('marks 429 and 5xx as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { message: 'slow down' })))
    expect((await mod.sendViaResend(payload).catch((e) => e)).retryable).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { message: 'down' })))
    expect((await mod.sendViaResend(payload).catch((e) => e)).retryable).toBe(true)
  })

  it('treats a timeout as a retryable error', async () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const err = await mod.sendViaResend(payload).catch((e) => e)
    expect(err.message).toMatch(/timed out/)
    expect(err.retryable).toBe(true)
  })

  it('falls back to SMTP_PASS when SMTP_HOST is smtp.resend.com', async () => {
    mockConfig.RESEND_API_KEY = ''
    mockConfig.SMTP_HOST = 'smtp.resend.com'
    mockConfig.SMTP_PASS = 're_from_smtp'
    expect(mod.resolveResendApiKey()).toEqual({ key: 're_from_smtp', source: 'SMTP_PASS' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'm' }))
    vi.stubGlobal('fetch', fetchMock)
    await mod.sendViaResend(payload)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer re_from_smtp')
    expect(logger.info).toHaveBeenCalledWith('Resend API key resolved', { source: 'SMTP_PASS' })
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('re_from_smtp')
  })

  it('does not fall back to SMTP_PASS for other SMTP hosts', () => {
    mockConfig.RESEND_API_KEY = ''
    mockConfig.SMTP_HOST = 'smtp.other.com'
    mockConfig.SMTP_PASS = 'pw'
    expect(mod.isResendConfigured()).toBe(false)
  })

  it('warns once when SMTP host is Resend but provider is smtp', () => {
    mockConfig.EMAIL_PROVIDER = 'smtp'
    mockConfig.SMTP_HOST = 'smtp.resend.com'
    mod.warnIfResendSmtpHost()
    mod.warnIfResendSmtpHost()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('EMAIL_PROVIDER=resend')
  })
})
