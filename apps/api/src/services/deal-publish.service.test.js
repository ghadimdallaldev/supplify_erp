import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const withTransactionMock = vi.fn(async (fn) => fn({ query: queryMock }))

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (...args) => withTransactionMock(...args),
}))

import {
  applyBoostSelectionToDeal,
  computeBoostWindow,
  isDealBoostLive,
  resolveStatusAfterBoostApproval,
  snapshotBoostFieldsFromPackage,
} from './deal-publish.service.js'
import { isRestaurantVisibleDeal } from './deal-lifecycle.service.js'

describe('deal-publish.service', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('snapshots package price and duration at selection', () => {
    const snap = snapshotBoostFieldsFromPackage({
      id: 'pkg-1',
      pricing_key: 'boost_7_day',
      amount: 39,
      duration_days: 7,
    })
    expect(snap.boost_price_snapshot).toBe(39)
    expect(snap.boost_duration_days).toBe(7)
  })

  it('rejects inactive boost package on submit', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(applyBoostSelectionToDeal('deal-1', 'supplier-1', 'boost_flat')).rejects.toThrow(
      'Boost package is not available'
    )
  })

  it('resolveStatusAfterBoostApproval requires payment when amount > 0 and not waived', () => {
    const next = resolveStatusAfterBoostApproval(
      { starts_at: new Date().toISOString() },
      { boostAmount: 39, waivePayment: false }
    )
    expect(next.status).toBe('approved_pending_payment')
  })

  it('isRestaurantVisibleDeal requires live boost window', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const deal = {
      status: 'active',
      payment_status: 'not_required',
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: null,
      boost_start_at: '2026-06-01T00:00:00Z',
      boost_end_at: '2026-06-10T00:00:00Z',
    }
    expect(isRestaurantVisibleDeal(deal, { now })).toBe(true)
    expect(
      isRestaurantVisibleDeal({ ...deal, boost_end_at: '2026-05-01T00:00:00Z' }, { now })
    ).toBe(false)
  })

  it('computeBoostWindow uses duration days', () => {
    const window = computeBoostWindow({ boost_duration_days: 7 })
    const start = new Date(window.boost_start_at)
    const end = new Date(window.boost_end_at)
    const days = Math.round((end - start) / 86400000)
    expect(days).toBe(7)
  })

  it('isDealBoostLive checks window', () => {
    const now = new Date('2026-06-05T00:00:00Z')
    expect(
      isDealBoostLive(
        {
          boost_start_at: '2026-06-01T00:00:00Z',
          boost_end_at: '2026-06-10T00:00:00Z',
        },
        now
      )
    ).toBe(true)
  })
})
