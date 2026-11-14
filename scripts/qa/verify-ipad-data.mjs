import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Explicitly restricted to the disposable QA database. Never reuse a hosted URL.
const databaseFlag = process.argv.indexOf('--database')
const connectionString = databaseFlag >= 0 ? process.argv[databaseFlag + 1] : undefined
if (!connectionString)
  throw new Error('Pass --database with the disposable local ipad_qa connection URL')
const target = new URL(connectionString)
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/ipad_qa' ||
  target.port !== '55439'
) {
  throw new Error('This check only permits localhost:55439/ipad_qa')
}
const { config } = await import('../../apps/api/src/config/env.js')
config.DATABASE_URL = connectionString
config.DATABASE_MIGRATION_URL = connectionString
config.DATABASE_SSL = false
config.REDIS_URL = ''
config.DATABASE_POOL_MAX = 2
const { pool, query } = await import('../../apps/api/src/lib/db.js')
const results = []
try {
  const { runAllSqlMigrations } = await import('../../apps/api/src/lib/sql-migrator.js')
  await runAllSqlMigrations()
  const { RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL } = await import(
    '../../apps/api/src/lib/product-supplier-access.js'
  )
  const { getInvoiceDetail, buildInvoicePdfBuffer } = await import(
    '../../apps/api/src/services/invoice.service.js'
  )
  const { discoverDealsForRestaurant, loadDealDetailForRestaurant } = await import(
    '../../apps/api/src/services/deal-promotions.service.js'
  )
  const { getNewDealsBanner } = await import('../../apps/api/src/services/deal-banner.service.js')
  const supplier = randomUUID(),
    unrelatedSupplier = randomUUID(),
    restaurant = randomUUID(),
    otherRestaurant = randomUUID(),
    invoice = randomUUID(),
    deal = randomUUID()
  await query(
    `INSERT INTO supplier (id,name,slug) VALUES ($1::uuid,'QA Supplier',$1::text),($2::uuid,'Other QA Supplier',$2::text)`,
    [supplier, unrelatedSupplier]
  )
  await query(
    `INSERT INTO restaurant (id,name,slug,contact_email) VALUES ($1::uuid,'QA Restaurant',$1::text,'qa@example.test'),($2::uuid,'Other QA Restaurant',$2::text,'other@example.test')`,
    [restaurant, otherRestaurant]
  )
  await query(`INSERT INTO supplier_follow (supplier_id,restaurant_id) VALUES ($1,$2)`, [
    supplier,
    restaurant,
  ])
  assert.equal(
    (await query(RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL, [supplier, restaurant])).rowCount,
    1
  )
  assert.equal(
    (await query(RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL, [unrelatedSupplier, restaurant])).rowCount,
    0
  )
  assert.equal(
    (await query(RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL, [supplier, otherRestaurant])).rowCount,
    0
  )
  results.push('Restaurant product supplier access executes and denies unrelated tenants')
  await query(
    `INSERT INTO invoice (id,invoice_number,supplier_id,restaurant_id,invoice_date,due_date,subtotal,total_amount,status,currency) VALUES ($1::uuid,$1::text,$2,$3,CURRENT_DATE,CURRENT_DATE+7,25,25,'ISSUED','USD')`,
    [invoice, supplier, restaurant]
  )
  let detail = await getInvoiceDetail(invoice, { tenantId: restaurant, tenantType: 'RESTAURANT' })
  assert.equal(detail.invoice.restaurant_email, 'qa@example.test')
  assert.equal(detail.lineItems.length, 0)
  const emptyPdf = await buildInvoicePdfBuffer(detail)
  assert.equal(emptyPdf.subarray(0, 4).toString(), '%PDF')
  await query(
    `INSERT INTO invoice_line_item (invoice_id,description,quantity,unit_price,line_total) VALUES ($1,'QA flour',5,5,25)`,
    [invoice]
  )
  detail = await getInvoiceDetail(invoice, { tenantId: restaurant, tenantType: 'RESTAURANT' })
  assert.equal(detail.lineItems[0].description, 'QA flour')
  await assert.rejects(
    getInvoiceDetail(invoice, { tenantId: otherRestaurant, tenantType: 'RESTAURANT' }),
    /not found/i
  )
  const pdf = await buildInvoicePdfBuffer(detail)
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.ok(pdf.length > 500)
  results.push(
    'Invoice details and valid PDFs work with zero or populated line items; tenant isolation holds'
  )
  await query(
    `INSERT INTO promotions (id,supplier_id,name,type,discount_value,status,starts_at,ends_at) VALUES ($1,$2,'QA Organic Deal','percentage_discount',10,'active',NOW()-INTERVAL '1 day',NOW()+INTERVAL '7 days')`,
    [deal, supplier]
  )
  assert.ok((await discoverDealsForRestaurant(restaurant)).some((row) => row.id === deal))
  assert.ok(!(await discoverDealsForRestaurant(otherRestaurant)).some((row) => row.id === deal))
  assert.ok(await loadDealDetailForRestaurant(deal, restaurant))
  assert.equal(await loadDealDetailForRestaurant(deal, otherRestaurant), null)
  assert.ok((await getNewDealsBanner(restaurant)).deals.some((row) => row.id === deal))
  await query(`UPDATE promotions SET usage_limit=1,usage_count=1 WHERE id=$1`, [deal])
  assert.ok(!(await discoverDealsForRestaurant(restaurant)).some((row) => row.id === deal))
  assert.ok(!(await getNewDealsBanner(restaurant)).deals.some((row) => row.id === deal))
  results.push(
    'Organic deals visible to followers, hidden from unrelated restaurants, and exhausted deals absent from page and banner'
  )
  const { getReorderAssistance, suppressReorderSuggestion } = await import(
    '../../apps/api/src/services/restaurant-reorder-assistance.service.js'
  )
  const product = randomUUID()
  await query(
    `INSERT INTO product (id,supplier_id,sku,name,unit) VALUES ($1,$2,'QA-PACK','QA stock item','bottle')`,
    [product, supplier]
  )
  await query(
    `INSERT INTO product_inventory_settings (product_id,moq,order_multiple) VALUES ($1,6,6) ON CONFLICT (product_id) DO UPDATE SET moq=6,order_multiple=6`,
    [product]
  )
  await query(
    `INSERT INTO restaurant_inventory (restaurant_id,product_id,quantity,low_stock_threshold) VALUES ($1,$2,1,5)`,
    [restaurant, product]
  )
  let assistance = await getReorderAssistance(restaurant)
  const suggestion = assistance.suggestions.find((row) => row.productId === product)
  assert.ok(suggestion, 'Low stock must generate a suggestion')
  assert.equal(suggestion.reasonCode, 'low_stock')
  assert.ok(
    suggestion.suggestedQty > 0 && suggestion.suggestedQty % 6 === 0,
    'Reorder must respect supplier pack size'
  )
  assert.ok(
    !(await getReorderAssistance(otherRestaurant)).suggestions.some(
      (row) => row.productId === product
    )
  )
  await suppressReorderSuggestion(restaurant, {
    scopeType: suggestion.scopeType,
    scopeId: suggestion.scopeId,
    action: 'snooze',
    snoozeDays: 7,
  })
  assistance = await getReorderAssistance(restaurant)
  assert.ok(
    !assistance.suggestions.some((row) => row.productId === product),
    'Snoozed suggestion must disappear'
  )
  results.push(
    'Reorder assistance executes against the migrated schema, respects supplier pack sizes and tenant isolation, and honors snooze'
  )
  const branch = randomUUID(),
    category = randomUUID(),
    dish = randomUUID(),
    checkoutKey = randomUUID()
  await query(
    `INSERT INTO branch (id,restaurant_id,tenant_id,name) VALUES ($1,$2,$2,'QA branch')`,
    [branch, restaurant]
  )
  await query(`INSERT INTO menu_category (id,restaurant_id,name) VALUES ($1,$2,'QA menu')`, [
    category,
    restaurant,
  ])
  await query(
    `INSERT INTO menu_item (id,restaurant_id,category_id,name,base_price,is_available) VALUES ($1,$2,$3,'QA dish',10,TRUE)`,
    [dish, restaurant, category]
  )
  const { createConsumerOrder } = await import(
    '../../apps/api/src/services/consumer-order.service.js'
  )
  const checkout = {
    idempotencyKey: checkoutKey,
    branchId: branch,
    fulfillmentType: 'TAKEAWAY',
    guestName: 'QA Guest',
    lines: [{ menuItemId: dish, quantity: 1 }],
  }
  const simultaneous = await Promise.all([
    createConsumerOrder(restaurant, checkout),
    createConsumerOrder(restaurant, checkout),
  ])
  assert.equal(simultaneous[0].order.id, simultaneous[1].order.id)
  assert.equal(simultaneous.filter((result) => result.isNew).length, 1)
  assert.equal(
    (
      await query(`SELECT COUNT(*)::int AS count FROM consumer_order WHERE restaurant_id=$1`, [
        restaurant,
      ])
    ).rows[0].count,
    1
  )
  const replay = await createConsumerOrder(restaurant, checkout)
  assert.equal(replay.isNew, false)
  assert.equal(replay.order.receipt_token, simultaneous[0].order.receipt_token)
  await assert.rejects(
    createConsumerOrder(restaurant, { ...checkout, guestName: 'Different guest' }),
    (error) => error.name === 'IDEMPOTENCY_KEY_REUSED'
  )
  results.push(
    'Two simultaneous guest checkouts and a retry return one order/receipt with a two-connection pool; changed payload is rejected'
  )
  const member = randomUUID()
  await query(
    `INSERT INTO consumer_member (id,restaurant_id,username,password_hash,loyalty_points) VALUES ($1::uuid,$2,$1::text,'qa-not-a-real-password-hash',100)`,
    [member, restaurant]
  )
  const { upsertConsumerLoyaltyProgram } = await import(
    '../../apps/api/src/services/loyalty.service.js'
  )
  await upsertConsumerLoyaltyProgram(restaurant, {
    name: 'QA Rewards',
    enabled: true,
    earnPointsPerCurrency: 1,
    redeemCurrencyPerPoint: 0.01,
    minRedeemPoints: 1,
    maxRedeemPercent: 50,
  })
  const rewarded = {
    ...checkout,
    idempotencyKey: randomUUID(),
    consumerMemberId: member,
    pointsToRedeem: 50,
  }
  const rewardedResults = await Promise.all([
    createConsumerOrder(restaurant, rewarded),
    createConsumerOrder(restaurant, rewarded),
  ])
  assert.equal(rewardedResults[0].order.id, rewardedResults[1].order.id)
  assert.equal(
    Number(
      (await query(`SELECT loyalty_points FROM consumer_member WHERE id=$1`, [member])).rows[0]
        .loyalty_points
    ),
    50
  )
  assert.equal(
    (
      await query(
        `SELECT COUNT(*)::int AS count FROM consumer_loyalty_ledger WHERE consumer_member_id=$1 AND entry_type='REDEEM'`,
        [member]
      )
    ).rows[0].count,
    1
  )
  results.push('Simultaneous keyed rewards checkout debits guest points exactly once')
  console.log(JSON.stringify({ passed: results.length, results, pdfBytes: pdf.length }))
} finally {
  await pool.end()
}
