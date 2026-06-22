/**
 * Fulfillment / dispatch demo data for marketing screenshots.
 * Creates drivers, active orders, delivery routes, and driver assignments.
 */
import { createSeededRng, intBetween, pick } from './seedRng.js'

const rng = createSeededRng(20260622)

function uuid() {
  return crypto.randomUUID()
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function hoursAgo(h) {
  const d = new Date()
  d.setHours(d.getHours() - h)
  return d.toISOString()
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ supplierId: string, restaurantId: string, branchId: string, warehouseId: string, products: { id: string, price: number }[], supplierSlug: string }} ctx
 */
export async function seedFulfillmentMarketingData(client, ctx) {
  const { supplierId, restaurantId, branchId, warehouseId, products, supplierSlug } = ctx

  await client.query(
    `DELETE FROM route_stop WHERE route_id IN (SELECT id FROM delivery_route WHERE supplier_id = $1)`,
    [supplierId]
  )
  await client.query(`DELETE FROM delivery_route WHERE supplier_id = $1`, [supplierId])
  await client.query(`DELETE FROM driver_assignments WHERE supplier_id = $1`, [supplierId])
  await client.query(`DELETE FROM drivers WHERE supplier_id = $1`, [supplierId])

  const driverDefs = [
    {
      name: 'Ahmed Al Rashid',
      phone: '+971 50 111 2233',
      vehicle: 'Refrigerated Van',
      plate: 'DXB-48291',
    },
    {
      name: 'Priya Nair',
      phone: '+971 50 444 5566',
      vehicle: 'Box Truck',
      plate: 'DXB-77304',
    },
    {
      name: 'Marcus Webb',
      phone: '+971 50 777 8899',
      vehicle: 'Delivery Van',
      plate: 'DXB-21905',
    },
  ]

  const driverIds = []
  for (const d of driverDefs) {
    const id = uuid()
    await client.query(
      `INSERT INTO drivers (id, supplier_id, warehouse_id, full_name, phone, vehicle_type, vehicle_plate, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [id, supplierId, warehouseId, d.name, d.phone, d.vehicle, d.plate]
    )
    driverIds.push({ id, ...d })
  }

  const activeStatuses = [
    { status: 'ACKNOWLEDGED', count: 2 },
    { status: 'PROCESSING', count: 3 },
    { status: 'SHIPPED', count: 3 },
  ]

  const orderIds = []
  let orderNum = 1
  for (const { status, count } of activeStatuses) {
    for (let i = 0; i < count; i++) {
      const orderId = uuid()
      const placedAt = hoursAgo(intBetween(rng, 2, 36))
      await client.query(
        `INSERT INTO customer_order (id, restaurant_id, branch_id, status, total_amount, currency, placed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, 'AED', $5, $5, $5)`,
        [orderId, restaurantId, branchId, status, placedAt]
      )
      let total = 0
      const lineCount = intBetween(rng, 3, 6)
      for (let l = 0; l < lineCount; l++) {
        const p = products[l % products.length]
        const qty = intBetween(rng, 4, 24)
        const line = qty * p.price
        total += line
        await client.query(
          `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, p.id, supplierId, qty, p.price, line]
        )
      }
      await client.query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [
        total,
        orderId,
      ])
      orderIds.push({ id: orderId, status, total, orderNum: orderNum++ })
    }
  }

  const today = todayDate()
  const routeId = uuid()
  const routeNumber = `RT-${supplierSlug.toUpperCase().slice(0, 8)}-${today.replace(/-/g, '')}`
  await client.query(
    `INSERT INTO delivery_route (
       id, supplier_id, route_number, driver_name, vehicle_info, scheduled_date, status, started_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_PROGRESS', now())`,
    [
      routeId,
      supplierId,
      routeNumber,
      driverIds[0].name,
      `${driverIds[0].vehicle} · ${driverIds[0].plate}`,
      today,
    ]
  )

  const routeOrders = orderIds.filter((o) => o.status === 'SHIPPED').slice(0, 3)
  for (let i = 0; i < routeOrders.length; i++) {
    const o = routeOrders[i]
    await client.query(
      `INSERT INTO route_stop (id, route_id, order_id, sequence_number, status, address_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuid(),
        routeId,
        o.id,
        i + 1,
        i === 0 ? 'IN_TRANSIT' : 'PLANNED',
        JSON.stringify({
          street: 'Marina Walk, Tower 3',
          city: 'Dubai',
          region: 'Dubai',
          country: 'UAE',
        }),
      ]
    )
    await client.query(
      `INSERT INTO driver_assignments (
         id, order_id, driver_id, supplier_id, status, assigned_at, picked_up_at
       ) VALUES ($1, $2, $3, $4, $5, now() - interval '2 hours', $6)`,
      [
        uuid(),
        o.id,
        driverIds[i % driverIds.length].id,
        supplierId,
        i === 0 ? 'out_for_delivery' : 'picked_up',
        i === 0 ? hoursAgo(1) : null,
      ]
    )
  }

  const processingOrders = orderIds.filter((o) => o.status === 'PROCESSING').slice(0, 2)
  for (const o of processingOrders) {
    await client.query(
      `INSERT INTO driver_assignments (id, order_id, driver_id, supplier_id, status, assigned_at)
       VALUES ($1, $2, $3, $4, 'assigned', now() - interval '45 minutes')`,
      [uuid(), o.id, pick(rng, driverIds).id, supplierId]
    )
  }

  return {
    drivers: driverIds.length,
    activeOrders: orderIds.length,
    routeNumber,
    routeStops: routeOrders.length,
  }
}

/**
 * @param {import('pg').PoolClient} client
 */
export async function cleanupSmokeTestArtifacts(client) {
  await client.query(
    `DELETE FROM quick_list_item WHERE quick_list_id IN (
       SELECT id FROM quick_list WHERE name LIKE 'smoke_test_%'
     )`
  )
  await client.query(`DELETE FROM quick_list WHERE name LIKE 'smoke_test_%'`)
  await client.query(
    `DELETE FROM order_item WHERE product_id IN (SELECT id FROM product WHERE sku LIKE 'smoke_test_%')`
  )
  await client.query(`DELETE FROM product WHERE sku LIKE 'smoke_test_%'`)
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} restaurantId
 * @param {string} branchId
 */
export async function enhanceMarketingReservations(client, restaurantId, branchId) {
  const layouts = [
    { shape: 'round' },
    { shape: 'square' },
    { shape: 'round' },
    { shape: 'booth' },
    { shape: 'round' },
    { shape: 'square' },
    { shape: 'booth' },
    { shape: 'round' },
  ]
  const { rows: tables } = await client.query(
    `SELECT id, name FROM reservation_table WHERE restaurant_id = $1 ORDER BY name`,
    [restaurantId]
  )
  for (let i = 0; i < tables.length; i++) {
    const x = (i % 4) + 1
    const y = Math.floor(i / 4) + 1
    await client.query(
      `UPDATE reservation_table
       SET position = $1, layout = $2, name = $3
       WHERE id = $4`,
      [
        JSON.stringify({ x, y }),
        JSON.stringify(layouts[i % layouts.length]),
        `T${i + 1}`,
        tables[i].id,
      ]
    )
  }

  await client.query(`DELETE FROM reservation WHERE restaurant_id = $1`, [restaurantId])

  const guests = [
    { name: 'Amelia Winters', party: 4, status: 'CONFIRMED' },
    { name: 'Omar Khalid', party: 2, status: 'SEATED' },
    { name: 'Fatima Al Mansoori', party: 6, status: 'CONFIRMED' },
    { name: 'James Porter', party: 3, status: 'PENDING' },
    { name: 'Layla Hassan', party: 2, status: 'CONFIRMED' },
    { name: 'Chen Liu', party: 5, status: 'COMPLETED' },
    { name: 'Sofia Ricci', party: 4, status: 'CONFIRMED' },
    { name: 'Daniel Okonkwo', party: 2, status: 'WAITLIST' },
  ]

  const now = new Date()
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i]
    const scheduled = new Date(now)
    scheduled.setHours(18 + (i % 3), (i * 15) % 60, 0, 0)
    if (i > 4) scheduled.setDate(scheduled.getDate() + 1)
    const tableId = tables[i % tables.length]?.id
    await client.query(
      `INSERT INTO reservation (
         restaurant_id, branch_id, status, customer_name, customer_phone, party_size,
         scheduled_at, duration_minutes, tables, auto_confirmed
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 90, $8, $9)`,
      [
        restaurantId,
        branchId,
        g.status,
        g.name,
        `+97150${String(1000000 + i).slice(-7)}`,
        g.party,
        scheduled.toISOString(),
        tableId ? [tableId] : [],
        g.status === 'CONFIRMED',
      ]
    )
  }
}
