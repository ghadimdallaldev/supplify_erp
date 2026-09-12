import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDeactivate = vi.fn()
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockQuery = vi.fn()
const mockIsTenantUnlocked = vi.fn()

vi.mock('../services/promotions.service.js', () => ({
  deactivateExpiredPromotions: (...args) => mockDeactivate(...args),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyDealExpired: (...args) => mockNotify(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/background-write-locks.js', () => ({
  isTenantUnlockedForBackgroundWrites: (...args) => mockIsTenantUnlocked(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn() },
}))

describe('runDeactivateExpiredPromotionsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTenantUnlocked.mockResolvedValue(true)
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
        { id: 'p1', supplier_id: 'supplier-1', title: 'Deal 1' },
        { id: 'p2', supplier_id: 'supplier-1', title: 'Deal 2' },
      ],
    })

    const { runDeactivateExpiredPromotionsJob } = await import('./promotions-expiry.job.js')
    await runDeactivateExpiredPromotionsJob()

    expect(mockNotify).toHaveBeenCalledTimes(2)
  })
  it('skips deal expired notifications for locked suppliers', async () => {
    mockDeactivate.mockResolvedValueOnce({
      expiredCount: 1,
      activatedCount: 0,
      ids: ['p1'],
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p1', supplier_id: 'supplier-locked', title: 'Deal 1' }],
    })
    mockIsTenantUnlocked.mockResolvedValueOnce(false)

    const { runDeactivateExpiredPromotionsJob } = await import('./promotions-expiry.job.js')
    const result = await runDeactivateExpiredPromotionsJob()

    expect(mockIsTenantUnlocked).toHaveBeenCalledWith({
      tenantId: 'supplier-locked',
      tenantType: 'SUPPLIER',
    })
    expect(mockNotify).not.toHaveBeenCalled()
    expect(result.notificationsSkippedLocked).toBe(1)
  })
})
