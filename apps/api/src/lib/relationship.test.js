import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('./db.js', () => ({ query: queryMock }))

import {
  OPEN_ORDER_STATUSES,
  blockedExistsSql,
  canTransact,
  canViewCatalog,
  catalogVisibleSql,
  emitRelationshipChanged,
  followExistsSql,
  followRequired,
  getRelationship,
  lockRelationshipExclusive,
  lockRelationshipShared,
  onRelationshipChanged,
  resetRelationshipHooksForTests,
  restaurantNotAvailable,
  supplierOrgIdSql,
  transactableSupplierIds,
} from './relationship.js'

function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

beforeEach(() => {
  queryMock.mockReset()
  resetRelationshipHooksForTests()
})

describe('relationship SQL fragments', () => {
  it('fragments match at organisation level', () => {
    expect(supplierOrgIdSql('s')).toBe('COALESCE(s.organization_id, s.id)')
    const follow = followExistsSql('$1', 's')
    expect(follow).toContain('supplier_follow')
    expect(follow).toContain('.supplier_org_id = COALESCE(s.organization_id, s.id)')
    expect(follow).toContain('.restaurant_id = $1')
    expect(follow).not.toMatch(/\.supplier_id\b/)
    const blocked = blockedExistsSql('$1', 's')
    expect(blocked).toContain('supplier_blocklist')
    expect(blocked).toContain('.supplier_org_id = COALESCE(s.organization_id, s.id)')
    expect(blocked).not.toMatch(/\.supplier_id\b/)
  })

  it('catalogVisibleSql is not blocked and (follow or public catalog)', () => {
    const sql = catalogVisibleSql('$2', 'sp')
    expect(sql).toContain(`NOT ${blockedExistsSql('$2', 'sp')}`)
    expect(sql).toContain(followExistsSql('$2', 'sp'))
    expect(sql).toContain('sp.public_catalog_enabled')
  })

  it('aliases inside fragments do not collide when two suppliers are checked in one query', () => {
    expect(followExistsSql('$1', 'a')).not.toBe(followExistsSql('$1', 'b'))
    const aliasesA = followExistsSql('$1', 'a').match(/supplier_follow (\w+)/)[1]
    const aliasesB = followExistsSql('$1', 'b').match(/supplier_follow (\w+)/)[1]
    expect(aliasesA).not.toBe(aliasesB)
  })

  it('exports the open order statuses', () => {
    expect(OPEN_ORDER_STATUSES).toEqual([
      'PENDING_APPROVAL',
      'PLACED',
      'ACKNOWLEDGED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'RECEIVED_PARTIAL',
      'RECEIVED_WITH_DISPUTE',
    ])
  })
})

describe('relationship predicates (one query each)', () => {
  it('canTransact false when blocked', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ org_id: 'o1', following: true, blocked: true, public_catalog: true }],
    })
    await expect(canTransact('r1', 's1')).resolves.toBe(false)
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('canTransact true when following and not blocked', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ org_id: 'o1', following: true, blocked: false, public_catalog: false }],
    })
    await expect(canTransact('r1', 's1')).resolves.toBe(true)
  })

  it('canViewCatalog true for public catalog without follow, false for private', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ org_id: 'o1', following: false, blocked: false, public_catalog: true }],
    })
    await expect(canViewCatalog('r1', 's1')).resolves.toBe(true)
    queryMock.mockResolvedValueOnce({
      rows: [{ org_id: 'o1', following: false, blocked: false, public_catalog: false }],
    })
    await expect(canViewCatalog('r1', 's1')).resolves.toBe(false)
    queryMock.mockResolvedValueOnce({
      rows: [{ org_id: 'o1', following: true, blocked: true, public_catalog: true }],
    })
    await expect(canViewCatalog('r1', 's1')).resolves.toBe(false)
  })

  it('getRelationship for an unknown supplier is all false', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(getRelationship('r1', 'nope')).resolves.toEqual({
      orgId: null,
      following: false,
      blocked: false,
      publicCatalog: false,
    })
  })

  it('accepts a transaction client as db', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) }
    await getRelationship('r1', 's1', client)
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('transactableSupplierIds reports missing with names', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 's1', name: 'Fresh Co', following: true, blocked: false },
        { id: 's2', name: 'Bakery', following: false, blocked: false },
        { id: 's3', name: 'Blocked Ltd', following: true, blocked: true },
      ],
    })
    const result = await transactableSupplierIds('r1', ['s1', 's2', 's3', 's1'])
    expect([...result.allowed]).toEqual(['s1'])
    expect(result.missing).toEqual([
      { id: 's2', name: 'Bakery' },
      { id: 's3', name: 'Blocked Ltd' },
    ])
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('transactableSupplierIds skips the query for an empty list', async () => {
    const result = await transactableSupplierIds('r1', [])
    expect(result.allowed.size).toBe(0)
    expect(result.missing).toEqual([])
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('advisory locks', () => {
  it('shared and exclusive locks use the rel:<restaurant>:<org> key', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) }
    await lockRelationshipShared(client, 'r1', 'o1')
    await lockRelationshipExclusive(client, 'r1', 'o1')
    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock_shared')
    expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock\(/)
    for (const call of client.query.mock.calls) {
      expect(call[0]).toContain("hashtextextended('rel:' || $1 || ':' || $2, 0)")
      expect(call[1]).toEqual(['r1', 'o1'])
    }
  })
})

describe('error responses', () => {
  it('restaurantNotAvailable is a 404 with a fixed body', () => {
    const res = mockRes()
    restaurantNotAvailable(res, { requestId: 'req-1' })
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      data: null,
      error: { name: 'RESTAURANT_NOT_AVAILABLE', message: 'Restaurant not available' },
      requestId: 'req-1',
    })
  })

  it('followRequired is a 403 listing the suppliers', () => {
    const res = mockRes()
    followRequired(res, { requestId: 'req-2' }, [{ id: 's2', name: 'Bakery' }])
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json.mock.calls[0][0].error).toMatchObject({
      name: 'FOLLOW_REQUIRED',
      details: { suppliers: [{ id: 's2', name: 'Bakery' }] },
    })
  })
})

describe('relationship change hooks', () => {
  it('awaits every hook and keeps going when one fails', async () => {
    const seen = []
    onRelationshipChanged(async (evt) => {
      await new Promise((r) => setTimeout(r, 5))
      seen.push(['a', evt.kind])
    })
    onRelationshipChanged(async () => {
      throw new Error('boom')
    })
    onRelationshipChanged((evt) => seen.push(['c', evt.kind]))
    await emitRelationshipChanged({ restaurantId: 'r1', supplierOrgId: 'o1', kind: 'block' })
    expect(seen).toEqual([
      ['a', 'block'],
      ['c', 'block'],
    ])
  })
})
