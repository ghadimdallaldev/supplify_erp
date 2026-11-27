import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  blocked: false,
  following: false,
  followCount: 0,
  limit: 5,
  calls: [],
}))

function fakeClient() {
  return {
    query: vi.fn(async (sql, params) => {
      state.calls.push(sql)
      if (/FROM supplier s\b[\s\S]*WHERE s\.id = \$1/.test(sql) && /main_id/.test(sql)) {
        return { rows: [{ org_id: 'org-1', main_id: 'sup-main', name: 'Fresh Co' }] }
      }
      if (/AS blocked/.test(sql) && /AS following/.test(sql)) {
        return { rows: [{ blocked: state.blocked, following: state.following }] }
      }
      if (/count\(\*\)/i.test(sql) && /supplier_follow/.test(sql)) {
        return { rows: [{ count: state.followCount }] }
      }
      if (/INSERT INTO supplier_follow/.test(sql)) return { rows: [{ id: 'f1' }], rowCount: 1 }
      if (/DELETE FROM supplier_follow/.test(sql)) return { rows: [], rowCount: 1 }
      if (/INSERT INTO supplier_blocklist/.test(sql)) return { rows: [{ id: 'b1' }], rowCount: 1 }
      if (/DELETE FROM supplier_blocklist/.test(sql)) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }),
  }
}

vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql, params) => fakeClient().query(sql, params)),
  withTransaction: vi.fn(async (cb) => cb(fakeClient())),
}))
vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn(async () => ({ isUnlimited: false, limit: state.limit })),
}))

import {
  SupplierBlockedError,
  SupplierFollowLimitError,
  blockSupplier,
  followSupplier,
  unblockSupplier,
  unfollowSupplier,
} from './relationship-writes.service.js'
import { onRelationshipChanged, resetRelationshipHooksForTests } from '../lib/relationship.js'

beforeEach(() => {
  Object.assign(state, { blocked: false, following: false, followCount: 0, limit: 5, calls: [] })
  resetRelationshipHooksForTests()
})

describe('relationship writes', () => {
  it('follow refuses a blocked supplier with SUPPLIER_BLOCKED', async () => {
    state.blocked = true
    const err = await followSupplier({
      restaurantId: 'r1',
      supplierId: 's1',
      source: 'manual',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(SupplierBlockedError)
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('SUPPLIER_BLOCKED')
    expect(state.calls.some((s) => /INSERT INTO supplier_follow/.test(s))).toBe(false)
  })

  it('block removes the follow', async () => {
    state.following = true
    await blockSupplier({ restaurantId: 'r1', supplierId: 's1' })
    const deleteIdx = state.calls.findIndex((s) => /DELETE FROM supplier_follow/.test(s))
    const insertIdx = state.calls.findIndex((s) => /INSERT INTO supplier_blocklist/.test(s))
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
  })

  it('duplicate follow is idempotent', async () => {
    state.following = true
    const result = await followSupplier({ restaurantId: 'r1', supplierId: 's1', source: 'manual' })
    expect(result).toMatchObject({ followed: true, alreadyFollowing: true })
    expect(state.calls.some((s) => /INSERT INTO supplier_follow/.test(s))).toBe(false)
  })

  it('invite and referral follows enforce the cap', async () => {
    state.followCount = 5
    for (const source of ['invite', 'referral', 'manual']) {
      const err = await followSupplier({ restaurantId: 'r1', supplierId: 's1', source }).catch(
        (e) => e
      )
      expect(err).toBeInstanceOf(SupplierFollowLimitError)
      expect(err.details).toMatchObject({ current: 5, limit: 5 })
    }
  })

  it('takes the relationship lock before the cap lock', async () => {
    await followSupplier({ restaurantId: 'r1', supplierId: 's1', source: 'manual' })
    const rel = state.calls.findIndex((s) => /'rel:'/.test(s))
    const cap = state.calls.findIndex((s) => /'follow-cap:'/.test(s))
    expect(rel).toBeGreaterThan(-1)
    expect(cap).toBeGreaterThan(rel)
  })

  it('emits the change after commit for every write kind', async () => {
    const kinds = []
    onRelationshipChanged((e) => kinds.push([e.kind, e.supplierOrgId, e.restaurantId]))
    await followSupplier({ restaurantId: 'r1', supplierId: 's1', source: 'manual' })
    await unfollowSupplier({ restaurantId: 'r1', supplierId: 's1' })
    await blockSupplier({ restaurantId: 'r1', supplierId: 's1' })
    await unblockSupplier({ restaurantId: 'r1', supplierId: 's1' })
    expect(kinds).toEqual([
      ['follow', 'org-1', 'r1'],
      ['unfollow', 'org-1', 'r1'],
      ['block', 'org-1', 'r1'],
      ['unblock', 'org-1', 'r1'],
    ])
  })

  it('inside a caller transaction it does not emit and returns the event', async () => {
    const kinds = []
    onRelationshipChanged((e) => kinds.push(e.kind))
    const client = fakeClient()
    const result = await followSupplier(
      { restaurantId: 'r1', supplierId: 's1', source: 'referral' },
      client
    )
    expect(kinds).toEqual([])
    expect(result.event).toEqual({ restaurantId: 'r1', supplierOrgId: 'org-1', kind: 'follow' })
  })
})
