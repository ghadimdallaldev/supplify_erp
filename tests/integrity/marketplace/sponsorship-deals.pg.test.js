import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Billing and programme config are outside this suite's subject: make every supplier an
// eligible, unlimited sponsor so only the relationship rules decide.
vi.mock('../../../apps/api/src/lib/billing/billing-service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSubscriptionForBilling: vi.fn(async () => ({ status: 'ACTIVE', plan_code: 'enterprise' })),
}))
vi.mock('../../../apps/api/src/lib/platform-settings.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getReferralProgramConfig: vi.fn(async () => ({
      ...(await actual.getReferralProgramConfig().catch(() => ({}))),
      sponsorshipEnabled: true,
      eligibleSponsorPlans: ['silver'],
      offerExpiryDays: 14,
      sponsorshipLimitsPerYear: { enterprise: null },
    })),
  }
})
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  assertSupplierActiveCustomerLocationCapacity: vi.fn(async () => undefined),
}))

import { resetMarketplaceDb, startMarketplaceDb } from './harness.js'
import { block, createRestaurant, createSupplierOrg, follow } from './fixtures.js'

let db
let sponsorship
let relationship
let writes

beforeAll(async () => {
  db = await startMarketplaceDb()
  sponsorship = await import('../../../apps/api/src/services/supplier-sponsorship.service.js')
  relationship = await import('../../../apps/api/src/lib/relationship.js')
  writes = await import('../../../apps/api/src/services/relationship-writes.service.js')
}, 180_000)
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const UNKNOWN = '00000000-0000-4000-8000-0000000000bb'

async function caught(promise) {
  try {
    await promise
    return null
  } catch (err) {
    return {
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
    }
  }
}

async function sponsorships(restaurantId) {
  const { rows } = await db.pool.query(
    'SELECT id, status, supplier_id FROM supplier_sponsorship WHERE restaurant_id = $1',
    [restaurantId]
  )
  return rows
}

describe('followers-only sponsorships (real PG)', () => {
  it('sponsorship offer only to followers; never reveals another supplier sponsorship', async () => {
    const mine = await createSupplierOrg(db.pool)
    const rival = await createSupplierOrg(db.pool)
    const follower = await createRestaurant(db.pool)
    const stranger = await createRestaurant(db.pool)
    await follow(db.pool, follower.id, mine.orgId)
    await follow(db.pool, follower.id, rival.orgId)

    const refused = await caught(
      sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: stranger.id })
    )
    expect(refused).toMatchObject({ code: 'RESTAURANT_NOT_AVAILABLE', statusCode: 404 })
    expect(await sponsorships(stranger.id)).toHaveLength(0)

    // The rival sponsors the follower first; my eligibility must not say why I'm refused.
    const rivalOffer = await sponsorship.createSponsorshipOffer(rival.branchIds[0], {
      restaurantId: follower.id,
    })
    expect(rivalOffer.sponsorship.status).toBe('offered')
    const eligibility = await sponsorship.canCreateSponsorship(mine.branchIds[0], {
      restaurantId: follower.id,
    })
    expect(eligibility.eligible).toBe(false)
    expect(eligibility.reasons).not.toContain('already_sponsored')
    expect(JSON.stringify(eligibility)).not.toContain(rival.branchIds[0])
    const mineRefused = await caught(
      sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: follower.id })
    )
    expect(mineRefused.code).toBe('SPONSORSHIP_NOT_ELIGIBLE')
    expect(JSON.stringify(mineRefused)).not.toMatch(/already_sponsored|SPONSORSHIP_ALREADY_EXISTS/)
  })

  it('same response for unknown and non-follower on sponsorship create', async () => {
    const mine = await createSupplierOrg(db.pool)
    const stranger = await createRestaurant(db.pool)
    const blocker = await createRestaurant(db.pool)
    await follow(db.pool, blocker.id, mine.orgId)
    await block(db.pool, blocker.id, mine.orgId)
    const unknown = await caught(
      sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: UNKNOWN })
    )
    for (const r of [stranger, blocker]) {
      const res = await caught(
        sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: r.id })
      )
      expect(res).toEqual(unknown)
    }
    expect(unknown).toMatchObject({ code: 'RESTAURANT_NOT_AVAILABLE', statusCode: 404 })
  })

  it('sponsorship offer racing an unfollow is serialised', async () => {
    const mine = await createSupplierOrg(db.pool)
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, mine.orgId)
    const client = await db.pool.connect()
    let settled = false
    try {
      await client.query('BEGIN')
      await relationship.lockRelationshipExclusive(client, r.id, mine.orgId)
      await client.query('DELETE FROM supplier_follow WHERE restaurant_id = $1', [r.id])
      const offer = caught(
        sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: r.id })
      ).finally(() => {
        settled = true
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(settled).toBe(false) // waiting on the relationship lock
      await client.query('COMMIT')
      const result = await offer
      expect(result).toMatchObject({ code: 'RESTAURANT_NOT_AVAILABLE' })
    } finally {
      client.release()
    }
    expect(await sponsorships(r.id)).toHaveLength(0)
  })

  it('active paid sponsorship continues after unfollow and block; no renewal offered', async () => {
    const mine = await createSupplierOrg(db.pool)
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, mine.orgId)
    const offer = await sponsorship.createSponsorshipOffer(mine.branchIds[0], {
      restaurantId: r.id,
    })
    await db.pool.query(`UPDATE supplier_sponsorship SET status = 'active' WHERE id = $1`, [
      offer.sponsorship.id,
    ])
    await writes.unfollowSupplier({ restaurantId: r.id, supplierId: mine.branchIds[0] })
    await writes.blockSupplier({ restaurantId: r.id, supplierId: mine.branchIds[0] })
    const rows = await sponsorships(r.id)
    expect(rows).toEqual([expect.objectContaining({ id: offer.sponsorship.id, status: 'active' })])
    const again = await caught(
      sponsorship.createSponsorshipOffer(mine.branchIds[0], { restaurantId: r.id })
    )
    expect(again).toMatchObject({ code: 'RESTAURANT_NOT_AVAILABLE' })
  })
})

describe('app-wide deals (real PG)', () => {
  it('deal-approved notifies org followers except blocked', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const viaBranch1 = await createRestaurant(db.pool)
    const viaBranch2 = await createRestaurant(db.pool)
    const blocker = await createRestaurant(db.pool)
    const stranger = await createRestaurant(db.pool)
    await follow(db.pool, viaBranch1.id, org.orgId, { supplierId: org.branchIds[0] })
    await follow(db.pool, viaBranch2.id, org.orgId, { supplierId: org.branchIds[1] })
    await follow(db.pool, blocker.id, org.orgId)
    await block(db.pool, blocker.id, org.orgId)
    // A legacy restaurant target must no longer widen the audience.
    const {
      rows: [deal],
    } = await db.pool.query(
      `INSERT INTO promotions (supplier_id, name, type, discount_value, applies_to, starts_at, status)
       VALUES ($1, 'Org deal', 'percentage_discount', 10, 'all', now(), 'active') RETURNING *`,
      [org.branchIds[1]]
    )
    await db.pool.query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id) VALUES ($1, $2)`,
      [deal.id, stranger.id]
    )
    const { notifyDealApproved } = await import(
      '../../../apps/api/src/services/notification/templates.js'
    )
    await notifyDealApproved(deal)
    const { rows } = await db.pool.query(
      `SELECT DISTINCT tenant_id FROM notification_log WHERE reference_id = $1`,
      [deal.id]
    )
    const notified = new Set(rows.map((row) => row.tenant_id))
    expect(notified.has(viaBranch1.id)).toBe(true)
    expect(notified.has(viaBranch2.id)).toBe(true)
    expect(notified.has(blocker.id)).toBe(false)
    expect(notified.has(stranger.id)).toBe(false)
  })
})
