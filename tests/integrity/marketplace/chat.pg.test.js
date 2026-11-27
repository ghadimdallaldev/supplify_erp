import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { makeTestToken } from './auth-mock.js'
import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  createConversation,
  createOrder,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

// socket.io-client is a web dependency; load it from there so the API lockfile is unchanged.
const here = path.dirname(fileURLToPath(import.meta.url))
const requireFromWeb = createRequire(path.resolve(here, '../../../apps/web/package.json'))
const { io: ioClient } = requireFromWeb('socket.io-client')

let db
let api
let writes

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  writes = await import('../../../apps/api/src/services/relationship-writes.service.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const h = (sub) => ({ 'x-test-user': sub, 'content-type': 'application/json' })

async function call(sub, method, urlPath, body) {
  const res = await fetch(`${api.baseUrl}${urlPath}`, {
    method,
    headers: h(sub),
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, body: json, headers: res.headers }
}

const send = (sub, conversationId, body) =>
  call(sub, 'POST', `/api/chat/conversations/${conversationId}/messages`, {
    messageType: 'TEXT',
    ...body,
  })

async function pair({ followed = true, publicCatalog = true } = {}) {
  const org = await createSupplierOrg(db.pool, { publicCatalog })
  const r = await createRestaurant(db.pool)
  if (followed) await follow(db.pool, r.id, org.orgId)
  return { org, supplierId: org.branchIds[0], supplierSub: org.users[0].userSub, r }
}

function connect(sub) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(api.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `access_token=${makeTestToken(sub)}` },
      reconnection: false,
      forceNew: true,
    })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('relationship-aware chat (real PG)', () => {
  it('supplier cannot create a conversation with a non-follower: RESTAURANT_NOT_AVAILABLE, same body as unknown id', async () => {
    const { supplierSub, r } = await pair({ followed: false })
    const stranger = await call(supplierSub, 'POST', '/api/chat/conversations', {
      restaurantId: r.id,
    })
    const unknown = await call(supplierSub, 'POST', '/api/chat/conversations', {
      restaurantId: '00000000-0000-4000-8000-000000000000',
    })
    expect(stranger.status).toBe(404)
    expect(stranger.body.error).toEqual(unknown.body.error)
    expect(stranger.body.error.name).toBe('RESTAURANT_NOT_AVAILABLE')
  })

  it('restaurant needs follow to start chat or deal chat', async () => {
    const { supplierId, r, org } = await pair({ followed: false })
    const start = await call(r.userSub, 'POST', '/api/chat/conversations', { supplierId })
    expect(start.status).toBe(403)
    expect(start.body.error.name).toBe('FOLLOW_REQUIRED')

    const {
      rows: [deal],
    } = await db.pool.query(
      `INSERT INTO promotions (supplier_id, name, type, discount_value, status, starts_at)
       VALUES ($1, 'Chat deal', 'percentage_discount', 10, 'active', now() - interval '1 hour')
       RETURNING id`,
      [supplierId]
    )
    const dealChat = await call(r.userSub, 'POST', `/api/promotions/${deal.id}/message`, {})
    expect(dealChat.status).toBe(403)
    expect(dealChat.body.error.name).toBe('FOLLOW_REQUIRED')

    await follow(db.pool, r.id, org.orgId)
    expect((await call(r.userSub, 'POST', '/api/chat/conversations', { supplierId })).status).toBe(
      201
    )
  })

  it('general send without follow is CHAT_READ_ONLY with openOrderIds', async () => {
    const { supplierId, supplierSub, r } = await pair({ followed: false })
    const conv = await createConversation(db.pool, r.id, supplierId)
    const order = await createOrder(db.pool, { restaurantId: r.id, supplierId, status: 'PLACED' })
    for (const sub of [r.userSub, supplierSub]) {
      const res = await send(sub, conv.id, { content: 'hello' })
      expect(res.status, JSON.stringify(res.body)).toBe(403)
      expect(res.body.error.name).toBe('CHAT_READ_ONLY')
      expect(res.body.error.details.openOrderIds).toEqual([order.id])
    }
    const list = await call(r.userSub, 'GET', '/api/chat/conversations')
    const item = list.body.data.conversations.find((c) => c.id === conv.id)
    expect(item).toMatchObject({
      can_send_general: false,
      open_order_ids: [order.id],
      is_closed_by_block: false,
    })
  })

  it('order-tagged message allowed while open after unfollow; refused after block', async () => {
    const { supplierId, supplierSub, r, org } = await pair()
    const conv = await createConversation(db.pool, r.id, supplierId)
    const order = await createOrder(db.pool, { restaurantId: r.id, supplierId, status: 'PLACED' })
    const done = await createOrder(db.pool, { restaurantId: r.id, supplierId, status: 'CANCELLED' })
    await writes.unfollowSupplier({ restaurantId: r.id, supplierId })

    const ok = await send(supplierSub, conv.id, { content: 'about your order', orderId: order.id })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    const { rows } = await db.pool.query('SELECT order_id FROM message WHERE id = $1', [
      ok.body.data.message.id,
    ])
    expect(rows[0].order_id).toBe(order.id)
    expect((await send(r.userSub, conv.id, { content: 'x', orderId: done.id })).status).toBe(403)

    await writes.blockSupplier({ restaurantId: r.id, supplierId: org.branchIds[0] })
    const refused = await send(r.userSub, conv.id, { content: 'x', orderId: order.id })
    expect(refused.status).toBe(403)
    expect(refused.body.error.name).toBe('CHAT_READ_ONLY')
  })

  it('supplier cannot open conversation after block; restaurant reads history', async () => {
    const { supplierId, supplierSub, r } = await pair()
    const conv = await createConversation(db.pool, r.id, supplierId)
    expect((await send(r.userSub, conv.id, { content: 'before block' })).status).toBe(201)
    await writes.blockSupplier({ restaurantId: r.id, supplierId })

    expect(
      (await call(supplierSub, 'GET', `/api/chat/conversations/${conv.id}/messages`)).status
    ).toBe(404)
    const supplierList = await call(supplierSub, 'GET', '/api/chat/conversations')
    expect(supplierList.body.data.conversations.map((c) => c.id)).not.toContain(conv.id)

    const history = await call(r.userSub, 'GET', `/api/chat/conversations/${conv.id}/messages`)
    expect(history.status).toBe(200)
    expect(history.body.data.messages.map((m) => m.content)).toContain('before block')
    const list = await call(r.userSub, 'GET', '/api/chat/conversations')
    expect(list.body.data.conversations.find((c) => c.id === conv.id)).toMatchObject({
      is_closed_by_block: true,
      can_send_general: false,
    })
  })

  it('block revokes live socket', async () => {
    const { supplierId, supplierSub, r } = await pair()
    const conv = await createConversation(db.pool, r.id, supplierId)
    const supplierSocket = await connect(supplierSub)
    try {
      supplierSocket.emit('join_conversation', conv.id)
      await sleep(300)
      const received = []
      const accessChanged = []
      const errors = []
      supplierSocket.on('new_message', (m) => received.push(m))
      supplierSocket.on('conversation_access_changed', (e) => accessChanged.push(e))
      supplierSocket.on('chat_error', (e) => errors.push(e))

      expect((await send(r.userSub, conv.id, { content: 'live' })).status).toBe(201)
      await sleep(300)
      expect(received).toHaveLength(1)

      await writes.blockSupplier({ restaurantId: r.id, supplierId })
      await sleep(300)
      expect(accessChanged).toContainEqual({ conversationId: conv.id })

      supplierSocket.emit('send_message', { conversationId: conv.id, content: 'after block' })
      await sleep(300)
      expect(errors.map((e) => e.code)).toContain('FORBIDDEN')
      const { rows } = await db.pool.query(
        `SELECT count(*)::int AS c FROM message WHERE conversation_id = $1 AND content = 'after block'`,
        [conv.id]
      )
      expect(rows[0].c).toBe(0)

      // Restaurant can still read but nobody can send; no further new_message reaches the supplier.
      await db.pool.query(
        `INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type)
         VALUES ($1, 'RESTAURANT', $2, 'direct insert', 'TEXT')`,
        [conv.id, r.id]
      )
      const { emitAuthorizedRoom } = await import('../../../apps/api/src/lib/socket.js')
      await emitAuthorizedRoom(`conversation_${conv.id}`, 'new_message', {
        conversationId: conv.id,
      })
      supplierSocket.emit('join_conversation', conv.id)
      await sleep(300)
      await emitAuthorizedRoom(`conversation_${conv.id}`, 'new_message', {
        conversationId: conv.id,
      })
      await sleep(300)
      expect(received).toHaveLength(1)
    } finally {
      supplierSocket.close()
    }
  }, 30_000)

  it('attachment link re-checks access and expires', async () => {
    const { supplierId, supplierSub, r } = await pair()
    const conv = await createConversation(db.pool, r.id, supplierId)
    const {
      rows: [msg],
    } = await db.pool.query(
      `INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type)
       VALUES ($1, 'RESTAURANT', $2, 'file', 'TEXT') RETURNING id`,
      [conv.id, r.id]
    )
    const key = `uploads/${r.userId}/chat/invoice.pdf`
    const {
      rows: [att],
    } = await db.pool.query(
      `INSERT INTO message_attachment (message_id, file_url, file_type, file_name)
       VALUES ($1, $2, 'application/pdf', 'invoice.pdf') RETURNING id`,
      [msg.id, `/api/files/object?key=${encodeURIComponent(key)}`]
    )

    const history = await call(supplierSub, 'GET', `/api/chat/conversations/${conv.id}/messages`)
    const [attachment] = history.body.data.messages[0].attachments
    expect(attachment.fileUrl).toBe(`/api/chat/attachments/${att.id}`)
    expect(JSON.stringify(history.body)).not.toContain('uploads/')

    const link = await call(supplierSub, 'GET', `/api/chat/attachments/${att.id}`)
    expect(link.status).toBe(302)
    const location = new URL(link.headers.get('location'), api.baseUrl)
    expect(location.pathname).toBe('/api/files/object')
    expect(location.searchParams.get('key')).toBe(key)
    const exp = Number(location.searchParams.get('exp'))
    const now = Math.floor(Date.now() / 1000)
    expect(exp - now).toBeGreaterThan(0)
    expect(exp - now).toBeLessThanOrEqual(300)

    const outsider = await createSupplierOrg(db.pool)
    expect(
      (await call(outsider.users[0].userSub, 'GET', `/api/chat/attachments/${att.id}`)).status
    ).toBe(404)
    await writes.blockSupplier({ restaurantId: r.id, supplierId })
    expect((await call(supplierSub, 'GET', `/api/chat/attachments/${att.id}`)).status).toBe(404)
  })

  it('message notification only after authorised send', async () => {
    const { supplierId, r } = await pair({ followed: false })
    const conv = await createConversation(db.pool, r.id, supplierId)
    const before = await db.pool.query(
      `SELECT count(*)::int AS c FROM notification_log WHERE notification_type = 'MESSAGE'`
    )
    expect((await send(r.userSub, conv.id, { content: 'spam' })).status).toBe(403)
    await sleep(200)
    const after = await db.pool.query(
      `SELECT count(*)::int AS c FROM notification_log WHERE notification_type = 'MESSAGE'`
    )
    expect(after.rows[0].c).toBe(before.rows[0].c)

    // An authorised send does notify (proves the counter can move).
    await follow(
      db.pool,
      r.id,
      (await db.pool.query('SELECT organization_id FROM supplier WHERE id = $1', [supplierId]))
        .rows[0].organization_id
    )
    expect((await send(r.userSub, conv.id, { content: 'hello' })).status).toBe(201)
    await sleep(500)
    const sent = await db.pool.query(
      `SELECT count(*)::int AS c FROM notification_log WHERE notification_type = 'MESSAGE'`
    )
    expect(sent.rows[0].c).toBeGreaterThan(before.rows[0].c)
  })
})
