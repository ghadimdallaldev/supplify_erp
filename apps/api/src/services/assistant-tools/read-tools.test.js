import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../../lib/tenant-timezone.js', () => ({
  getRestaurantTimezone: vi.fn(async () => 'Asia/Beirut'),
  zonedDayBounds: vi.fn(() => ({
    start: new Date('2026-11-13T22:00:00Z'),
    end: new Date('2026-11-14T21:59:59.999Z'),
  })),
}))
vi.mock('../../lib/reservation-availability.js', () => ({ getRestaurantSlotAvailability: vi.fn() }))
vi.mock('../../lib/branch-scope.js', () => ({ assertLegacyBranchOwnedByRestaurant: vi.fn() }))
import { query } from '../../lib/db.js'
import { getRestaurantSlotAvailability } from '../../lib/reservation-availability.js'
import { assertLegacyBranchOwnedByRestaurant } from '../../lib/branch-scope.js'
import { createReadTools } from './read-tools.js'
import { withAssistantEvidence } from './evidence.js'
const tools = createReadTools({ can: (ctx, key) => ctx.permissions.includes(key) })
const ctx = {
  tenantType: 'RESTAURANT',
  tenantId: 'r1',
  permissions: ['RESERVATIONS_VIEW', 'CATALOG_VIEW'],
}
beforeEach(() => vi.clearAllMocks())
describe('targeted read-only assistant tools', () => {
  it('does not expose restaurant reservations to suppliers or users without the permission', async () => {
    expect(await tools.get_reservations.available({ ...ctx, permissions: [] })).toBe(false)
    expect(await tools.get_reservations.available({ ...ctx, tenantType: 'SUPPLIER' })).toBe(false)
    expect(await tools.get_reservations.available(ctx)).toBe(true)
  })
  it('returns full reservation counts separately from the bounded guest list', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ status: 'CONFIRMED', count: 20, covers: 50 }] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 16 }, (_, i) => ({ id: String(i) })) })
    const result = await tools.get_reservations.run(ctx, { date: '2026-11-14', branchId: 'b1' })
    expect(assertLegacyBranchOwnedByRestaurant).toHaveBeenCalledWith('b1', 'r1')
    expect(result.summary[0].count).toBe(20)
    expect(result.reservations).toHaveLength(15)
    expect(result.hasMore).toBe(true)
    expect(query.mock.calls[0][1]).toEqual([
      'r1',
      '2026-11-13T22:00:00.000Z',
      '2026-11-14T22:00:00.000Z',
      'b1',
    ])
  })
  it('uses the shared availability engine and explains missing table configuration', async () => {
    query.mockResolvedValue({ rows: [{ operating_hours: {} }] })
    getRestaurantSlotAvailability.mockResolvedValue({ slots: [], tableCount: 0 })
    const result = await tools.get_reservation_availability.run(ctx, {
      partySize: 4,
      date: '2026-11-14',
    })
    expect(result.note).toContain('Configure')
    expect(result.availableSlotCount).toBe(0)
    expect(getRestaurantSlotAvailability).toHaveBeenCalledWith(
      query,
      expect.objectContaining({ restaurantId: 'r1', partySize: 4 })
    )
  })
  it('keeps catalog results scoped and hides blocked supplier organizations', async () => {
    query.mockResolvedValue({ rows: [] })
    await tools.search_products.run(ctx, { search: 'Tomato' })
    expect(query.mock.calls[0][1]).toEqual(['r1', 'Tomato', 'RESTAURANT'])
    expect(query.mock.calls[0][0]).toContain('supplier_blocklist')
    expect(query.mock.calls[0][0]).toContain('supplier_follow')
  })
  it('labels unavailable and bounded evidence honestly', () => {
    const result = withAssistantEvidence(ctx, 'get_inventory', {
      items: Array(15).fill({}),
      error: 'unavailable',
    })
    expect(result.evidence).toMatchObject({
      limited: true,
      status: 'unavailable',
      totalCount: null,
      scopeId: 'r1',
    })
  })
})
