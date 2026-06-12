/**
 * Live API walkthrough: guest order + member signup/order.
 * Run: node apps/api/scripts/walkthrough-b2c.mjs
 */
import { query } from '../src/lib/db.js'

const BASE = process.env.API_URL || 'http://localhost:4000'
const SLUG = 'tier-restaurant-free-01'
const MEMBER_USER = `demo_${Date.now().toString(36).slice(-6)}`
const MEMBER_PASS = 'demo1234'

function parseCookies(setCookie) {
  const jar = {}
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  for (const h of headers) {
    const part = h.split(';')[0]
    const i = part.indexOf('=')
    if (i > 0) jar[part.slice(0, i)] = part.slice(i + 1)
  }
  return jar
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function api(path, { method = 'GET', body, cookies = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(Object.keys(cookies).length ? { Cookie: cookieHeader(cookies) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  const newCookies = parseCookies(res.headers.getSetCookie?.() || res.headers.raw?.()['set-cookie'])
  return { status: res.status, json, cookies: { ...cookies, ...newCookies } }
}

import { seedB2cDemo } from './seed-b2c-demo.mjs'

// Ensure demo menu exists
await seedB2cDemo()

const { rows: meta } = await query(
  `
  SELECT r.id AS restaurant_id, b.id AS branch_id, mi.id AS menu_item_id
  FROM restaurant r
  JOIN branch b ON b.tenant_id = r.id AND b.is_active
  JOIN menu_item mi ON mi.restaurant_id = r.id AND mi.is_available
  WHERE r.slug = $1
  LIMIT 1
  `,
  [SLUG]
)
if (!meta.length) {
  console.error('Demo menu not available — run seed-b2c-demo.mjs first')
  process.exit(1)
}
const { branch_id: branchId, menu_item_id: menuItemId } = meta[0]

console.log('\n=== B2C Walkthrough:', SLUG, '===\n')

// --- GUEST FLOW ---
console.log('--- 1. Guest: browse menu ---')
const menu = await api(`/api/public/consumer/${SLUG}/menu?branchId=${branchId}`)
console.log('GET menu:', menu.status, menu.json.data?.categories?.[0]?.items?.[0]?.name || menu.json)

console.log('\n--- 2. Guest: place takeaway order (COD) ---')
const guestOrder = await api(`/api/public/consumer/${SLUG}/orders`, {
  method: 'POST',
  body: {
    branchId,
    fulfillmentType: 'TAKEAWAY',
    lines: [{ menuItemId, quantity: 1 }],
    guestName: 'Guest Walker',
    guestPhone: '+971500000001',
    guestEmail: 'guest.walker@example.com',
  },
})
console.log('POST order:', guestOrder.status, {
  orderNumber: guestOrder.json.data?.order?.order_number,
  receiptToken: guestOrder.json.data?.receiptToken?.slice(0, 8) + '…',
  status: guestOrder.json.data?.order?.status,
})
const guestReceiptToken = guestOrder.json.data?.receiptToken

console.log('\n--- 3. Guest: live tracker (receipt poll) ---')
const receipt = await api(
  `/api/public/consumer/${SLUG}/orders/${guestReceiptToken}/receipt`
)
console.log('GET receipt:', receipt.status, {
  status: receipt.json.data?.order?.status,
  step: receipt.json.data?.order?.status,
})

console.log('\n--- 4. Guest: track by order number + phone ---')
const track = await api(`/api/public/consumer/${SLUG}/orders/track`, {
  method: 'POST',
  body: {
    orderNumber: guestOrder.json.data?.order?.order_number,
    phone: '+971500000001',
  },
})
console.log('POST track:', track.status, {
  receiptToken: track.json.data?.order?.receipt_token?.slice(0, 8) + '…',
})

// --- MEMBER FLOW ---
console.log('\n--- 5. Member: sign up (this restaurant only) ---')
let cookies = {}
const signup = await api(`/api/public/consumer/${SLUG}/auth/signup`, {
  method: 'POST',
  body: { username: MEMBER_USER, password: MEMBER_PASS, displayName: 'Demo Member' },
})
cookies = signup.cookies
console.log('POST signup:', signup.status, {
  username: signup.json.data?.member?.username,
  loyaltyPoints: signup.json.data?.member?.loyaltyPoints,
  restaurantScoped: true,
})

console.log('\n--- 6. Member: loyalty preview at checkout ---')
const preview = await api(`/api/public/consumer/${SLUG}/loyalty/preview?subtotal=25`, {
  cookies,
})
console.log('GET loyalty/preview:', preview.status, preview.json.data)

console.log('\n--- 7. Member: place order (linked to member session) ---')
const memberOrder = await api(`/api/public/consumer/${SLUG}/orders`, {
  method: 'POST',
  cookies,
  body: {
    branchId,
    fulfillmentType: 'DINE_IN',
    lines: [{ menuItemId, quantity: 1 }],
    guestName: 'Demo Member',
    guestPhone: '+971500000002',
    notes: 'Table: 12',
  },
})
console.log('POST order (member):', memberOrder.status, {
  orderNumber: memberOrder.json.data?.order?.order_number,
  memberLinked: Boolean(memberOrder.json.data?.order?.consumer_member_id),
})
const memberOrderId = memberOrder.json.data?.order?.id
const memberReceiptToken = memberOrder.json.data?.receiptToken

// Advance through kitchen chain (triggers loyalty earn on DELIVERED)
console.log('\n--- 8. Kitchen: advance order → DELIVERED (earn points) ---')
const { updateConsumerOrderStatus } = await import('../src/services/consumer-order.service.js')
const restaurantId = meta[0].restaurant_id
for (const step of ['PREPARING', 'SHIPPED', 'DELIVERED']) {
  await updateConsumerOrderStatus(memberOrderId, restaurantId, step, null, 'Walkthrough')
}

console.log('\n--- 9. Member: receipt shows points earned ---')
const memberReceipt = await api(
  `/api/public/consumer/${SLUG}/orders/${memberReceiptToken}/receipt`,
  { cookies }
)
console.log('GET receipt (member, DELIVERED):', memberReceipt.status, {
  status: memberReceipt.json.data?.order?.status,
  loyalty: memberReceipt.json.data?.loyalty,
})

console.log('\n--- 10. Member: /auth/me balance ---')
const me = await api(`/api/public/consumer/${SLUG}/auth/me`, { cookies })
console.log('GET me:', me.status, {
  username: me.json.data?.member?.username,
  loyaltyPoints: me.json.data?.member?.loyaltyPoints,
  ledgerEntries: me.json.data?.recentLedger?.length,
})

console.log('\n=== Walkthrough complete ===')
console.log(`Storefront: http://localhost:5173/order/${SLUG}`)
console.log(`Guest receipt: http://localhost:5173/order/${SLUG}/receipt/${guestReceiptToken}`)
console.log(`Member account: http://localhost:5173/order/${SLUG}/account`)
console.log(`Test member (signup): ${MEMBER_USER} / ${MEMBER_PASS} (only valid at ${SLUG})`)
console.log(`Fixed demo diner: demo_diner / demo1234 (only valid at ${SLUG})`)
process.exit(0)
