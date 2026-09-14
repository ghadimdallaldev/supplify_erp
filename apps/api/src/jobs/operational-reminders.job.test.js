import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/inventory-expiry.service.js', () => ({
  runExpiryReminderCheck: vi
    .fn()
    .mockResolvedValue({ restaurantsChecked: 2, notificationsSent: 1 }),
}))

vi.mock('../services/reorder-cadence.service.js', () => ({
  recomputeCadencePatterns: vi.fn().mockResolvedValue({ patternsProcessed: 5 }),
  runCadenceReminderCheck: vi.fn().mockResolvedValue({ missedCount: 1, notificationsSent: 1 }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn() },
}))

describe('runOperationalRemindersJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs expiry, cadence recompute, and cadence reminders', async () => {
    const { runOperationalRemindersJob } = await import('./operational-reminders.job.js')
    const { runExpiryReminderCheck } = await import('../services/inventory-expiry.service.js')
    const { recomputeCadencePatterns, runCadenceReminderCheck } = await import(
      '../services/reorder-cadence.service.js'
    )
    const { logger } = await import('../lib/logger.js')

    const result = await runOperationalRemindersJob()

    expect(runExpiryReminderCheck).toHaveBeenCalled()
    expect(recomputeCadencePatterns).toHaveBeenCalled()
    expect(runCadenceReminderCheck).toHaveBeenCalledWith({ notify: true })
    expect(result.expiry.notificationsSent).toBe(1)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'operational_reminders.completed' })
    )
  })
})
