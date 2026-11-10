import { describe, expect, it } from 'vitest'
import { ORDER_TAB_STATUSES, orderMatchesTab, serverStatusForTab } from './orderTabs'

describe('orderTabs', () => {
  it('puts every status in at most one tab', () => {
    const seen = new Map<string, string>()
    for (const [tab, statuses] of Object.entries(ORDER_TAB_STATUSES)) {
      for (const status of statuses) {
        expect(seen.get(status), `${status} appears in two tabs`).toBeUndefined()
        seen.set(status, tab)
      }
    }
  })

  it('places delivered and received statuses in the completed tab', () => {
    for (const status of ['DELIVERED', 'RECEIVED_PARTIAL', 'RECEIVED_FULL', 'INVOICED']) {
      expect(orderMatchesTab('completed', status)).toBe(true)
    }
    expect(orderMatchesTab('shipped', 'SHIPPED')).toBe(true)
    expect(orderMatchesTab('processing', 'SHIPPED')).toBe(false)
  })

  it('only offers a server status for single-status tabs', () => {
    expect(serverStatusForTab('new')).toBe('PLACED')
    expect(serverStatusForTab('shipped')).toBe('SHIPPED')
    expect(serverStatusForTab('processing')).toBeUndefined()
    expect(serverStatusForTab('all')).toBeUndefined()
  })

  it('matches everything on the all tab', () => {
    expect(orderMatchesTab('all', 'CANCELLED')).toBe(true)
  })
})
