import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn() }))

import { query } from '../lib/db.js'
import {
  PROSPECT_VIEW_COLUMNS,
  listProspects,
  matchSingleProspect,
} from './supplier-customer-matching.service.js'

describe('supplier-customer-matching.service', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('name fragments never match', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            restaurant_name: 'Zaatar House',
            area_region: 'Beirut',
            email: null,
            phone: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [] })
    const result = await matchSingleProspect('p1')
    expect(result).toMatchObject({ matchStatus: 'import_only', matchedRestaurantId: null })
    const sql = vi.mocked(query).mock.calls.map((c) => String(c[0]))
    expect(sql.some((q) => /LIKE|ILIKE/.test(q) && /restaurant/.test(q))).toBe(false)
  })

  it('matches only an exact normalised email or phone', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', restaurant_name: 'X', email: ' Owner@Cafe.test ', phone: null }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
      .mockResolvedValue({ rows: [] })
    const result = await matchSingleProspect('p1')
    expect(result.matchedRestaurantId).toBe('r1')
    expect(vi.mocked(query).mock.calls[1][1]).toEqual(['owner@cafe.test'])
  })

  it('prospect payloads contain no match fields', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
    await listProspects('sup-1')
    const [sql] = vi.mocked(query).mock.calls[0]
    expect(sql).not.toMatch(/p\.\*|matched_restaurant_name|LEFT JOIN restaurant/)
    expect(PROSPECT_VIEW_COLUMNS).not.toMatch(
      /match_status|match_signals|p\.matched_restaurant_id AS/
    )
    for (const col of [
      'name',
      'email',
      'phone',
      'contact_person',
      'area_region',
      'status',
      'invited_at',
    ]) {
      expect(PROSPECT_VIEW_COLUMNS).toContain(col)
    }
  })
})
