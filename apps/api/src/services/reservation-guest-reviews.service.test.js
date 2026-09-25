import { describe, expect, it } from 'vitest'
import { summarizeGuestIntelligence } from './reservation-guest-reviews.service.js'

describe('guest intelligence', () => {
  it('does not treat no-shows as visits or VIPs', () => {
    const summary = summarizeGuestIntelligence([
      { customer_name: 'Missed', visit_count: '0', no_show_count: '3', upcoming_count: '0' },
      { customer_name: 'Regular', visit_count: '3', no_show_count: '0', upcoming_count: '0' },
      { customer_name: 'Booked', visit_count: '0', no_show_count: '0', upcoming_count: '1' },
    ])

    expect(summary.vipGuests.map((guest) => guest.customer_name)).toEqual(['Regular'])
    expect(summary.followUps.map((guest) => guest.suggestion).join(' ')).toMatch(/No-show/)
    expect(summary.followUps.map((guest) => guest.suggestion).join(' ')).toMatch(/Upcoming/)
  })
})
