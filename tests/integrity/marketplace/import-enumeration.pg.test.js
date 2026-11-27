import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Plan gates and customer-location caps are outside this suite's subject.
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireFeature: () => (_req, _res, next) => next(),
  assertSupplierActiveCustomerLocationCapacity: vi.fn(async () => undefined),
}))

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  block,
  createOrder,
  createProduct,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

let db
let api

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

async function call(sub, method, urlPath, body) {
  const started = Date.now()
  const res = await fetch(`${api.baseUrl}${urlPath}`, {
    method,
    headers: sub
      ? { 'x-test-user': sub, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, body: json, headers: res.headers, ms: Date.now() - started }
}

async function contactEmail(restaurantId) {
  const { rows } = await db.pool.query('SELECT contact_email FROM restaurant WHERE id = $1', [
    restaurantId,
  ])
  return rows[0].contact_email
}

async function importProspects(sub, lines) {
  const csv = ['restaurant_name,contact_person,phone,email,area_region', ...lines].join('\n')
  const res = await call(sub, 'POST', '/api/supplier/growth/customers/import', { csv })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const { drainProspectJobs } = await import('../../../apps/api/src/jobs/prospect-invite.job.js')
  await drainProspectJobs()
  const list = await call(sub, 'GET', '/api/supplier/growth/customers/prospects?limit=50')
  expect(list.status).toBe(200)
  return list.body.data.prospects
}

const PROSPECT_KEYS = [
  'area_region',
  'contact_person',
  'email',
  'id',
  'invited_at',
  'name',
  'phone',
  'status',
]

describe('reviews reveal no restaurant (real PG)', () => {
  it('review lists never contain restaurant identity; own review marked is_own', async () => {
    const org = await createSupplierOrg(db.pool)
    const author = await createRestaurant(db.pool, { name: 'Secret Bistro' })
    const other = await createRestaurant(db.pool)
    const product = await createProduct(db.pool, org.branchIds[0])
    const order = await createOrder(db.pool, {
      restaurantId: author.id,
      supplierId: org.branchIds[0],
      status: 'COMPLETED',
      productId: product.id,
    })
    await db.pool.query(
      `INSERT INTO supplier_reviews (supplier_id, restaurant_id, reviewer_user_id, order_id, overall_rating, comment)
       VALUES ($1, $2, $3, $4, 5, 'great')`,
      [org.branchIds[0], author.id, author.userId, order.id]
    )
    const supplierView = await call(
      org.users[0].userSub,
      'GET',
      `/api/reviews/suppliers/${org.branchIds[0]}`
    )
    const anon = await call(null, 'GET', `/api/reviews/suppliers/${org.branchIds[0]}`)
    const otherView = await call(other.userSub, 'GET', `/api/reviews/suppliers/${org.branchIds[0]}`)
    const ownView = await call(author.userSub, 'GET', `/api/reviews/suppliers/${org.branchIds[0]}`)
    for (const res of [supplierView, anon, otherView, ownView]) {
      expect(res.status).toBe(200)
      const text = JSON.stringify(res.body)
      expect(text).not.toContain('Secret Bistro')
      expect(text).not.toContain(author.id)
      expect(res.body.data.reviews[0].reviewer_label).toBe('Verified restaurant')
    }
    expect(otherView.body.data.reviews[0].is_own).toBe(false)
    expect(anon.body.data.reviews[0].is_own).toBe(false)
    expect(ownView.body.data.reviews[0].is_own).toBe(true)

    // Supplier directory and detail cards carry recent reviews too.
    const detail = await call(other.userSub, 'GET', `/api/suppliers/${org.branchIds[0]}`)
    expect(JSON.stringify(detail.body)).not.toContain('Secret Bistro')
  })
})

describe('customer import reveals no Supplify membership (real PG)', () => {
  it('prospect payloads contain no match fields', async () => {
    const org = await createSupplierOrg(db.pool)
    const member = await createRestaurant(db.pool, { name: 'Member Cafe' })
    const prospects = await importProspects(org.users[0].userSub, [
      `Member Cafe,Ann,,${await contactEmail(member.id)},Beirut`,
      'Nobody Diner,Bob,,nobody@example.test,Beirut',
    ])
    expect(prospects).toHaveLength(2)
    for (const p of prospects) {
      expect(Object.keys(p).sort()).toEqual(PROSPECT_KEYS)
      expect(p.status).toBe('imported')
      expect(JSON.stringify(p)).not.toContain(member.id)
    }
    const metrics = await call(org.users[0].userSub, 'GET', '/api/supplier/growth/metrics')
    expect(JSON.stringify(metrics.body)).not.toMatch(/existingSupplify/)
    const elig = await call(
      org.users[0].userSub,
      'GET',
      `/api/supplier/growth/sponsorships/eligibility?prospectId=${prospects[0].id}`
    )
    expect(JSON.stringify(elig.body)).not.toContain(member.id)
    expect(JSON.stringify(elig.body)).not.toMatch(/match_status|matched_restaurant|match_signals/)
  })

  it('name fragments never match', async () => {
    const org = await createSupplierOrg(db.pool)
    await createRestaurant(db.pool, { name: 'Zaatar House Downtown' })
    await importProspects(org.users[0].userSub, ['Zaatar House,Ann,,fragment@example.test,'])
    const { rows } = await db.pool.query(
      'SELECT match_status, matched_restaurant_id FROM supplier_customer_prospect WHERE supplier_id = $1',
      [org.branchIds[0]]
    )
    expect(rows[0].matched_restaurant_id).toBeNull()
  })

  it('invite responses identical for matched, unmatched and blocked prospects', async () => {
    const org = await createSupplierOrg(db.pool)
    const member = await createRestaurant(db.pool)
    const blocker = await createRestaurant(db.pool)
    await follow(db.pool, blocker.id, org.orgId)
    await block(db.pool, blocker.id, org.orgId)
    const sub = org.users[0].userSub
    const prospects = await importProspects(sub, [
      `Matched,Ann,,${await contactEmail(member.id)},`,
      'Unmatched,Bob,,unmatched@example.test,',
      `Blocked,Cy,,${await contactEmail(blocker.id)},`,
    ])
    const byName = Object.fromEntries(prospects.map((p) => [p.name, p]))
    const responses = []
    for (const name of ['Matched', 'Unmatched', 'Blocked']) {
      responses.push(
        await call(
          sub,
          'POST',
          `/api/supplier/growth/customers/prospects/${byName[name].id}/invite`,
          {
            channel: 'email',
          }
        )
      )
    }
    const shape = (res) => ({
      status: res.status,
      keys: Object.keys(res.body.data).sort(),
      invitationKeys: Object.keys(res.body.data.invitation || {}).sort(),
      contentType: res.headers.get('content-type'),
    })
    expect(shape(responses[1])).toEqual(shape(responses[0]))
    expect(shape(responses[2])).toEqual(shape(responses[0]))
    expect(responses[0].status).toBe(200)
    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toMatch(/already on Supplify|connection/i)
      expect(JSON.stringify(res.body)).not.toContain(member.id)
      expect(JSON.stringify(res.body)).not.toContain(blocker.id)
    }
    // The handler awaits no matching work: dispatch happens after the response.
    const { pendingProspectJobs, drainProspectJobs } = await import(
      '../../../apps/api/src/jobs/prospect-invite.job.js'
    )
    expect(typeof pendingProspectJobs()).toBe('number')
    await drainProspectJobs()

    const after = await call(sub, 'GET', '/api/supplier/growth/customers/prospects?limit=50')
    const statuses = Object.fromEntries(after.body.data.prospects.map((p) => [p.name, p.status]))
    expect(statuses).toEqual({ Matched: 'invited', Unmatched: 'invited', Blocked: 'invited' })

    // Matched restaurant got an in-app follow invite; the blocker got nothing.
    const { rows: notes } = await db.pool.query(
      `SELECT DISTINCT tenant_id FROM notification_log
       WHERE notification_type = 'SUPPLIER_FOLLOW_INVITE'`
    )
    const notified = notes.map((n) => n.tenant_id)
    expect(notified).toContain(member.id)
    expect(notified).not.toContain(blocker.id)

    // Accepting the invite follows; only then does the prospect show `following`.
    const { rows: crs } = await db.pool.query(
      `SELECT id FROM supplier_connection_request WHERE restaurant_id = $1`,
      [member.id]
    )
    const accept = await call(
      member.userSub,
      'POST',
      `/api/restaurant/growth/connection-requests/${crs[0].id}/accept`
    )
    expect(accept.status, JSON.stringify(accept.body)).toBe(200)
    const final = await call(sub, 'GET', '/api/supplier/growth/customers/prospects?limit=50')
    const matched = final.body.data.prospects.find((p) => p.name === 'Matched')
    expect(matched.status).toBe('following')
    const { rows: supplierNotes } = await db.pool.query(
      `SELECT 1 FROM notification_log WHERE tenant_id = $1
         AND notification_category IN ('connection_request_accepted', 'connection_request_declined')`,
      [org.branchIds[0]]
    )
    expect(supplierNotes).toHaveLength(0)
  })

  it('/rematch and /connect are 404', async () => {
    const org = await createSupplierOrg(db.pool)
    const [p] = await importProspects(org.users[0].userSub, ['Someone,Ann,,someone@example.test,'])
    for (const action of ['rematch', 'connect']) {
      const res = await call(
        org.users[0].userSub,
        'POST',
        `/api/supplier/growth/customers/prospects/${p.id}/${action}`
      )
      expect(res.status).toBe(404)
    }
  })
})

describe('quotes show only §11.3 fields (real PG)', () => {
  it('quote detail shows only allowed fields; hidden after block', async () => {
    const quotes = await import('../../../apps/api/src/services/quote-requests.service.js')
    const org = await createSupplierOrg(db.pool)
    const rival = await createSupplierOrg(db.pool, { name: 'Rival Supplies' })
    const r = await createRestaurant(db.pool, { name: 'Quote Kitchen' })
    const mine = await createProduct(db.pool, org.branchIds[0])
    const theirs = await createProduct(db.pool, rival.branchIds[0])
    await quotes.createQuoteRequest({
      restaurantId: r.id,
      userId: r.userId,
      supplierIds: [org.branchIds[0], rival.branchIds[0]],
      items: [
        { productId: mine.id, quantity: 3, unit: 'kg' },
        { productId: theirs.id, quantity: 1, unit: 'kg' },
      ],
      note: 'for friday',
      neededBy: null,
    })
    const inbox = await quotes.listSupplierQuoteRequests(org.branchIds[0])
    expect(inbox.inbox).toHaveLength(1)
    const detail = await quotes.getSupplierQuoteRequestDetail(org.branchIds[0], inbox.inbox[0].id)
    expect(detail.restaurantName).toBe('Quote Kitchen')
    expect(detail.quoteRequestNote).toBe('for friday')
    expect(detail).not.toHaveProperty('restaurantId')
    const text = JSON.stringify({ inbox, detail })
    expect(text).not.toContain(r.id)
    expect(text).not.toContain(rival.branchIds[0])
    expect(text).not.toContain('Rival Supplies')
    expect(detail.items.map((i) => i.productId)).toEqual([mine.id])

    await follow(db.pool, r.id, org.orgId)
    await block(db.pool, r.id, org.orgId)
    const hidden = await quotes.listSupplierQuoteRequests(org.branchIds[0])
    expect(hidden.inbox).toHaveLength(0)
    expect(hidden.counts.total).toBe(0)
    await expect(
      quotes.getSupplierQuoteRequestDetail(org.branchIds[0], inbox.inbox[0].id)
    ).rejects.toMatchObject({ name: 'NotFoundError' })
    await expect(
      quotes.declineQuoteRequest({
        supplierId: org.branchIds[0],
        quoteRequestSupplierId: inbox.inbox[0].id,
        reason: 'x',
      })
    ).rejects.toMatchObject({ name: 'NotFoundError' })
    // An org-level block (written against another branch) still makes the supplier ineligible.
    await expect(
      quotes.createQuoteRequest({
        restaurantId: r.id,
        userId: r.userId,
        supplierIds: [org.branchIds[0]],
        items: [{ productId: mine.id, quantity: 1, unit: 'kg' }],
        note: null,
        neededBy: null,
      })
    ).rejects.toMatchObject({ name: 'ValidationError' })
  })
})
