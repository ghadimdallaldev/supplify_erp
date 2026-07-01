import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendTemplateEmail = vi.fn().mockResolvedValue({ sent: true })

vi.mock('./email/email.service.js', () => ({
  sendTemplateEmail: (...args) => sendTemplateEmail(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/app-url.js', () => ({
  buildAppUrl: (path) => `https://app.test${path.startsWith('/') ? path : `/${path}`}`,
}))

describe('invitation-mail.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sendTeamInvitationEmail uses auth.team_invite template with absolute invite URL', async () => {
    const { sendTeamInvitationEmail } = await import('./invitation-mail.service.js')

    const result = await sendTeamInvitationEmail({
      to: 'chef@restaurant.test',
      inviteUrl: 'https://app.test/invite?token=abc&type=rm',
      invitedName: 'Chef',
      tenantName: 'Acme Bistro',
      tenantType: 'RESTAURANT',
      invitationId: 'inv-1',
      tenantId: 'tenant-1',
    })

    expect(result.delivered).toBe(true)
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chef@restaurant.test',
        template: 'auth.team_invite',
        data: expect.objectContaining({
          inviteUrl: 'https://app.test/invite?token=abc&type=rm',
          invitedName: 'Chef',
          tenantName: 'Acme Bistro',
        }),
        eventType: 'auth.team_invite',
        eventKey: 'invite:inv-1:created',
      })
    )
  })

  it('skips when recipient or invite URL is missing', async () => {
    const { sendTeamInvitationEmail } = await import('./invitation-mail.service.js')
    const result = await sendTeamInvitationEmail({ to: '', inviteUrl: '' })
    expect(result.skipped).toBe(true)
    expect(sendTemplateEmail).not.toHaveBeenCalled()
  })
})
