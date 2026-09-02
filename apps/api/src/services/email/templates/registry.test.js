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
    expect(rendered.html).toContain('#7c3aed')
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

  it('renders OTP with code hero', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('auth.email_otp_login', { code: '123456' })
    expect(rendered.html).toContain('123456')
    expect(rendered.html).toContain('#ede9fe')
    expect(rendered.text).toContain('123456')
    expect(rendered.html).not.toContain('background:#7c3aed')
  })

  it('includes order detail strip when order fields present', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('order.placed', {
      message: 'A new order arrived.',
      orderId: 'ORD-9',
      status: 'Placed',
      amount: '$42.00',
      ctaUrl: '/app/orders/ORD-9',
    })
    expect(rendered.html).toContain('ORD-9')
    expect(rendered.html).toContain('#7c3aed')
    expect(rendered.html).toContain('border-top:1px solid #e2e8f0')
  })

  it('omits detail strip when no structured fields', async () => {
    const { renderTemplate } = await import('./registry.js')
    const rendered = renderTemplate('order.placed', {
      message: 'A new order arrived.',
    })
    expect(rendered.html).not.toContain('border-top:1px solid #e2e8f0')
  })
})
