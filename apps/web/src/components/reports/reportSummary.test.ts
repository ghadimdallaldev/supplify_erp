import { describe, expect, it } from 'vitest'
import { sumByCurrency } from './reportSummary'

describe('sumByCurrency', () => {
  it('does not label a cost that has no currency as USD', () => {
    const value = sumByCurrency([{ total_cost: 12.5 }, { total_cost: 7.5 }], 'total_cost')
    expect(value).toBe('20.00')
    expect(value).not.toMatch(/USD|\$/)
  })

  it('keeps different currencies in separate totals', () => {
    const value = sumByCurrency(
      [
        { currency: 'JOD', total_spend: 10 },
        { currency: 'USD', total_spend: 3 },
      ],
      'total_spend'
    )
    expect(value).toContain('JOD')
    expect(value).toMatch(/USD|\$/)
    expect(value).not.toMatch(/13\.00/)
  })
})
