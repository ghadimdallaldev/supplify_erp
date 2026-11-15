import { formatDay, formatMoney, formatOrderRef, formatShortDate, orderShortId } from './format'

describe('format utils', () => {
  it('formatMoney handles invalid values', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney('not-a-number')).toBe('—')
  })

  it('formatMoney formats USD', () => {
    expect(formatMoney(12.5, 'USD')).toMatch(/12\.50/)
  })

  it('formatShortDate returns empty for bad input', () => {
    expect(formatShortDate(undefined)).toBe('')
    expect(formatShortDate('invalid')).toBe('')
  })

  it('formatShortDate formats ISO timestamps', () => {
    const out = formatShortDate('2026-06-18T14:30:00.000Z')
    expect(out.length).toBeGreaterThan(0)
  })

  it('formatDay labels today', () => {
    const today = new Date().toISOString()
    expect(formatDay(today)).toBe('Today')
  })

  it('orderShortId uses first 8 UUID chars, not last 8', () => {
    const fullId = '486db23d-52ee-4a96-93f0-85c028edea5f'
    expect(orderShortId(fullId)).toBe('486DB23D')
    expect(orderShortId(fullId)).not.toBe('28EDEA5F')
    expect(formatOrderRef(fullId)).toBe('#486DB23D')
  })
})
