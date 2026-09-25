import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const sendTemplateEmail = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => query(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

vi.mock('../services/email/email.service.js', () => ({
  sendTemplateEmail: (...args) => sendTemplateEmail(...args),
}))

vi.mock('../services/whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

describe('runReservationGuestCommsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReset()
    sendTemplateEmail.mockResolvedValue({ sent: true })
  })

  it('does not remind a guest whose booking was cancelled before the reminder was claimed', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'res-1',
            status: 'CONFIRMED',
            customer_email: 'guest@example.com',
            scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            party_size: 2,
            restaurant_name: 'Golden Fork',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runReservationGuestCommsJob } = await import('./reservation-guest-comms.job.js')
    const stats = await runReservationGuestCommsJob()

    expect(stats.reminders24h).toBe(0)
    expect(sendTemplateEmail).not.toHaveBeenCalled()
    const claim = query.mock.calls[1]
    expect(String(claim[0])).toContain("status IN ('PENDING', 'CONFIRMED')")
  })
})
