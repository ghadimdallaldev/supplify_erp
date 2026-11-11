/**
 * Command Center inputs + the re-runnable "today" refresher for seed-horeca-demo.mjs.
 *
 *   sectionOps    every demo supplier: low-stock products, an open dispute, open fulfillment
 *                 exceptions, and boosted-deal analytics for the free-plan supplier.
 *   sectionToday  moves in-flight orders to today (Asia/Beirut), puts out-for-delivery
 *                 assignments on today's date and writes fresh GPS pings. Run it the morning
 *                 of the demo:  node scripts/seed-horeca-demo.mjs --allow-host=... --only=today [--watch]
 */
import crypto from 'node:crypto'

const TZ = 'Asia/Beirut'
const h32 = (k) => parseInt(crypto.createHash('sha1').update(String(k)).digest('hex').slice(0, 8), 16)

export async function sectionOps(H) {
  const { pool: c, state, uid, bulk, ago, log } = H
  for (const [key, S] of state.suppliers) {
    // 1) low-stock products: 4 with 0 < available <= threshold
    const { rows: prods } = await c.query(
      `SELECT p.id, COALESCE(pis.low_stock_threshold, 10) thr FROM product p
       LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
       WHERE p.supplier_id = $1 ORDER BY md5(p.id::text) LIMIT 4`,
      [S.id]
    )
    for (const [i, p] of prods.entries()) {
      const q = Math.max(1, Math.floor(Number(p.thr) * (0.2 + 0.15 * i)))
      await c.query(`UPDATE inventory SET available_qty = $2, updated_at = now() WHERE product_id = $1`, [p.id, q])
      await c.query(
        `UPDATE warehouse_inventory SET quantity_available = CASE WHEN warehouse_id = $2 THEN $3::numeric ELSE 0 END,
           quantity_on_hand = CASE WHEN warehouse_id = $2 THEN $3::numeric ELSE 0 END, updated_at = now() WHERE product_id = $1`,
        [p.id, S.warehouses[0].id, q]
      )
      await bulk(c, 'inventory_alert', [{
        id: uid('alert', p.id), product_id: p.id, warehouse_id: S.warehouses[0].id, alert_type: 'LOW_STOCK',
        threshold_value: p.thr, current_value: q, is_acknowledged: false, created_at: ago(0.2 + i * 0.3),
      }])
    }

    // 2) open dispute (skip when the supplier already has one)
    const { rows: hasDispute } = await c.query(
      `SELECT 1 FROM disputes WHERE supplier_id = $1 AND status IN ('open','under_review','escalated') LIMIT 1`,
      [S.id]
    )
    if (!hasDispute.length) {
      const { rows: cand } = await c.query(
        `SELECT o.id, o.restaurant_id, rr.id rr_id, rr.received_by FROM customer_order o
         JOIN receiving_report rr ON rr.order_id = o.id
         WHERE rr.supplier_id = $1 AND o.status IN ('RECEIVED_FULL','COMPLETED')
         ORDER BY (o.status = 'RECEIVED_FULL') DESC, md5(o.id::text) LIMIT 1`,
        [S.id]
      )
      if (cand[0]) {
        const o = cand[0]
        const { rows: it } = await c.query(
          `SELECT oi.id, oi.quantity, oi.unit_price, p.name FROM order_item oi JOIN product p ON p.id = oi.product_id
           WHERE oi.order_id = $1 ORDER BY oi.line_total DESC LIMIT 1`,
          [o.id]
        )
        const line = it[0]
        const did = uid('dispute-ops', S.id)
        await c.query(`UPDATE customer_order SET status = 'RECEIVED_WITH_DISPUTE', updated_at = now() WHERE id = $1 AND status = 'RECEIVED_FULL'`, [o.id])
        await bulk(c, 'disputes', [{
          id: did, order_id: o.id, restaurant_id: o.restaurant_id, supplier_id: S.id, receiving_report_id: o.rr_id,
          invoice_id: null, type: 'quality_issue', status: 'open',
          description: `${line.name}: quality below the agreed specification on arrival (photos shared in chat).`,
          disputed_amount: Math.round(line.quantity * line.unit_price * 0.4 * 100) / 100, resolution_type: null,
          resolution_notes: null, resolved_at: null, created_by: o.received_by, created_at: ago(1.2), updated_at: ago(1.2),
          replacement_order_id: null,
        }])
        await bulk(c, 'dispute_items', [{
          id: uid('ditem-ops', S.id), dispute_id: did, order_item_id: line.id, product_name: line.name,
          quantity_ordered: line.quantity, quantity_received: line.quantity, unit_price: line.unit_price,
          issue_description: 'Quality issue', created_at: ago(1.2),
        }])
      }
    }

    // 3) open fulfillment exceptions
    const { rows: ords } = await c.query(
      `SELECT DISTINCT o.id FROM customer_order o JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
       WHERE o.status IN ('PROCESSING','ACKNOWLEDGED','PLACED') ORDER BY o.id LIMIT 2`,
      [S.id]
    )
    const kinds = [
      ['unassigned_overdue', 'Order is waiting for a driver and the delivery window is closing.'],
      ['short_delivery', 'Picking found fewer units than ordered; substitution to confirm with the customer.'],
    ]
    await bulk(c, 'fulfillment_exceptions', ords.map((o, i) => ({
      id: uid('fexc', S.id, i), supplier_id: S.id, order_id: o.id, driver_assignment_id: null,
      warehouse_id: S.warehouses[0].id, type: kinds[i][0], status: 'open', description: kinds[i][1],
      created_at: ago(0.3 + i * 0.2), updated_at: ago(0.3 + i * 0.2),
    }))).catch((e) => log('  !! fulfillment_exceptions:', e.message))

    // 4) boosted deal analytics for the free-plan supplier
    if (key === 'coastline') {
      await bulk(c, 'deal_promotions', [{
        id: uid('dealpromo', key), deal_id: uid('promo-coast', 0), supplier_id: S.id, budget: 25, starts_at: ago(6),
        ends_at: ago(-24), target_audience: { areas: ['Jounieh', 'Keserwan'] }, impressions: 640, clicks: 71,
        orders_count: 3, messages_count: 5, coupon_uses: 0, billing_type: 'flat_fee', billing_status: 'waived',
        status: 'active', price_paid: 0, duration_days: 30, package_display_name: 'Starter spotlight',
        created_at: ago(6), updated_at: ago(1),
      }]).catch((e) => log('  !! coast deal:', e.message))
    }
  }
  log('command-center ops inputs seeded for every supplier')
}

async function refreshPings(H, tracked) {
  const { pool: c, uid, log } = H
  const now = Date.now()
  for (const t of tracked) {
    const { rows: act } = await c.query(`SELECT id FROM driver_tracking_session WHERE driver_id = $1 AND status = 'ACTIVE' LIMIT 1`, [t.driverId])
    const sessionId = act[0]?.id || uid('today-session', t.driverId)
    await c.query(
      `INSERT INTO driver_tracking_session (id, supplier_id, driver_id, route_id, started_by, status, started_at, last_heartbeat_at, current_stop_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE', now() - interval '40 minutes', now(), $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', last_heartbeat_at = now(), route_id = EXCLUDED.route_id,
         current_stop_id = EXCLUDED.current_stop_id, updated_at = now()`,
      [sessionId, t.supplierId, t.driverId, t.routeId, t.userId, t.stopId]
    ).catch((e) => log('  !! session:', e.message))
    const N = 6
    let lat = 0
    let lng = 0
    for (let i = 0; i < N; i++) {
      const f = Math.min(0.9, t.progress + (i / (N - 1)) * 0.12)
      lat = t.from.lat + (t.to.lat - t.from.lat) * f + Math.sin(i + t.k) * 0.0003
      lng = t.from.lng + (t.to.lng - t.from.lng) * f + Math.cos(i + t.k) * 0.0003
      const rec = new Date(now - (N - 1 - i) * 45000)
      await c.query(
        `INSERT INTO driver_location_ping (id, supplier_id, driver_id, order_id, driver_assignment_id, route_id, route_stop_id, latitude, longitude, accuracy_meters, speed_mps, heading_degrees, source, recorded_at, created_at, session_id, sequence_number, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,9,7,250,'gps',$10,$10,$11,$12,$10)
         ON CONFLICT (id) DO UPDATE SET recorded_at = EXCLUDED.recorded_at, created_at = EXCLUDED.created_at,
           received_at = EXCLUDED.received_at, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           sequence_number = EXCLUDED.sequence_number`,
        [uid('today-ping', t.orderId, i), t.supplierId, t.driverId, t.orderId, t.daId, t.routeId, t.stopId,
          lat.toFixed(6), lng.toFixed(6), rec, sessionId, Math.floor(now / 1000) * 10 + i]
      ).catch((e) => log('  !! ping:', e.message))
    }
    await c.query(
      `INSERT INTO driver_latest_location (driver_id, supplier_id, order_id, driver_assignment_id, route_id, latitude, longitude, accuracy_meters, speed_mps, heading_degrees, recorded_at, updated_at, session_id, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,9,7,250, now(), now(), $8, now())
       ON CONFLICT (driver_id) DO UPDATE SET order_id = EXCLUDED.order_id, driver_assignment_id = EXCLUDED.driver_assignment_id,
         route_id = EXCLUDED.route_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, recorded_at = now(),
         updated_at = now(), session_id = EXCLUDED.session_id, received_at = now()`,
      [t.driverId, t.supplierId, t.orderId, t.daId, t.routeId, lat.toFixed(6), lng.toFixed(6), sessionId]
    ).catch((e) => log('  !! latest location:', e.message))
  }
}

export async function sectionToday(H) {
  const { pool: c, state, uid, log, isoDate } = H
  const tracked = []
  const restaurantById = (id) => [...state.restaurants.values()].find((r) => r.id === id)
  for (const [, S] of state.suppliers) {
    const { rows: pool } = await c.query(
      `SELECT o.id, o.restaurant_id FROM customer_order o
       WHERE o.status IN ('ACKNOWLEDGED','PROCESSING','SHIPPED','PLACED')
         AND EXISTS (SELECT 1 FROM order_item i WHERE i.order_id = o.id AND i.supplier_id = $1)
       ORDER BY (EXISTS (SELECT 1 FROM driver_assignments da WHERE da.order_id = o.id AND da.status = 'out_for_delivery')) DESC,
                md5(o.id::text)`,
      [S.id]
    )
    // 2 out for delivery, 2 acknowledged + 3 processing (to prepare today), 3 newly placed
    const plan = ['SHIPPED', 'SHIPPED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'PROCESSING', 'PROCESSING', 'PROCESSING', 'PLACED', 'PLACED', 'PLACED']
    const drivers = S.drivers || []
    let shippedIdx = 0
    for (const [i, o] of pool.slice(0, plan.length).entries()) {
      const status = plan[i]
      const offset = `${4 + Math.floor(i / 2)} hours ${10 + (i % 2) * 25 + i} minutes`
      await c.query(
        `UPDATE customer_order SET status = $2,
           placed_at = LEAST(now() - interval '4 minutes', (date_trunc('day', now() AT TIME ZONE $4) + $3::interval) AT TIME ZONE $4),
           created_at = LEAST(now() - interval '4 minutes', (date_trunc('day', now() AT TIME ZONE $4) + $3::interval) AT TIME ZONE $4),
           updated_at = now(), requested_delivery_date = (now() AT TIME ZONE $4)::date
         WHERE id = $1`,
        [o.id, status, offset, TZ]
      )
      if (status !== 'SHIPPED' || !drivers.length) continue
      const driver = drivers[shippedIdx % drivers.length]
      shippedIdx++
      const today = isoDate(new Date())
      const R = restaurantById(o.restaurant_id)
      const { rows: existing } = await c.query(
        `SELECT da.id, (SELECT rs.route_id FROM route_stop rs WHERE rs.order_id = da.order_id LIMIT 1) route_id
         FROM driver_assignments da WHERE da.order_id = $1 AND da.status = 'out_for_delivery' LIMIT 1`,
        [o.id]
      )
      let daId = existing[0]?.id
      let routeId = existing[0]?.route_id
      let stopId
      if (!daId) {
        daId = uid('today-da', o.id)
        routeId = uid('today-route', o.id)
        stopId = uid('today-stop', o.id)
        const rn = `RT-${today.replace(/-/g, '')}-T${(h32(o.id) % 900) + 100}`
        await c.query(
          `INSERT INTO delivery_route (id, supplier_id, route_number, driver_name, vehicle_info, scheduled_date, status, started_at, driver_id, route_label, area, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'Delivery van',$5,'IN_PROGRESS', now() - interval '35 minutes', $6, 'Morning run', 'Greater Beirut', now(), now())
           ON CONFLICT (id) DO NOTHING`,
          [routeId, S.id, rn, driver.name, today, driver.id]
        )
        await c.query(
          `INSERT INTO route_stop (id, route_id, order_id, sequence_number, estimated_arrival, status, address_json, latitude, longitude, created_at, departed_at)
           VALUES ($1,$2,$3,1,'09:05','IN_TRANSIT',$4::jsonb,$5,$6, now(), now() - interval '35 minutes') ON CONFLICT (id) DO NOTHING`,
          [stopId, routeId, o.id, JSON.stringify({ city: R?.def.city }), R?.def.lat ?? null, R?.def.lng ?? null]
        )
        await c.query(
          `INSERT INTO driver_assignments (id, order_id, driver_id, supplier_id, assigned_at, status, picked_up_at, scheduled_delivery_date, rollover_count, created_at, updated_at)
           VALUES ($1,$2,$3,$4, now() - interval '50 minutes','out_for_delivery', now() - interval '40 minutes', $5, 0, now(), now())
           ON CONFLICT (id) DO NOTHING`,
          [daId, o.id, driver.id, S.id, today]
        )
      } else {
        stopId = (await c.query('SELECT id FROM route_stop WHERE route_id = $1 LIMIT 1', [routeId])).rows[0]?.id
        await c.query(
          `UPDATE driver_assignments SET scheduled_delivery_date = $2, assigned_at = now() - interval '50 minutes', picked_up_at = now() - interval '40 minutes', updated_at = now() WHERE id = $1`,
          [daId, today]
        )
        await c.query(`UPDATE delivery_route SET scheduled_date = $2, status = 'IN_PROGRESS', started_at = now() - interval '35 minutes', updated_at = now() WHERE id = $1`, [routeId, today])
        await c.query(`UPDATE route_stop SET status = 'IN_TRANSIT', departed_at = now() - interval '35 minutes' WHERE route_id = $1`, [routeId])
      }
      tracked.push({
        supplierId: S.id, driverId: driver.id, userId: driver.userId || null, orderId: o.id, daId, routeId, stopId,
        progress: 0.4 + 0.1 * shippedIdx, k: i, from: { lat: S.def.lat, lng: S.def.lng },
        to: { lat: R?.def.lat ?? S.def.lat + 0.02, lng: R?.def.lng ?? S.def.lng - 0.03 },
      })
    }
    log(`  today: ${S.def.name}: ${Math.min(pool.length, plan.length)} orders moved to today, ${shippedIdx} out for delivery`)
  }
  await refreshPings(H, tracked)
  log(`  GPS: fresh pings written for ${tracked.length} deliveries`)
  if (process.argv.includes('--watch')) {
    log('  --watch: refreshing GPS every 40s (Ctrl+C to stop)')
    await new Promise(() => setInterval(() => refreshPings(H, tracked).catch(() => {}), 40000))
  }
}
