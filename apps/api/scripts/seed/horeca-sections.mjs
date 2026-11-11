/**
 * Commerce / operations sections for seed-horeca-demo.mjs (orders in every status, delivery,
 * receiving, finance, disputes, promotions, loyalty, chat, notifications, quick lists).
 * Registered via register(SECTIONS, helpers). Everything uses deterministic ids + DO NOTHING.
 */
import crypto from 'node:crypto'
import { CHAT_SNIPPETS } from './horeca-data.mjs'
import { sectionExtras } from './horeca-extras.mjs'
import { sectionOps, sectionToday } from './horeca-today.mjs'

const h32 = (k) => parseInt(crypto.createHash('sha1').update(String(k)).digest('hex').slice(0, 8), 16)
const hnum = (k, digits = 6) => String(h32(k) % 10 ** digits).padStart(digits, '0')

const TERMS_DAYS = { 'Net 7': 7, 'Net 15': 15, 'Net 30': 30 }
const VAT = 0.11
const USED_INV = new Set()

export function register(SECTIONS, H) {
  SECTIONS.push(['promos', () => sectionPromos(H)])
  SECTIONS.push(['commerce', () => sectionCommerce(H)])
  SECTIONS.push(['engagement', () => sectionEngagement(H)])
  SECTIONS.push(['extras', () => sectionExtras(H)])
  SECTIONS.push(['ops', () => sectionOps(H)])
  SECTIONS.push(['today', () => sectionToday(H)])
}

const argv = process.argv.slice(2)
const argVal = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')

// Showcase schedules. age = days ago the order was placed.
const SHOWCASE = {
  riviera: [
    { age: 0.2, status: 'DRAFT' },
    { age: 0.5, status: 'PLACED' },
    { age: 1.2, status: 'ACKNOWLEDGED', amend: 'pending' },
    { age: 1.6, status: 'PROCESSING', amend: 'accepted' },
    { age: 0.4, status: 'SHIPPED', driver: 'fadi' },
    { age: 2, status: 'DELIVERED' },
    { age: 5, status: 'RECEIVED_PARTIAL' },
    { age: 8, status: 'RECEIVED_FULL' },
    { age: 11, status: 'RECEIVED_WITH_DISPUTE', dispute: 'open' },
    { age: 7, status: 'INVOICED', inv: 'ISSUED' },
    { age: 10, status: 'INVOICED', inv: 'PARTIALLY_PAID' },
    { age: 14, status: 'INVOICED', inv: 'PARTIALLY_PAID', dispute: 'resolved' },
    { age: 44, status: 'INVOICED', inv: 'OVERDUE' },
    { age: 58, status: 'INVOICED', inv: 'OVERDUE_PARTIAL' },
    { age: 4, status: 'CANCELLED' },
    { age: 33, status: 'CANCELLED', inv: 'VOID' },
    { age: 22, status: 'COMPLETED', promo: true },
    { age: 27, status: 'COMPLETED' },
  ],
  hamra: [
    { age: 0.3, status: 'PLACED' },
    { age: 1.0, status: 'PROCESSING' },
    { age: 1.8, status: 'DELIVERED' },
    { age: 6, status: 'RECEIVED_FULL' },
    { age: 9, status: 'INVOICED', inv: 'ISSUED' },
    { age: 38, status: 'INVOICED', inv: 'OVERDUE' },
    { age: 18, status: 'COMPLETED', dispute: 'credit-issued' },
    { age: 3, status: 'CANCELLED' },
  ],
}
const FILLER = { riviera: 16, hamra: 12 }
// Customers that used to order weekly but went quiet (reorder-cadence risk). Fresh pairs, seeded as extra relations.
export const AT_RISK_PAIRS = ['marmikhael:cedar','gemmayze:bekaa','byblosfish:bekaa','gemmayze:phoenicia','hamra:phoenicia','marmikhael:meats','zaatar:meats','marmikhael:levant','riviera-batroun:levant','gemmayze:beverage','zaatar:beverage','byblosfish:coastline','jounieh:coastline']
const AT_RISK = new Set(AT_RISK_PAIRS)
const LIGHT = [
  { age: 0.6, status: 'PLACED' },
  { age: 1.4, status: 'PROCESSING' },
  { age: 2.2, status: 'DELIVERED' },
  { age: 6, status: 'RECEIVED_FULL' },
  { age: 9, status: 'INVOICED', inv: 'ISSUED' },
  { age: 36, status: 'INVOICED', inv: 'OVERDUE' },
  { age: 3.5, status: 'CANCELLED' },
]

function pickStatus(rnd, age) {
  const r = rnd()
  if (age < 3) return r < 0.4 ? 'PLACED' : r < 0.7 ? 'PROCESSING' : r < 0.9 ? 'DELIVERED' : 'CANCELLED'
  if (age < 15) return r < 0.5 ? 'COMPLETED' : r < 0.8 ? 'RECEIVED_FULL' : 'INVOICED'
  return r < 0.86 ? 'COMPLETED' : r < 0.94 ? 'INVOICED' : 'CANCELLED'
}

// -----------------------------------------------------------------------------------------
// Promotions + loyalty program (per supplier with promotions)
// -----------------------------------------------------------------------------------------
async function sectionPromos(H) {
  const { pool: c, state, uid, bulk, ago, log, img, r2 } = H
  const admin = state.admin
  const cedar = state.suppliers.get('cedar')
  const promoSuppliers = ['cedar', 'bekaa', 'phoenicia', 'meats', 'levant', 'beverage']
  for (const key of promoSuppliers) {
    const s = state.suppliers.get(key)
    if (!s) continue
    const rows = [
      {
        id: uid('promo', key, 'coupon'), supplier_id: s.id, name: key === 'cedar' ? 'HORECA Launch: 10% off all produce' : `${s.def.name}: 10% HORECA week`,
        description: 'Show your support for Lebanese growers: 10% off your order with the coupon code. Minimum order $100.',
        type: 'percentage_discount', discount_value: 10, min_order_amount: 100, max_discount_cap: 60, applies_to: 'all', status: 'active',
        starts_at: ago(20), ends_at: ago(-40), usage_limit: 200, usage_count: key === 'cedar' ? 3 : 7, is_featured: false,
        image_url: img(s.def.coverImg), coupon_code: key === 'cedar' ? 'HORECA10' : `${key.toUpperCase().slice(0, 5)}10`, cta_type: 'use_coupon',
        requires_admin_approval: true, approved_by_admin_id: admin.id, approved_at: ago(19), payment_status: 'not_required', submitted_at: ago(21), created_at: ago(21), updated_at: ago(19),
      },
      {
        id: uid('promo', key, 'featured'), supplier_id: s.id, name: key === 'cedar' ? 'Featured: Fresh Herbs & Greens, delivered by 7am' : `Featured: ${s.def.name} weekly specials`,
        description: 'Boosted deal: priority placement for restaurants in Greater Beirut. 5% off herbs and leafy greens.',
        type: 'percentage_discount', discount_value: 5, min_order_amount: 40, applies_to: 'all', status: 'active',
        starts_at: ago(8), ends_at: ago(-22), usage_limit: null, usage_count: 4, is_featured: true,
        image_url: img(s.def.coverImg), cta_type: 'order_now', requires_admin_approval: true, approved_by_admin_id: admin.id, approved_at: ago(7),
        payment_status: 'paid', boost_pricing_key: 'boost_30d', boost_price_snapshot: 59, boost_duration_days: 30, boost_start_at: ago(8), boost_end_at: ago(-22),
        submitted_at: ago(9), created_at: ago(9), updated_at: ago(7),
      },
      {
        id: uid('promo', key, 'shipping'), supplier_id: s.id, name: 'Free delivery on orders above $150', description: 'Free delivery inside Greater Beirut for orders above $150.',
        type: 'free_shipping', discount_value: 0, min_order_amount: 150, applies_to: 'all', status: 'active', starts_at: ago(30), ends_at: ago(-60), usage_limit: null, usage_count: 11,
        is_featured: false, image_url: img(s.def.coverImg), cta_type: 'order_now', requires_admin_approval: true, approved_by_admin_id: admin.id, approved_at: ago(29), payment_status: 'not_required', submitted_at: ago(31), created_at: ago(31), updated_at: ago(29),
      },
    ]
    if (key === 'cedar') {
      rows.push({
        id: uid('promo', key, 'pending'), supplier_id: s.id, name: 'Autumn pomegranate special: $5 off per case', description: 'Seasonal fixed discount, awaiting admin approval (use it to demo the approval flow).',
        type: 'fixed_discount', discount_value: 5, min_order_amount: 50, applies_to: 'all', status: 'pending_admin_approval', starts_at: ago(-2), ends_at: ago(-30), usage_limit: 100, usage_count: 0,
        is_featured: false, image_url: img('pomegranate'), cta_type: 'order_now', requires_admin_approval: true, payment_status: 'not_required', submitted_at: ago(1), created_at: ago(1), updated_at: ago(1),
      })
    }
    if (key === 'levant') {
      rows.push({
        id: uid('promo', key, 'unpaid'), supplier_id: s.id, name: 'Bulk tahini and olive oil: 8% off pallets', description: 'Approved by admin, waiting for the activation payment.',
        type: 'percentage_discount', discount_value: 8, min_order_amount: 300, applies_to: 'all', status: 'approved_pending_payment', starts_at: ago(-3), ends_at: ago(-33), usage_limit: 50, usage_count: 0,
        is_featured: false, image_url: img('tahini'), cta_type: 'order_now', requires_admin_approval: true, approved_by_admin_id: admin.id, approved_at: ago(0.5), payment_status: 'pending', submitted_at: ago(2), created_at: ago(2), updated_at: ago(0.5),
      })
    }
    await bulk(c, 'promotions', rows)
    // deal analytics for the boosted deal
    await bulk(c, 'deal_promotions', [{
      id: uid('dealpromo', key), deal_id: uid('promo', key, 'featured'), supplier_id: s.id, budget: 59, starts_at: ago(8), ends_at: ago(-22), target_audience: { areas: ['Beirut', 'Metn'] },
      impressions: 1840, clicks: 212, orders_count: 9, messages_count: 14, coupon_uses: 0, billing_type: 'flat_fee', billing_status: 'paid', status: 'active', price_paid: 59, duration_days: 30,
      package_display_name: '30-day boost', created_at: ago(8), updated_at: ago(1),
    }])
    // loyalty program
    await bulk(c, 'supplier_loyalty_program', [{
      id: uid('loyprog', key), supplier_id: s.id, name: `${s.def.name} Rewards`, enabled: true, earn_points_per_currency: 1, redeem_currency_per_point: 0.01,
      min_redeem_points: 200, max_redeem_percent: 20, rules_json: {}, created_at: ago(60), updated_at: ago(60),
    }])
  }
  log('promotions, boosted deals and loyalty programs seeded')
}

// -----------------------------------------------------------------------------------------
// Commerce
// -----------------------------------------------------------------------------------------
async function sectionCommerce(H) {
  const { pool: c, state, uid, bulk, ago, NOW, DAY, log, r2, isoDate, rng, intBetween, pick, shuffle, img } = H
  const pairsArg = defaultPairs(H)
  const T = {
    orders: [], items: [], assigns: [], driverAssign: [], routes: [], stops: [], pods: [], receipts: [], rlines: [],
    disputes: [], ditems: [], invoices: [], ilines: [], payments: [], credits: [], clines: [], effects: [],
    ledger: [], reviews: [], promoUse: [], amends: [], amendItems: [], issues: [], pricing: [], follows: [],
    messages: [],
  }
  const seqs = {}
  const next = (k) => (seqs[k] = (seqs[k] || 0) + 1)
  const promoOf = (sKey) => uid('promo', sKey, 'coupon')
  const loyaltyBalances = new Map()

  for (const [rKey, sKey] of pairsArg) {
    const R = state.restaurants.get(rKey)
    const S = state.suppliers.get(sKey)
    if (!R || !S || !S.products.length) { log(`  skip pair ${rKey}:${sKey} (missing tenant or catalog)`); continue }
    const rnd = H.createSeededRng(h32(rKey + '|' + sKey))
    const termsDays = TERMS_DAYS[S.def.paymentTerms] || 15
    const rUsers = [...state.users.values()].filter((u) => u.kind === 'restaurant' && u.tenantKey === rKey)
    const receiver = rUsers.find((u) => u.roleName === 'Receiving Staff') || rUsers[0]
    const buyer = rUsers.find((u) => u.roleName === 'Purchaser') || rUsers[0]
    const rd = R.def
    const fadi = S.drivers.find((d) => /fadi/i.test(d.name)) || S.drivers[0]
    const driversList = S.drivers.length ? S.drivers : null
    const main = S.warehouses.find((w) => w.main) || S.warehouses[0]

    // contract pricing for this customer
    const stocked = S.products.filter((p) => p.price > 0)
    const contractProducts = stocked.filter((_, i) => i % 5 === 0).slice(0, 12)
    const contract = new Map()
    for (const p of contractProducts) {
      const disc = [8, 10, 12][intBetween(rnd, 0, 2)]
      const price = r2(p.price * (1 - disc / 100))
      const id = uid('contract', rKey, sKey, p.id)
      contract.set(p.id, { id, price })
      T.pricing.push({ id, supplier_id: S.id, restaurant_id: R.id, product_id: p.id, price, currency: 'USD', contract_discount_percentage: disc, contract_start_date: isoDate(ago(80)), contract_end_date: isoDate(ago(-120)), agreement_type: rKey === 'riviera' ? 'VOLUME' : 'RELATIONSHIP', min_order_quantity: 1, is_active: true, notes: `Annual HORECA agreement: ${disc}% off list`, created_at: ago(80), updated_at: ago(80) })
    }
    T.follows.push({ id: uid('follow', rKey, sKey), restaurant_id: R.id, supplier_id: S.id, created_at: ago(85) })

    const weight = (H.RELATIONS[rKey] || {})[sKey] || 1
    const isCedar = sKey === 'cedar'
    const atRisk = AT_RISK.has(rKey + ':' + sKey)
    const schedule = atRisk
      ? [74, 66, 59, 52, 45, 38].map((age) => ({ age, status: 'COMPLETED' }))
      : isCedar ? [...(SHOWCASE[rKey] || [])] : [...LIGHT.slice(0, weight >= 2 ? 7 : 4)]
    const fillers = atRisk ? 0 : isCedar ? (FILLER[rKey] ?? 6) : 3 + weight * 2
    for (let i = 0; i < fillers; i++) {
      const age = 29 + (i * 58) / fillers + rnd() * 2
      const st = pickStatus(rnd, age)
      schedule.push({ age, status: st === 'INVOICED' ? 'COMPLETED' : st })
    }
    if (!atRisk && weight >= 2) {
      // Wholesale-sized unpaid invoices with realistic 30/60/90-day aging (appended: never shifts earlier orders)
      const ods = [6, 22, 48, 75, 100, 35, 14, 60]
      const k = h32(rKey + ':' + sKey)
      const nBig = weight >= 3 ? 3 : 2
      for (let j = 0; j < nBig - 1; j++) {
        schedule.push({ age: termsDays + ods[(k + j * 3) % 8] + 1 + 0.3 * j, status: 'INVOICED', inv: 'OVERDUE', big: true, target: 900 + (h32(rKey + sKey + j) % 1500) })
      }
      schedule.push({ age: Math.max(1.5, termsDays - 9), status: 'INVOICED', inv: 'ISSUED', big: true, target: 1100 + (k % 1200) })
    }
    if (isCedar && !atRisk && !SHOWCASE[rKey]) {
      // keep Cedar's Command Center full for every customer: a few fresh in-flight orders (appended, new ids)
      schedule.push({ age: 0.7, status: 'PLACED' }, { age: 0.9, status: 'PLACED' }, { age: 1.3, status: 'PROCESSING' }, { age: 1.0, status: 'ACKNOWLEDGED' })
    }
    let promoUsed = 0

    for (const [idx, sc] of schedule.entries()) {
      const oid = uid('order', rKey, sKey, idx)
      const placedAt = ago(sc.age, null)
      placedAt.setUTCHours(5 + (idx % 6), (idx * 7) % 60, 0, 0)
      if (placedAt > NOW) placedAt.setTime(NOW.getTime() - 20 * 60000)
      // lines
      const orng = H.createSeededRng(h32(oid))
      const nLines = intBetween(orng, 3, 8)
      const chosen = shuffle(orng, [...stocked]).slice(0, nLines)
      const promo = sc.promo === true
      const qtys = chosen.map((p) => (['kg', 'bunch', 'each'].includes(p.unit) ? intBetween(orng, 5, 40) : intBetween(orng, 1, 8)))
      let mult = 1
      if (sc.big) {
        const base = chosen.reduce((a, p, i) => a + (contract.get(p.id)?.price ?? p.price) * qtys[i], 0)
        mult = Math.max(1, Math.ceil(sc.target / Math.max(base, 1)))
      }
      const items = chosen.map((p, li) => {
        const qty = qtys[li] * mult
        const ct = contract.get(p.id)
        let unit = ct ? ct.price : p.price
        let source = ct ? 'CONTRACT_PRICE' : 'DEFAULT_PRICE'
        let orig = null
        if (promo) { orig = unit; unit = r2(unit * 0.9); source = 'PROMOTION_PRICE' }
        return { id: uid('oitem', oid, li), order_id: oid, product_id: p.id, supplier_id: S.id, quantity: qty, unit_price: unit, line_total: r2(unit * qty), notes: null, pricing_source: source, contract_price_id: ct?.id || null, default_catalog_price: p.price, original_unit_price: orig, _p: p }
      })
      const total = r2(items.reduce((a, b) => a + b.line_total, 0))
      const status = sc.status
      const reqDate = new Date(placedAt.getTime() + DAY)
      T.orders.push({
        id: oid, restaurant_id: R.id, status, total_amount: total, currency: 'USD', placed_at: status === 'DRAFT' ? null : placedAt, created_at: placedAt, updated_at: new Date(Math.min(NOW.getTime(), placedAt.getTime() + (status === 'DRAFT' ? 0 : 3600000 * 6))),
        supplier_organization_id: S.orgId, delivery_location_snapshot: { id: R.id, type: 'restaurant', label: `${rd.name} service entrance`, latitude: rd.lat, longitude: rd.lng, address: `${rd.area}, ${rd.city}` },
        requested_delivery_date: isoDate(reqDate), requested_delivery_method: 'delivery', requested_delivery_time: ['07:00-09:00', '06:00-08:00', '09:00-11:00'][idx % 3],
        notes: idx % 4 === 0 ? 'Please deliver to the kitchen entrance. Ask for Chef ' + (rKey === 'riviera' ? 'Nour' : 'Karl') + '.' : null,
        customer_type: 'RESTAURANT', subtotal_amount: total, delivery_fee: 0, placement_source: 'web',
        cancel_reason: status === 'CANCELLED' ? 'Menu change: no longer needed' : null, cancelled_by: status === 'CANCELLED' ? 'RESTAURANT' : null,
      })
      for (const it of items) { const { _p, ...row } = it; T.items.push(row) }
      if (promo) {
        promoUsed++
        T.promoUse.push({ id: uid('puse', oid), promotion_id: promoOf(sKey), order_id: oid, restaurant_id: R.id, discount_applied: r2(items.reduce((a, b) => a + (b.original_unit_price - b.unit_price) * b.quantity, 0)), applied_at: placedAt, deal_title: 'HORECA Launch: 10% off all produce', deal_type: 'percentage_discount', supplier_id: S.id, discount_type: 'percentage', discount_value: 10 })
      }
      if (['DRAFT', 'CANCELLED', 'PLACED'].includes(status)) {
        if (status === 'CANCELLED' && sc.inv === 'VOID') {
          // invoice was raised then voided after the cancellation
          pushInvoice({ oid, S, R, items, total, placedAt, termsDays, state: 'VOID', T, uid, next, ago, isoDate, r2, NOW, DAY })
        }
        continue
      }
      // warehouse assignment
      const awStatus = { ACKNOWLEDGED: 'pending', PROCESSING: 'picking', SHIPPED: 'dispatched' }[status] || 'delivered'
      T.assigns.push({ id: uid('owa', oid), order_id: oid, warehouse_id: main.id, assigned_by: 'auto', assigned_at: placedAt, status: awStatus, dispatched_at: ['dispatched', 'delivered'].includes(awStatus) ? new Date(placedAt.getTime() + 4 * 3600000) : null, assignment_source: 'automatic', assignment_reason: { rule: 'default' }, version: 1 })
      // amendments
      if (sc.amend) {
        const aid = uid('amend', oid)
        const target = items[0]
        T.amends.push({ id: aid, order_id: oid, requested_by_role: 'restaurant', requested_by: buyer.id, status: sc.amend, change_type: 'quantity_change', description: `Please increase ${target._p.name} to ${target.quantity + 10}`, responded_by: sc.amend === 'accepted' ? state.users.get(S.def.team[0]?.email || S.def.owner.email)?.id : null, response_notes: sc.amend === 'accepted' ? 'Confirmed, we have stock.' : null, responded_at: sc.amend === 'accepted' ? new Date(placedAt.getTime() + 3600000) : null, created_at: new Date(placedAt.getTime() + 1800000), updated_at: new Date(placedAt.getTime() + 3600000) })
        T.amendItems.push({ id: uid('amenditem', oid), amendment_id: aid, order_item_id: target.id, original_product_id: target.product_id, original_quantity: target.quantity, requested_quantity: target.quantity + 10, unit_price: target.unit_price, notes: 'Extra covers for weekend event' })
      }
      if (['ACKNOWLEDGED', 'PROCESSING'].includes(status)) continue
      // delivery
      const driver = sc.driver === 'fadi' ? fadi : driversList ? driversList[idx % driversList.length] : null
      const out = status === 'SHIPPED'
      const deliveredAt = new Date(placedAt.getTime() + DAY * 0.45)
      let routeId = null, stopId = null, daId = null
      if (driver) {
        routeId = uid('route', oid); stopId = uid('stop', oid); daId = uid('da', oid)
        const rn = `RT-${isoDate(placedAt).replace(/-/g, '')}-${hnum(oid + 'route', 4)}`
        T.routes.push({ id: routeId, supplier_id: S.id, route_number: rn, driver_name: driver.name, vehicle_info: 'Refrigerated van', scheduled_date: isoDate(placedAt), status: out ? 'IN_PROGRESS' : 'COMPLETED', started_at: out ? new Date(NOW.getTime() - 35 * 60000) : new Date(placedAt.getTime() + 5 * 3600000), completed_at: out ? null : deliveredAt, driver_id: driver.id, route_label: `${rd.city} morning run`, area: rd.city, created_at: placedAt, updated_at: placedAt })
        T.stops.push({ id: stopId, route_id: routeId, order_id: oid, sequence_number: 1, estimated_arrival: '08:10', actual_arrival: out ? null : deliveredAt, completed_at: out ? null : deliveredAt, status: out ? 'IN_TRANSIT' : 'COMPLETED', address_json: { city: rd.city, street: rd.area }, latitude: rd.lat, longitude: rd.lng, created_at: placedAt, departed_at: out ? new Date(NOW.getTime() - 35 * 60000) : null })
        T.driverAssign.push({ id: daId, order_id: oid, driver_id: driver.id, supplier_id: S.id, assigned_by: null, assigned_at: placedAt, status: out ? 'out_for_delivery' : 'delivered', picked_up_at: out ? new Date(NOW.getTime() - 40 * 60000) : new Date(deliveredAt.getTime() - 2400000), delivered_at: out ? null : deliveredAt, scheduled_delivery_date: isoDate(placedAt), rollover_count: 0, created_at: placedAt, updated_at: placedAt })
        if (out) state._tracking = { oid, driver, routeId, stopId, daId, S, R, rd, placedAt }
      }
      if (out) continue
      if (status === 'DELIVERED' || true) {
        T.pods.push({ id: uid('pod', oid), order_id: oid, route_stop_id: stopId, delivery_date: isoDate(deliveredAt), delivered_by: driver?.name || 'Cedar Fresh driver', recipient_name: receiver ? `${receiver.first} ${receiver.last}` : 'Receiving staff', delivery_gps_lat: rd.lat + 0.0002, delivery_gps_lng: rd.lng - 0.0002, delivery_timestamp: deliveredAt, notes: 'Delivered to service entrance, cold chain intact (4C).', created_at: deliveredAt, driver_assignment_id: daId, confirmed_by: receiver?.id || null, confirmed_at: deliveredAt })
      }
      if (status === 'DELIVERED') continue
      // receiving
      const partial = status === 'RECEIVED_PARTIAL'
      const rid = uid('rr', oid)
      const receivedAt = new Date(deliveredAt.getTime() + 1800000)
      let totalRecv = 0
      const rl = items.map((it, li) => {
        const short = (partial && li < 2) || (status === 'RECEIVED_WITH_DISPUTE' && li === 0)
        const rq = short ? Math.max(0, Math.floor(it.quantity * (partial ? 0.6 : 0.5))) : it.quantity
        totalRecv += rq * it.unit_price
        return { id: uid('rli', oid, li), receiving_report_id: rid, product_id: it.product_id, order_item_id: it.id, product_name: it._p.name, product_sku: it._p.sku, ordered_quantity: it.quantity, received_quantity: rq, unit: it._p.unit, expected_unit_price: it.unit_price, actual_unit_price: it.unit_price, notes: short ? 'Short delivery' : null, quality_status: short && status === 'RECEIVED_WITH_DISPUTE' ? 'DAMAGED' : 'GOOD', created_at: receivedAt, updated_at: receivedAt, _short: short, _it: it }
      })
      T.receipts.push({ id: rid, order_id: oid, restaurant_id: R.id, supplier_id: S.id, received_by: receiver?.id, received_at: receivedAt, delivery_truck_number: driver ? 'B 3177' + (idx % 10) : null, driver_name: driver?.name, delivery_notes: partial ? 'Two items short, balance to follow' : 'All items checked against delivery note', status: partial || status === 'RECEIVED_WITH_DISPUTE' ? 'PARTIAL' : 'ACCEPTED', total_items_ordered: items.reduce((a, b) => a + Number(b.quantity), 0), total_items_received: rl.reduce((a, b) => a + b.received_quantity, 0), total_expected_cost: total, total_actual_cost: r2(totalRecv), quality_score: partial ? 3 : status === 'RECEIVED_WITH_DISPUTE' ? 2 : 4 + (idx % 2), quality_notes: partial ? 'Produce fresh, two lines short' : null, created_at: receivedAt, updated_at: receivedAt })
      for (const l of rl) { const { _short, _it, ...row } = l; T.rlines.push(row) }
      // dispute
      let invoiceState = sc.inv || (status === 'INVOICED' ? 'ISSUED' : status === 'COMPLETED' ? 'PAID' : null)
      let invId = null
      if (invoiceState) invId = pushInvoice({ oid, S, R, items, total, placedAt: deliveredAt, termsDays, state: invoiceState, T, uid, next, ago, isoDate, r2, NOW, DAY })
      if (sc.dispute) {
        const did = uid('dispute', oid)
        const first = rl.find((l) => l._short) || rl[0]
        const it = first._it
        const short = first.ordered_quantity - first.received_quantity || Math.ceil(first.ordered_quantity * 0.3)
        const amount = r2(short * it.unit_price)
        const resolved = sc.dispute !== 'open'
        T.disputes.push({ id: did, order_id: oid, restaurant_id: R.id, supplier_id: S.id, receiving_report_id: rid, invoice_id: invId, type: 'short_delivery', status: sc.dispute === 'open' ? 'under_review' : 'resolved', description: `${it._p.name}: ordered ${first.ordered_quantity}, received ${first.received_quantity}. Pallet was damaged in transit.`, disputed_amount: amount, resolution_type: resolved ? 'credit_note' : null, resolution_notes: resolved ? 'Credit note issued for the short quantity.' : null, resolved_at: resolved ? new Date(receivedAt.getTime() + 2 * DAY) : null, created_by: receiver?.id, created_at: receivedAt, updated_at: receivedAt })
        T.ditems.push({ id: uid('ditem', oid), dispute_id: did, order_item_id: it.id, product_name: it._p.name, quantity_ordered: first.ordered_quantity, quantity_received: first.received_quantity, unit_price: it.unit_price, issue_description: 'Short and partly damaged', created_at: receivedAt })
        if (resolved) {
          const cnId = uid('cn', oid)
          const applied = sc.dispute === 'resolved'
          T.credits.push({ id: cnId, credit_note_number: `CN-${S.def.skuPrefix}-2026-${hnum(oid + 'cn', 5)}`, invoice_id: invId, supplier_id: S.id, restaurant_id: R.id, issue_date: isoDate(new Date(receivedAt.getTime() + 2 * DAY)), reason: 'SHORTAGE', description: `Short delivery credit for ${it._p.name}`, credit_amount: amount, applied_amount: applied ? amount : 0, remaining_amount: applied ? 0 : amount, status: applied ? 'APPLIED' : 'ISSUED', currency: 'USD', reference_invoice_number: null, order_id: oid, created_by: 'system', issued_by: 'system', created_at: new Date(receivedAt.getTime() + 2 * DAY), updated_at: new Date(receivedAt.getTime() + 2 * DAY), dispute_id: did })
          T.clines.push({ id: uid('cnl', oid), credit_note_id: cnId, product_id: it.product_id, description: it._p.name, sku: it._p.sku, quantity: short, unit_price: it.unit_price, credit_amount: amount, created_at: receivedAt })
          T.effects.push({ id: uid('eff', oid), dispute_id: did, effect_type: 'credit_note', amount, currency: 'USD', reference: cnId, credit_note_id: cnId, effect_data: {}, created_at: new Date(receivedAt.getTime() + 2 * DAY) })
          if (applied && invId) {
            const inv = T.invoices.find((x) => x.id === invId)
            T.payments.push({ id: uid('paycn', oid), invoice_id: invId, payment_number: `PAY-CREDIT-${S.def.skuPrefix}-${hnum(oid + 'paycn', 5)}`, payment_date: isoDate(new Date(receivedAt.getTime() + 2 * DAY)), payment_amount: amount, payment_method: 'OTHER', payment_reference: cnId, bank_name: null, status: 'COMPLETED', currency: 'USD', notes: 'Credit note applied', recorded_by: null })
            void inv
          }
        }
      }
      // loyalty + reviews on settled orders
      if (['COMPLETED', 'INVOICED'].includes(status)) {
        const pts = Math.floor(total)
        const key = `${R.id}|${S.id}`
        const bal = (loyaltyBalances.get(key) || { balance: 0, earned: 0, redeemed: 0 })
        bal.balance += pts; bal.earned += pts
        loyaltyBalances.set(key, bal)
        T.ledger.push({ id: uid('led', oid), supplier_id: S.id, restaurant_id: R.id, order_id: oid, entry_type: 'EARN', points_delta: pts, balance_after: bal.balance, monetary_value: r2(pts * 0.01), reference_id: oid, reference_type: 'ORDER', notes: `Earned on order`, created_at: deliveredAt })
      }
      if (status === 'COMPLETED' && idx % 3 === 0 && buyer) {
        T.reviews.push({ id: uid('rev', oid), supplier_id: S.id, restaurant_id: R.id, order_id: oid, reviewer_user_id: buyer.id, overall_rating: 4 + (idx % 2), quality_rating: 5, delivery_rating: 4 + (idx % 2), value_rating: 4, comment: pick(orng, ['Always fresh and on time. Our chefs love the herbs.', 'Reliable delivery before the breakfast rush, great quality tomatoes.', 'Good prices with the contract, packaging could be better.', 'Excellent produce, drivers are professional.']), created_at: new Date(deliveredAt.getTime() + 2 * DAY), updated_at: new Date(deliveredAt.getTime() + 2 * DAY) })
      }
    }
  }

  // ---- write everything in FK order
  const order = [
    ['restaurant_pricing', T.pricing, 'ON CONFLICT (supplier_id, restaurant_id, product_id) DO NOTHING'],
    ['supplier_follow', T.follows], ['customer_order', T.orders], ['order_item', T.items], ['promotion_usages', T.promoUse],
    ['order_warehouse_assignment', T.assigns], ['order_amendments', T.amends], ['order_amendment_items', T.amendItems],
    ['drivers', []], ['delivery_route', T.routes], ['route_stop', T.stops], ['driver_assignments', T.driverAssign],
    ['proof_of_delivery', T.pods], ['receiving_report', T.receipts], ['receiving_line_item', T.rlines],
    ['invoice', T.invoices], ['invoice_line_item', T.ilines], ['disputes', T.disputes], ['dispute_items', T.ditems],
    ['credit_note', T.credits], ['credit_note_line_item', T.clines], ['dispute_resolution_effects', T.effects],
    ['payment', T.payments], ['loyalty_ledger', T.ledger], ['supplier_reviews', T.reviews],
  ]
  for (const [table, rows, conflict] of order) {
    if (!rows.length) continue
    try {
      const n = await bulk(c, table, rows, conflict ? { conflict } : {})
      log(`  ${table}: +${n}/${rows.length}`)
    } catch (e) {
      log(`  !! ${table} failed: ${e.message}`)
    }
  }
  // payments trigger sets payment_date = today when fully paid; restore the true payment date
  await c.query(`UPDATE invoice i SET payment_date = p.d FROM (SELECT invoice_id, max(payment_date) d FROM payment GROUP BY 1) p WHERE p.invoice_id = i.id AND i.status = 'PAID' AND i.notes LIKE '%HORECA-DEMO%'`).catch((e) => log('  payment_date fix:', e.message))
  // loyalty balances
  for (const [key, b] of loyaltyBalances) {
    const [rid, sid] = key.split('|')
    await c.query(
      `INSERT INTO restaurant_loyalty_balance (id, supplier_id, restaurant_id, points_balance, lifetime_earned, lifetime_redeemed, updated_at) VALUES ($1,$2,$3,$4,$5,0,now())
       ON CONFLICT (supplier_id, restaurant_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, lifetime_earned = EXCLUDED.lifetime_earned`,
      [uid('loybal', rid, sid), sid, rid, b.balance, b.earned]
    ).catch((e) => log('  loyalty balance:', e.message))
  }
  // supplier rating summaries
  await c.query(`
    INSERT INTO supplier_rating_summaries (supplier_id, review_count, avg_overall, avg_quality, avg_delivery, avg_value, updated_at)
    SELECT supplier_id, count(*), round(avg(overall_rating),2), round(avg(quality_rating),2), round(avg(delivery_rating),2), round(avg(value_rating),2), now()
    FROM supplier_reviews GROUP BY supplier_id
    ON CONFLICT (supplier_id) DO UPDATE SET review_count = EXCLUDED.review_count, avg_overall = EXCLUDED.avg_overall, avg_quality = EXCLUDED.avg_quality, avg_delivery = EXCLUDED.avg_delivery, avg_value = EXCLUDED.avg_value, updated_at = now()`).catch((e) => log('  rating summary:', e.message))

  // ---- GPS tracking for the in-progress delivery
  const tr = state._tracking
  if (tr) {
    const sessionId = uid('session', tr.oid)
    const s = tr.S
    const start = { lat: s.def.lat, lng: s.def.lng }
    const end = { lat: tr.rd.lat, lng: tr.rd.lng }
    await bulk(c, 'driver_tracking_session', [{ id: sessionId, supplier_id: s.id, driver_id: tr.driver.id, route_id: tr.routeId, started_by: tr.driver.userId, status: 'ACTIVE', started_at: new Date(NOW.getTime() - 35 * 60000), last_heartbeat_at: new Date(NOW.getTime() - 20000), current_stop_id: tr.stopId, last_valid_latitude: null, created_at: new Date(NOW.getTime() - 35 * 60000), updated_at: NOW }])
    const pings = []
    const N = 14
    for (let i = 0; i < N; i++) {
      const f = 0.12 + (i / (N - 1)) * 0.68
      const rec = new Date(NOW.getTime() - (N - 1 - i) * 150000 - 20000)
      pings.push({ id: uid('ping', tr.oid, i), supplier_id: s.id, driver_id: tr.driver.id, order_id: tr.oid, driver_assignment_id: tr.daId, route_id: tr.routeId, route_stop_id: tr.stopId, latitude: (start.lat + (end.lat - start.lat) * f + Math.sin(i) * 0.0004).toFixed(6), longitude: (start.lng + (end.lng - start.lng) * f + Math.cos(i) * 0.0004).toFixed(6), accuracy_meters: 8 + (i % 4), speed_mps: 6 + (i % 5), heading_degrees: 255, source: 'gps', recorded_at: rec, created_at: rec, session_id: sessionId, sequence_number: i + 1, received_at: rec })
    }
    await bulk(c, 'driver_location_ping', pings).catch((e) => log('  !! pings:', e.message))
    const last = pings[N - 1]
    await c.query(
      `INSERT INTO driver_latest_location (driver_id, supplier_id, order_id, driver_assignment_id, route_id, latitude, longitude, accuracy_meters, speed_mps, heading_degrees, recorded_at, updated_at, session_id, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,9,8,255,$8,now(),$9,$8)
       ON CONFLICT (driver_id) DO UPDATE SET order_id = EXCLUDED.order_id, driver_assignment_id = EXCLUDED.driver_assignment_id, route_id = EXCLUDED.route_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, recorded_at = EXCLUDED.recorded_at, updated_at = now(), session_id = EXCLUDED.session_id`,
      [tr.driver.id, s.id, tr.oid, tr.daId, tr.routeId, last.latitude, last.longitude, last.recorded_at, sessionId]
    ).catch((e) => log('  !! latest location:', e.message))
    log(`  live tracking: ${tr.driver.name} en route to ${tr.R.def.name} (${N} GPS points)`)
  }
  log(`commerce done: ${T.orders.length} orders, ${T.invoices.length} invoices, ${T.payments.length} payments`)
}

function pushInvoice({ oid, S, R, items, total, placedAt, termsDays, state: st, T, uid, next, ago, isoDate, r2, NOW, DAY }) {
  const id = uid('invoice', oid)
  const issue = new Date(placedAt.getTime() + 0.2 * DAY)
  const due = new Date(issue.getTime() + termsDays * DAY)
  const pre = S.def.skuPrefix
  let salt = 0
  let numbered = `INV-${pre}-2026-${hnum(oid + 'inv', 5)}`
  while (USED_INV.has(numbered)) numbered = `INV-${pre}-2026-${hnum(oid + 'inv' + ++salt, 5)}`
  USED_INV.add(numbered)
  const overdue = due < NOW
  const status = st === 'VOID' ? 'VOID' : st === 'PAID' ? 'ISSUED' : st === 'ISSUED' && overdue ? 'OVERDUE' : st === 'OVERDUE' || st === 'OVERDUE_PARTIAL' ? 'OVERDUE' : 'ISSUED'
  T.invoices.push({
    id, invoice_number: numbered, supplier_id: S.id, restaurant_id: R.id, order_id: oid, invoice_date: isoDate(issue), due_date: isoDate(due), issue_date: isoDate(issue),
    subtotal: total, tax_amount: r2((total * VAT) / (1 + VAT)), total_amount: total, paid_amount: 0, balance_due: total, status, currency: 'USD', tax_rate: 11, tax_included: true,
    payment_terms: S.def.paymentTerms, payment_terms_days: termsDays, notes: 'HORECA-DEMO: Thank you for your business.', created_by: 'system', issued_by: 'system', issued_at: issue,
    voided_at: st === 'VOID' ? new Date(issue.getTime() + 3 * DAY) : null, voided_reason: st === 'VOID' ? 'Order cancelled by the restaurant' : null, voided_by: st === 'VOID' ? 'system' : null,
    created_at: issue, updated_at: issue,
  })
  items.forEach((it, i) =>
    T.ilines.push({ id: uid('iline', oid, i), invoice_id: id, product_id: it.product_id, description: it._p.name, sku: it._p.sku, quantity: it.quantity, unit_price: it.unit_price, line_total: it.line_total, tax_rate: 11, tax_amount: r2((it.line_total * VAT) / (1 + VAT)), order_item_id: it.id, created_at: issue })
  )
  const pay = (amount, daysAfterIssue, n) => {
    const d = new Date(Math.min(NOW.getTime() - DAY * 0.5, issue.getTime() + daysAfterIssue * DAY))
    T.payments.push({ id: uid('pay', oid, n), invoice_id: id, payment_number: `PAY-${pre}-${hnum(oid + 'pay' + n, 6)}`, payment_date: isoDate(d), payment_amount: amount, payment_method: ['BANK_TRANSFER', 'CHECK', 'BANK_TRANSFER', 'CASH'][h32(oid + 'm') % 4], payment_reference: `REF-${hnum(oid + 'ref', 6)}`, bank_name: 'Bank of Beirut Demo', status: 'COMPLETED', currency: 'USD', notes: null, recorded_by: 'system' })
  }
  if (st === 'PAID') pay(total, 4 + (h32(oid + 'd') % 9), 0)
  if (st === 'PARTIALLY_PAID') pay(r2(total * 0.4), 3, 0)
  if (st === 'OVERDUE_PARTIAL') pay(r2(total * 0.5), 12, 0)
  return id
}

// -----------------------------------------------------------------------------------------
// Chat, notifications, quick lists
// -----------------------------------------------------------------------------------------
async function sectionEngagement(H) {
  const { pool: c, state, uid, bulk, ago, log, r2, isoDate, intBetween, rng } = H
  const pairs = defaultPairs(H)
  for (const [rKey, sKey] of pairs) {
    const R = state.restaurants.get(rKey), S = state.suppliers.get(sKey)
    if (!R || !S) continue
    const rUsers = [...state.users.values()].filter((u) => u.kind === 'restaurant' && u.tenantKey === rKey)
    const sUsers = [...state.users.values()].filter((u) => u.kind === 'supplier' && u.tenantKey === sKey)
    const rUser = rUsers.find((u) => u.roleName === 'Purchaser') || rUsers[0]
    const sUser = sUsers.find((u) => u.roleName === 'Supplier Manager') || sUsers[0]
    const convId = uid('conv', rKey, sKey)
    await bulk(c, 'conversation', [{ id: convId, supplier_id: S.id, restaurant_id: R.id, created_at: ago(30), updated_at: ago(0) }])
    await bulk(c, 'conversation_participant', [
      { id: uid('cp', convId, 'S'), conversation_id: convId, participant_type: 'SUPPLIER', participant_id: S.id, unread_count: 0, role: 'PARTICIPANT', created_at: ago(30), updated_at: ago(0) },
      { id: uid('cp', convId, 'R'), conversation_id: convId, participant_type: 'RESTAURANT', participant_id: R.id, unread_count: 0, role: 'PARTICIPANT', created_at: ago(30), updated_at: ago(0) },
    ])
    const { rows: ords } = await c.query(`SELECT id FROM customer_order WHERE restaurant_id = $1 AND status IN ('PROCESSING','SHIPPED','DELIVERED') ORDER BY placed_at DESC LIMIT 1`, [R.id])
    const msgs = CHAT_SNIPPETS.map(([who, text], i) => {
      const fromR = who === 'restaurant'
      const when = new Date(Date.now() - (CHAT_SNIPPETS.length - i) * 3.1 * 3600000)
      return { id: uid('msg', convId, i), conversation_id: convId, sender_type: fromR ? 'RESTAURANT' : 'SUPPLIER', sender_id: (fromR ? rUser : sUser).id, content: text, message_type: i === 1 && ords[0] ? 'ORDER_REFERENCE' : 'TEXT', order_id: i === 1 ? ords[0]?.id || null : null, is_read: true, read_at: when, created_at: when, updated_at: when }
    })
    msgs.push({ id: uid('msg', convId, 'last'), conversation_id: convId, sender_type: 'RESTAURANT', sender_id: rUser.id, content: 'Can we move tomorrow\'s delivery to 6:30am? We have a wedding brunch.', message_type: 'TEXT', order_id: null, is_read: false, read_at: null, created_at: ago(0.05), updated_at: ago(0.05) })
    const { rowCount } = await c.query('SELECT 1 FROM message WHERE conversation_id = $1 LIMIT 1', [convId])
    if (!rowCount) {
      await bulk(c, 'message', msgs)
      await c.query(`UPDATE conversation_participant SET unread_count = CASE WHEN participant_type = 'SUPPLIER' THEN 1 ELSE 0 END WHERE conversation_id = $1`, [convId])
    }
  }

  // Unread notifications for key demo users
  const notif = (u, type, cat, title, message, refType, refId, hoursAgo) => ({
    id: uid('notif', u.email, title), user_id: u.id, user_type: u.kind.toUpperCase(), notification_type: type, notification_category: cat, title, message,
    email_sent: false, sms_sent: false, push_sent: false, in_app_sent: true, reference_id: refId || null, reference_type: refType || null, is_read: false, metadata: {}, created_at: new Date(Date.now() - hoursAgo * 3600000), whatsapp_sent: false,
  })
  const rows = []
  const { rows: latest } = await c.query(`SELECT o.id, o.status, o.restaurant_id FROM customer_order o JOIN order_item i ON i.order_id = o.id JOIN supplier s ON s.id = i.supplier_id WHERE s.slug = 'cedar-fresh-produce' AND o.status IN ('PLACED','PROCESSING','SHIPPED') GROUP BY o.id ORDER BY max(o.placed_at) DESC LIMIT 3`)
  const lo = latest[0]?.id
  for (const email of ['karim.saab@cedarfresh.demo', 'maya.nassar@cedarfresh.demo', 'layla.haddad@cedarfresh.demo']) {
    const u = state.users.get(email); if (!u) continue
    rows.push(notif(u, 'ORDER', 'order_placed', 'New order from Riviera Beirut Hotel', 'Riviera Beirut Hotel placed a new order worth $412.60.', 'order', lo, 0.6))
    rows.push(notif(u, 'MESSAGE', 'message_received', 'New message from Riviera Beirut Hotel', 'Can we move tomorrow\'s delivery to 6:30am?', 'conversation', uid('conv', 'riviera', 'cedar'), 1.1))
    rows.push(notif(u, 'INVENTORY', 'low_stock', 'Low stock: Lebanese Lemons (kg)', 'Only a few kg left in Beirut Central Market Hub.', 'product', null, 5))
    rows.push(notif(u, 'INVOICE', 'invoice_overdue', 'Invoice overdue', 'An invoice from Riviera Beirut Hotel is 29 days overdue.', 'invoice', null, 9))
    rows.push(notif(u, 'DISPUTE', 'dispute_opened', 'New dispute: short delivery', 'Riviera Beirut Hotel reported a short delivery on a recent order.', 'dispute', null, 20))
    rows.push(notif(u, 'PROMOTION', 'promotion_approved', 'Your promotion is live', 'HORECA Launch: 10% off all produce was approved and is now active.', 'promotion', uid('promo', 'cedar', 'coupon'), 30))
  }
  for (const email of ['rami.haddad@rivierahotels.demo', 'nour.khoury@rivierahotels.demo', 'elie.abboud@rivierahotels.demo', 'george.matar@rivierahotels.demo', 'karl.daou@hamrabistro.demo']) {
    const u = state.users.get(email); if (!u) continue
    rows.push(notif(u, 'ORDER', 'order_shipped', 'Your order is out for delivery', 'Fadi Rizk is on the way with your Cedar Fresh Produce order. Track the driver live.', 'order', lo, 0.4))
    rows.push(notif(u, 'ORDER', 'order_acknowledged', 'Order acknowledged', 'Cedar Fresh Produce confirmed your order for tomorrow morning.', 'order', lo, 2.4))
    rows.push(notif(u, 'INVOICE', 'invoice_issued', 'New invoice from Cedar Fresh Produce', 'A new invoice is ready to review and pay.', 'invoice', null, 7))
    rows.push(notif(u, 'PROMOTION', 'new_deal', 'New deal: 10% off all produce', 'Use code HORECA10 on your next Cedar Fresh Produce order.', 'promotion', uid('promo', 'cedar', 'coupon'), 12))
    rows.push(notif(u, 'MESSAGE', 'message_received', 'New message from Cedar Fresh Produce', 'Perfect. Also, is the sea bass fresh from today?', 'conversation', uid('conv', 'riviera', 'cedar'), 3))
  }
  await bulk(c, 'notification_log', rows).catch((e) => log('  !! notifications:', e.message))
  log(`notifications: ${rows.length} unread`)

  // Quick lists (+ one scheduled order)
  const makeList = async (rKey, sKey, name, desc, freq, scheduled, days, count) => {
    const R = state.restaurants.get(rKey), S = state.suppliers.get(sKey)
    if (!R || !S) return
    const id = uid('qlist', rKey, sKey, name)
    const next = new Date(Date.now() + 86400000)
    await bulk(c, 'quick_list', [{ id, restaurant_id: R.id, supplier_id: S.id, name, description: desc, is_scheduled: scheduled, frequency: scheduled ? freq : null, days_of_week: scheduled ? days : null, preferred_time: scheduled ? '04:30' : null, next_execution_date: scheduled ? isoDate(next) : null, last_execution_date: scheduled ? isoDate(ago(3)) : null, status: 'ACTIVE', auto_create_order: scheduled, created_at: ago(40), updated_at: ago(3), use_ai_quantities: false }]).catch((e) => log('  !! quick_list:', e.message))
    const items = S.products.filter((p) => ['kg', 'bunch'].includes(p.unit)).slice(0, count)
    await bulk(c, 'quick_list_item', items.map((p, i) => ({ id: uid('qli', id, i), quick_list_id: id, product_id: p.id, supplier_id: S.id, quantity: 10 + i * 2, notes: null, created_at: ago(40), updated_at: ago(40) }))).catch((e) => log('  !! quick_list_item:', e.message))
    if (scheduled) {
      await bulk(c, 'quick_list_execution', [3, 7, 10, 14].map((d) => ({ id: uid('qle', id, d), quick_list_id: id, restaurant_id: R.id, execution_date: isoDate(ago(d)), outcome: 'executed', created_at: ago(d) }))).catch((e) => log('  !! quick_list_execution:', e.message))
    }
  }
  await makeList('riviera', 'cedar', 'Weekly Produce Run', 'Standard Monday and Thursday produce order for all kitchens', 'WEEKLY_3X', true, [1, 4], 9)
  await makeList('riviera', 'cedar', 'Herbs & Salad Daily', 'Fresh herbs and leafy greens for the breakfast buffet', 'DAILY', false, null, 6)
  await makeList('hamra', 'cedar', 'Bistro Brunch Prep', 'Weekend brunch essentials', 'WEEKLY', true, [5], 7)
  log('quick lists seeded')
}

/** --pairs=r:s,... overrides; default is every relation plus the reorder-risk customers. */
function defaultPairs(H) {
  const given = argVal('pairs')
  if (given) return given.split(',').map((p) => p.split(':'))
  const out = []
  for (const [r, ss] of Object.entries(H.RELATIONS)) for (const s of Object.keys(ss)) out.push([r, s])
  for (const p of AT_RISK_PAIRS) out.push(p.split(':'))
  return out
}
