import { describe, expect, it } from 'vitest'
import {
  canSelectOrderForRoute,
  computeDispatchSummary,
  filterDispatchBoard,
  formatOrderRef,
  hasActiveDispatchFilters,
  DISPATCH_FILTER_ALL,
} from './fulfillmentDispatchUtils'
import type { DispatchOrderCard } from '../../types'

const sampleOrder = (id: string): DispatchOrderCard => ({
  id,
  status: 'SHIPPED',
  total_amount: 100,
  created_at: '2026-05-28T10:00:00Z',
  restaurant_name: `Restaurant ${id}`,
  item_count: 3,
})

describe('fulfillmentDispatchUtils', () => {
  it('hasActiveDispatchFilters detects active filters', () => {
    expect(
      hasActiveDispatchFilters({
        date: '',
        status: DISPATCH_FILTER_ALL,
        driverId: DISPATCH_FILTER_ALL,
        area: '',
      })
    ).toBe(false)
    expect(
      hasActiveDispatchFilters({
        date: '2026-05-28',
        status: DISPATCH_FILTER_ALL,
        driverId: DISPATCH_FILTER_ALL,
        area: '',
      })
    ).toBe(true)
  })

  it('filterDispatchBoard keeps only allowed order ids', () => {
    const data = {
      pending: [sampleOrder('a'), sampleOrder('b')],
      assigned: [],
      out_for_delivery: [],
      delivered_today: [],
      stats: { pending: 2, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
    }
    const filtered = filterDispatchBoard(data, new Set(['a']))
    expect(filtered.pending).toHaveLength(1)
    expect(filtered.pending[0].id).toBe('a')
    expect(filtered.stats.pending).toBe(1)
  })

  it('computeDispatchSummary uses board stats when provided', () => {
    const summary = computeDispatchSummary(
      {
        pending: [],
        assigned: [],
        out_for_delivery: [],
        delivered_today: [],
        stats: { pending: 0, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
      },
      { total: 5, pending: 2, outForDelivery: 1, delivered: 1, failed: 1, rescheduled: 0 }
    )
    expect(summary.total).toBe(5)
    expect(summary.failed).toBe(1)
  })

  it('formatOrderRef formats id prefix', () => {
    expect(formatOrderRef('abcdef12-3456-7890-abcd-ef1234567890')).toMatch(/^#ABCDEF12/)
  })

  it('canSelectOrderForRoute blocks orders on active route or wrong status', () => {
    expect(canSelectOrderForRoute({ status: 'SHIPPED' }).ok).toBe(true)
    expect(canSelectOrderForRoute({ active_route_id: 'r1', status: 'SHIPPED' }).ok).toBe(false)
    expect(canSelectOrderForRoute({ status: 'DELIVERED' }).ok).toBe(false)
  })
})
