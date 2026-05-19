import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    STAFF_PORTAL_BASE_URL: 'http://localhost:5173',
  },
}))

const isEmailConfigured = vi.fn()
vi.mock('./mailer.service.js', () => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
  isEmailConfigured: () => isEmailConfigured(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('staff-portal-mail.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isEmailConfigured.mockReturnValue(false)
  })

  it('buildStaffPortalLoginUrl encodes token in dashboard URL', async () => {
    const { buildStaffPortalLoginUrl } = await import('./staff-portal-mail.service.js')
    const url = buildStaffPortalLoginUrl('11111111-1111-1111-1111-111111111111')
    expect(url).toBe(
      'http://localhost:5173/staff/dashboard?token=11111111-1111-1111-1111-111111111111'
    )
  })

  it('sendStaffPortalMagicLink sends email when email provider is configured', async () => {
    isEmailConfigured.mockReturnValue(true)
    const { sendStaffPortalMagicLink } = await import('./staff-portal-mail.service.js')
    const { sendMail } = await import('./mailer.service.js')

    const result = await sendStaffPortalMagicLink({
      to: 'staff@example.com',
      displayName: 'Jane',
      sessionToken: '22222222-2222-2222-2222-222222222222',
      expiresAt: new Date().toISOString(),
    })

    expect(result.delivered).toBe(true)
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'staff@example.com',
        subject: expect.stringContaining('staff portal'),
      })
    )
  })

  it('sendStaffPortalMagicLink skips send when email is not configured', async () => {
    const { sendStaffPortalMagicLink } = await import('./staff-portal-mail.service.js')
    const { sendMail } = await import('./mailer.service.js')

    const result = await sendStaffPortalMagicLink({
      to: 'staff@example.com',
      displayName: 'Jane',
      sessionToken: '22222222-2222-2222-2222-222222222222',
      expiresAt: new Date().toISOString(),
    })

    expect(result.delivered).toBe(false)
    expect(result.preview).toBe(true)
    expect(sendMail).not.toHaveBeenCalled()
  })
})
