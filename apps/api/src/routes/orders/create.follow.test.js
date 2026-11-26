import { describe, expect, it, vi } from 'vitest'

import { FollowRequiredError } from '../../lib/relationship.js'
import { SupplierBlockedError } from '../../services/relationship-writes.service.js'
import {
  lockAndAssertOrderRelationships,
  lockAndPartitionOrderSuppliers,
} from '../../services/order-relationship-guard.service.js'

/**
 * Fake transaction client. `suppliers` maps supplier id → { org, name, following, blocked }.
 * Records every SQL statement so lock order and the absence of a past-order clause can be
 * asserted.
 */
function fakeClient(suppliers) {
  const calls = []
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params })
      if (/pg_advisory_xact_lock_shared/.test(sql)) return { rows: [] }
      if (/SELECT id, organization_id FROM supplier/.test(sql)) {
        return {
          rows: params[0]
            .filter((id) => suppliers[id])
            .map((id) => ({ id, organization_id: suppliers[id].org })),
        }
      }
      if (/AS following/.test(sql) && /AS blocked/.test(sql)) {
        return {
          rows: params[1]
            .filter((id) => suppliers[id])
            .map((id) => ({
              id,
              name: suppliers[id].name,
              following: suppliers[id].following,
              blocked: suppliers[id].blocked,
            })),
        }
      }
      return { rows: [] }
    }),
  }
}

describe('order relationship guard', () => {
  it('cart with an unfollowed supplier is FOLLOW_REQUIRED listing it', async () => {
    const client = fakeClient({
      s1: { org: 'org-b', name: 'Followed Co', following: true, blocked: false },
      s2: { org: 'org-a', name: 'Stranger Co', following: false, blocked: false },
    })
    const err = await lockAndAssertOrderRelationships(client, 'r1', ['s1', 's2']).catch((e) => e)
    expect(err).toBeInstanceOf(FollowRequiredError)
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FOLLOW_REQUIRED')
    expect(err.details.suppliers).toEqual([{ id: 's2', name: 'Stranger Co' }])
  })

  it('past order no longer grants ordering', async () => {
    const client = fakeClient({
      s1: { org: 'org-a', name: 'Old Supplier', following: false, blocked: false },
    })
    const err = await lockAndAssertOrderRelationships(client, 'r1', ['s1']).catch((e) => e)
    expect(err).toBeInstanceOf(FollowRequiredError)
    expect(client.calls.some((c) => /customer_order|order_item/.test(c.sql))).toBe(false)
  })

  it('takes the shared locks in ascending org id before checking', async () => {
    const client = fakeClient({
      s1: { org: 'org-c', name: 'C', following: true, blocked: false },
      s2: { org: 'org-a', name: 'A', following: true, blocked: false },
      s3: { org: 'org-b', name: 'B', following: true, blocked: false },
    })
    await lockAndAssertOrderRelationships(client, 'r1', ['s1', 's2', 's3'])
    const lockOrgs = client.calls
      .filter((c) => /pg_advisory_xact_lock_shared/.test(c.sql))
      .map((c) => c.params[1])
    expect(lockOrgs).toEqual(['org-a', 'org-b', 'org-c'])
    const firstCheck = client.calls.findIndex((c) => /AS following/.test(c.sql))
    const lastLock = client.calls.findLastIndex((c) => /pg_advisory_xact_lock_shared/.test(c.sql))
    expect(firstCheck).toBeGreaterThan(lastLock)
  })

  it('dispute replacement allowed without follow, refused when blocked', async () => {
    const notFollowing = fakeClient({
      s1: { org: 'org-a', name: 'A', following: false, blocked: false },
    })
    await expect(
      lockAndAssertOrderRelationships(notFollowing, 'r1', ['s1'], { mode: 'notBlocked' })
    ).resolves.toBeUndefined()

    const blocked = fakeClient({
      s1: { org: 'org-a', name: 'A', following: false, blocked: true },
    })
    const err = await lockAndAssertOrderRelationships(blocked, 'r1', ['s1'], {
      mode: 'notBlocked',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(SupplierBlockedError)
    expect(err.statusCode).toBe(409)
  })

  it('partition returns allowed and missing suppliers without throwing', async () => {
    const client = fakeClient({
      s1: { org: 'org-a', name: 'A', following: true, blocked: false },
      s2: { org: 'org-b', name: 'B', following: false, blocked: false },
    })
    const { allowed, missing } = await lockAndPartitionOrderSuppliers(client, 'r1', ['s1', 's2'])
    expect([...allowed]).toEqual(['s1'])
    expect(missing).toEqual([{ id: 's2', name: 'B', blocked: false }])
  })
})
