import { describe, it, expect } from 'vitest'
import {
  getOrderPlaceGate,
  formatOrderPlaceGateMessage,
  getOrderUsageBadge,
  isQuickListSchedulingEnabled,
  getQuickListScheduleGate,
} from './planLimits'
import type { Entitlements } from '../types'

const baseEntitlements = (limits: Record<string, number>, usage: Record<string, number>) =>
  ({
    plan: { name: 'Free', code: 'free' },
    limits,
    usage,
    features: {},
  }) as Entitlements

describe('getOrderPlaceGate', () => {
  it('allows when under limit', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 1 }),
      1
    )
    expect(gate.canPlace).toBe(true)
    expect(gate.reason).toBe('ok')
    expect(gate.remaining).toBe(2)
  })

  it('blocks when at limit', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 3 }),
      1
    )
    expect(gate.canPlace).toBe(false)
    expect(gate.reason).toBe('at_limit')
  })

  it('blocks when cart would exceed limit (multi-supplier)', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 2 }),
      2
    )
    expect(gate.canPlace).toBe(false)
    expect(gate.reason).toBe('would_exceed')
  })

  it('treats unlimited as always allowed', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: -1 }, { orders_per_day: 99 }),
      5
    )
    expect(gate.canPlace).toBe(true)
    expect(gate.reason).toBe('unlimited')
  })
})

describe('formatOrderPlaceGateMessage', () => {
  it('mentions supplier split for would_exceed', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 2 }),
      2
    )
    const msg = formatOrderPlaceGateMessage(gate)
    expect(msg).toContain('2 orders')
    expect(msg).toContain('one per supplier')
  })
})

describe('getOrderUsageBadge', () => {
  it('returns null for unlimited', () => {
    expect(getOrderUsageBadge(baseEntitlements({ orders_per_day: -1 }, {}))).toBeNull()
  })

  it('flags at limit', () => {
    const badge = getOrderUsageBadge(baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 3 }))
    expect(badge?.label).toBe('3/3')
    expect(badge?.atLimit).toBe(true)
  })
})

describe('quick list scheduling', () => {
  it('enables scheduling for basic_single_schedule', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 0 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(isQuickListSchedulingEnabled(ent)).toBe(true)
  })

  it('blocks scheduling for basic_manual_only', () => {
    const ent = {
      ...baseEntitlements({}, {}),
      features: { quick_lists: 'basic_manual_only' },
    } as Entitlements
    expect(isQuickListSchedulingEnabled(ent)).toBe(false)
  })

  it('allows one scheduled list on Free', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 0 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(getQuickListScheduleGate(ent, false).canSchedule).toBe(true)
    expect(getQuickListScheduleGate(ent, true).canSchedule).toBe(true)
  })

  it('blocks a second scheduled list on Free', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 1 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(getQuickListScheduleGate(ent, false).canSchedule).toBe(false)
    expect(getQuickListScheduleGate(ent, true).canSchedule).toBe(true)
  })
})
