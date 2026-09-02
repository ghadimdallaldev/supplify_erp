import { describe, expect, it } from 'vitest'
import { renderEmailLayout, renderOtpCode, renderDetailStrip } from './layout.js'

describe('email layout helpers', () => {
  it('uses violet brand wordmark and CTA (not slate generic)', () => {
    const { html } = renderEmailLayout({
      title: 'Hello',
      bodyHtml: '<p>Body</p>',
      ctaUrl: 'https://app.example/app',
      ctaLabel: 'Open',
      locale: 'en',
    })
    expect(html).toContain('#5b21b6')
    expect(html).toContain('#7c3aed')
    expect(html).toContain('#f8fafc')
    expect(html).not.toMatch(/text-transform:uppercase;color:#64748b/)
  })

  it('renders OTP code hero with pale violet box', () => {
    const block = renderOtpCode('482193', {
      expiryText: 'Expires in 10 minutes',
      reassuranceText: 'If you did not request this, ignore this email.',
    })
    expect(block).toContain('482193')
    expect(block).toContain('#ede9fe')
    expect(block).toContain('Expires in 10 minutes')
  })

  it('omits detail strip when rows empty', () => {
    expect(renderDetailStrip([])).toBe('')
    expect(renderDetailStrip([{ label: 'Order', value: '' }])).toBe('')
  })

  it('renders detail strip rows when values present', () => {
    const html = renderDetailStrip([
      { label: 'Order', value: '#4821' },
      { label: 'Total', value: '$120.00' },
    ])
    expect(html).toContain('Order')
    expect(html).toContain('#4821')
    expect(html).toContain('$120.00')
  })

  it('sets rtl dir for Arabic locale', () => {
    const { html } = renderEmailLayout({
      title: 'مرحبا',
      bodyHtml: '<p>نص</p>',
      locale: 'ar',
    })
    expect(html).toMatch(/dir="rtl"/)
  })
})
