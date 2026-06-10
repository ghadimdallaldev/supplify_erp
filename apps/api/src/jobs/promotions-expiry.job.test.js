import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDeactivate = vi.fn()
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockQuery = vi.fn()

vi.mock('../services/promotions.service.js', () => ({
  deactivateExpiredPromotions: (...args) => mockDeactivate(...args),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyDealExpired: (...args) => mockNotify(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn() },
}))

describe('runDeactivateExpiredPromotionsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies only when promotions were expired in this run', async () => {
    mockDeactivate.mockResolvedValueOnce({ expiredCount: 0, activatedCount: 0, ids: [] })
    const { runDeactivateExpiredPromotionsJob } = await import('./promotions-expiry.job.js')
    await runDeactivateExpiredPromotionsJob()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('sends deal expired notifications for returned ids', async () => {
    mockDeactivate.mockResolvedValueOnce({
      expiredCount: 2,
      activatedCount: 1,
      ids: ['p1', 'p2'],
    })
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p1', title: 'Deal 1' },
        { id: 'p2', title: 'Deal 2' },
      ],
    })

    const { runDeactivateExpiredPromotionsJob } = await import('./promotions-expiry.job.js')
    await runDeactivateExpiredPromotionsJob()

    expect(mockNotify).toHaveBeenCalledTimes(2)
  })
})
