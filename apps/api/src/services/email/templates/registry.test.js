import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/env.js', () => ({
  config: { WEB_ORIGIN: 'https://app.supplify.test' },
}))

describe('email template registry', () => {
  it('renders team invite with absolute CTA URL', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('auth.team_invite', {
      tenantName: 'Bistro One',
      invitedName: 'Sam',
      inviteUrl: 'https://app.supplify.test/invite?token=abc',
    })
    expect(rendered.subject).toContain('Bistro One')
    expect(rendered.html).toContain('https://app.supplify.test/invite?token=abc')
    expect(rendered.text).toContain('Sam')
  })

  it('renders staff invite with temporary password copy', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('staff.invite', {
      recipientName: 'Jane',
      loginUrl: 'https://app.supplify.test/staff/login',
      temporaryPassword: 'TempPass123!',
    })
    expect(rendered.html).toContain('TempPass123!')
    expect(rendered.html).toContain('https://app.supplify.test/staff/login')
  })

  it('prefixes relative default CTA paths', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('auth.welcome', {
      tenantName: 'Bistro One',
      tenantType: 'RESTAURANT',
    })
    expect(rendered.html).toContain('https://app.supplify.test/app')
  })
})
