import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { query } from './db.js'
import { buildAdminActivityFeed, normalizeActivityEvent } from './admin-activity-feed.js'

describe('admin-activity-feed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizeActivityEvent maps legacy and normalized fields', () => {
    const row = normalizeActivityEvent({
      id: '1',
      event_type: 'order_placed',
      title: 'Order placed — Cafe',
      subtitle: 'Cafe → Supplier',
      actor: 'Cafe',
      target: null,
      amount: 42.5,
      occurred_at: '2026-05-28T12:00:00.000Z',
      tenant_name: 'Cafe',
      tenant_type: 'RESTAURANT',
      status_label: 'PLACED',
      link_path: '/orders/1',
    })
    expect(row.type).toBe('order_placed')
    expect(row.description).toBe('Cafe → Supplier')
    expect(row.actorName).toBe('Cafe')
    expect(row.tenantName).toBe('Cafe')
    expect(row.link).toBe('/orders/1')
    expect(row.amount).toBe(42.5)
  })

  it('buildAdminActivityFeed merges branch rows and paginates', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('order_placed')) {
        return {
          rows: [
            {
              id: 'o1',
              event_type: 'order_placed',
              title: 'Order placed — R1',
              subtitle: 'sub',
              actor: 'R1',
              target: null,
              amount: 10,
              occurred_at: new Date('2026-05-28T10:00:00Z'),
              tenant_name: 'R1',
              tenant_type: 'RESTAURANT',
              status_label: 'PLACED',
              link_path: '/orders/o1',
            },
          ],
        }
      }
      if (sql.includes('new_tenant')) {
        return {
          rows: [
            {
              id: 's1',
              event_type: 'new_tenant',
              title: 'New supplier: S1',
              subtitle: 'a@b.com',
              actor: 'S1',
              target: null,
              amount: null,
              occurred_at: new Date('2026-05-28T11:00:00Z'),
              tenant_name: 'S1',
              tenant_type: 'SUPPLIER',
              status_label: null,
              link_path: null,
            },
          ],
        }
      }
      return { rows: [] }
    })

    const result = await buildAdminActivityFeed({ limit: 10, offset: 0, days: 14 })
    expect(result.events.length).toBeGreaterThanOrEqual(2)
    expect(result.days).toBe(14)
    const sqlCalls = query.mock.calls.map((c) => c[0])
    expect(sqlCalls.some((sql) => sql.includes("INTERVAL '1 day'"))).toBe(true)
    expect(result.events[0].event_type).toBe('new_tenant')
    expect(result.sources.length).toBeGreaterThan(0)
  })

  it('buildAdminActivityFeed continues when a branch fails', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('order_placed')) {
        throw Object.assign(new Error('bad enum'), { code: '22P02' })
      }
      if (sql.includes('new_tenant')) {
        return {
          rows: [
            {
              id: 'r1',
              event_type: 'new_tenant',
              title: 'New restaurant: R1',
              subtitle: '',
              actor: 'R1',
              target: null,
              amount: null,
              occurred_at: new Date('2026-05-28T09:00:00Z'),
              tenant_name: 'R1',
              tenant_type: 'RESTAURANT',
              status_label: null,
              link_path: null,
            },
          ],
        }
      }
      return { rows: [] }
    })

    const result = await buildAdminActivityFeed({ limit: 5 })
    expect(result.events.some((e) => e.event_type === 'new_tenant')).toBe(true)
    expect(result.partial).toBe(true)
    expect(result.failedSources).toContain('order_placed')
  })
})
