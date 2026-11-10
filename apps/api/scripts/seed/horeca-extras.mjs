/**
 * Extras for seed-horeca-demo.mjs: AR statements, restaurant inventory with expiring lots,
 * audit/admin activity, and a near-limit free-plan tenant.
 */
export async function sectionExtras(H) {
  const { pool: c, state, uid, bulk, ago, log, isoDate } = H

  const { rowCount } = await c
    .query(
      `
    INSERT INTO account_statement (id, supplier_id, restaurant_id, statement_date, statement_period_start, statement_period_end,
      previous_balance, charges, payments, adjustments, ending_balance, current, days_30, days_60, days_90, days_90_plus, currency, notes)
    SELECT md5('stmt|' || x.sid || '|' || x.rid)::uuid, x.sid, x.rid, CURRENT_DATE, CURRENT_DATE - 30, CURRENT_DATE,
      GREATEST(0, x.ending - x.charges + x.pays), x.charges, x.pays, 0, x.ending, x.cur, x.d30, x.d60, x.d90, x.d90p, 'USD', 'HORECA-DEMO statement'
    FROM (
      SELECT i.supplier_id sid, i.restaurant_id rid,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT')), 0) ending,
        COALESCE(SUM(i.total_amount) FILTER (WHERE i.issue_date >= CURRENT_DATE - 30 AND i.status <> 'VOID'), 0) charges,
        COALESCE((SELECT SUM(p.payment_amount) FROM payment p JOIN invoice i2 ON i2.id = p.invoice_id
                  WHERE i2.supplier_id = i.supplier_id AND i2.restaurant_id = i.restaurant_id
                    AND p.payment_date >= CURRENT_DATE - 30 AND p.status = 'COMPLETED'), 0) pays,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT') AND i.due_date >= CURRENT_DATE), 0) cur,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT') AND i.due_date < CURRENT_DATE AND i.due_date >= CURRENT_DATE - 30), 0) d30,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT') AND i.due_date < CURRENT_DATE - 30 AND i.due_date >= CURRENT_DATE - 60), 0) d60,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT') AND i.due_date < CURRENT_DATE - 60 AND i.due_date >= CURRENT_DATE - 90), 0) d90,
        COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('VOID','DRAFT') AND i.due_date < CURRENT_DATE - 90), 0) d90p
      FROM invoice i WHERE i.notes LIKE '%HORECA-DEMO%' GROUP BY i.supplier_id, i.restaurant_id
    ) x ON CONFLICT DO NOTHING`
    )
    .catch((e) => (log('  !! statements:', e.message), { rowCount: 0 }))
  log('account statements:', rowCount)

  for (const rKey of ['riviera', 'hamra']) {
    const R = state.restaurants.get(rKey)
    if (!R) continue
    await bulk(c, 'restaurant_inventory_settings', [
      { restaurant_id: R.id, expiring_soon_days: 3, created_at: ago(60), updated_at: ago(60) },
    ]).catch(() => {})
    const picks = []
    for (const sKey of ['cedar', 'bekaa', 'phoenicia', 'meats']) {
      const S = state.suppliers.get(sKey)
      if (S?.products.length) {
        picks.push(...S.products.filter((_, i) => i % 6 === 1).slice(0, 4).map((p) => ({ p, S })))
      }
    }
    const inv = []
    const lots = []
    picks.forEach(({ p, S }, i) => {
      const expiryDays = [-1, 1, 2, 4, 6, 9, 12, 18][i % 8]
      const qty = 6 + ((i * 7) % 25)
      const loc = ['Walk-in cooler', 'Dry store', 'Freezer 2', 'Bar fridge'][i % 4]
      inv.push({
        id: uid('rinv', R.id, p.id), restaurant_id: R.id, product_id: p.id, quantity: qty, min_stock_threshold: 5,
        max_stock_level: 60, last_restocked_at: ago(2 + (i % 6)), expiry_date: ago(-expiryDays), storage_location: loc,
        low_stock_threshold: 8, created_at: ago(40), updated_at: ago(1),
      })
      lots.push({
        id: uid('rlot', R.id, p.id), restaurant_id: R.id, product_id: p.id, supplier_id: S.id, item_name: p.name,
        product_sku: p.sku, quantity: qty, unit: p.unit, batch_lot_number: `LOT-${2600 + i}`,
        received_date: isoDate(ago(2 + (i % 6))), expiry_date: isoDate(ago(-expiryDays)), storage_location: loc,
        is_archived: false, created_at: ago(2), updated_at: ago(1),
      })
    })
    await bulk(c, 'restaurant_inventory', inv, { conflict: 'ON CONFLICT (restaurant_id, product_id) DO NOTHING' }).catch((e) =>
      log('  !! restaurant_inventory:', e.message)
    )
    await bulk(c, 'restaurant_inventory_lot', lots).catch((e) => log('  !! restaurant_inventory_lot:', e.message))
  }
  log('restaurant inventory and expiring lots seeded')

  // Main branch rows for the B2C shops (required by the consumer menu seeder)
  for (const rKey of ['hamra', 'zaatar']) {
    const R = state.restaurants.get(rKey)
    if (!R) continue
    const d = R.def
    await bulk(c, 'branch', [{ id: uid('branch', rKey), restaurant_id: R.id, tenant_id: R.id, name: 'Main Branch', code: 'MAIN', phone: d.phone, address_json: { street: d.area, city: d.city, country: 'Lebanon' }, is_active: true, delivery_latitude: d.lat, delivery_longitude: d.lng, delivery_location_label: d.name, created_at: ago(90), updated_at: ago(90) }]).catch((e) => log('  !! branch:', e.message))
  }

  const admin = state.admin
  const cedar = state.suppliers.get('cedar')
  const riviera = state.restaurants.get('riviera')
  const actions = [
    ['ORDER_PLACED', 'RESTAURANT', riviera?.id], ['ORDER_ACKNOWLEDGED', 'SUPPLIER', cedar?.id],
    ['INVOICE_ISSUED', 'SUPPLIER', cedar?.id], ['PAYMENT_RECORDED', 'SUPPLIER', cedar?.id],
    ['DISPUTE_OPENED', 'RESTAURANT', riviera?.id], ['CREDIT_NOTE_ISSUED', 'SUPPLIER', cedar?.id],
    ['PRODUCT_PRICE_UPDATED', 'SUPPLIER', cedar?.id], ['STAFF_ROLE_CHANGED', 'RESTAURANT', riviera?.id],
    ['PROMOTION_CREATED', 'SUPPLIER', cedar?.id], ['DRIVER_ASSIGNED', 'SUPPLIER', cedar?.id],
    ['ORDER_RECEIVED', 'RESTAURANT', riviera?.id], ['QUICK_LIST_EXECUTED', 'RESTAURANT', riviera?.id],
  ]
  const au = []
  for (let i = 0; i < 36; i++) {
    const [a, t, tid] = actions[i % actions.length]
    const email = t === 'SUPPLIER' ? 'karim.saab@cedarfresh.demo' : 'rami.haddad@rivierahotels.demo'
    au.push({
      id: uid('audit', i), action_type: a, actor_user_id: state.users.get(email)?.id, actor_admin_role: null,
      tenant_type: t, tenant_id: tid, target_id: null, payload_json: { source: 'web', note: 'HORECA demo activity' },
      request_id: uid('req', i), created_at: ago(i * 1.9 + 0.2),
    })
  }
  await bulk(c, 'audit_logs', au).catch((e) => log('  !! audit_logs:', e.message))
  const adminActs = [
    ['TENANT_APPROVED', 'Approved new supplier account Coastline Packaging & Hygiene'],
    ['PLAN_CHANGED', 'Upgraded Riviera Hotels Group to Restaurant Scale'],
    ['PROMOTION_APPROVED', 'Approved HORECA Launch deal for Cedar Fresh Produce'],
    ['FEATURE_FLAG_UPDATED', 'Enabled order amendments for Cedar Fresh Produce'],
    ['USER_SUPPORT_ACTION', 'Reset session for a Hamra Bistro user'],
    ['IMPERSONATION_STARTED', 'Support session opened for Riviera Beirut Hotel'],
  ]
  const adm = []
  for (let i = 0; i < 24; i++) {
    const [a, d] = adminActs[i % adminActs.length]
    adm.push({
      id: uid('adminaudit', i), admin_user_id: admin.id, admin_name: 'Layal Mrad', action_type: a, action_description: d,
      target_tenant_id: (i % 2 ? cedar : riviera)?.id, target_tenant_type: i % 2 ? 'SUPPLIER' : 'RESTAURANT',
      target_entity_type: 'tenant', target_entity_id: null, old_value: null, new_value: null, metadata: { demo: true },
      ip_address: `185.47.12.${10 + i}`, user_agent: 'Mozilla/5.0', created_at: ago(i * 2.3 + 0.4), request_id: uid('areq', i),
    })
  }
  await bulk(c, 'admin_audit_log', adm).catch((e) => log('  !! admin_audit_log:', e.message))
  const ev = ['order.placed', 'invoice.overdue', 'subscription.renewed', 'driver.tracking.started', 'promotion.approved', 'inventory.low_stock'].map(
    (t, i) => ({ id: uid('sysevt', i), type: t, severity: i === 1 ? 'warn' : 'info', source: 'api', payload: { demo: true }, created_at: ago(i * 0.7) })
  )
  await bulk(c, 'system_event', ev).catch((e) => log('  !! system_event:', e.message))
  log('audit logs: 36 tenant, 24 admin, 6 system events')

  const coast = state.suppliers.get('coastline')
  if (coast) {
    const names = ['Imad Haddad', 'Samer Nader', 'Khaled Yaacoub']
    await bulk(c, 'drivers', names.map((n, i) => ({
      id: uid('driver-coast', i), supplier_id: coast.id, warehouse_id: coast.warehouses[0].id, full_name: n,
      phone: `+961 70 55${1200 + i}`, vehicle_type: 'Van', vehicle_plate: `B 99${100 + i}`, notes: 'Demo driver (no login)',
      is_active: true, user_id: null, created_at: ago(30), updated_at: ago(30),
    }))).catch((e) => log('  !! coast drivers:', e.message))
    const titles = ['Takeaway cups bundle', 'Pizza box clearance', 'Cleaning kit deal', 'Foil & film pack', 'Napkin bulk offer', 'Gloves 3-for-2', 'Burger box special', 'Eco cutlery week']
    const promos = titles.map((name, i) => ({
      id: uid('promo-coast', i), supplier_id: coast.id, name, description: 'Free-plan demo deal', type: 'percentage_discount',
      discount_value: 5 + i, min_order_amount: 50, applies_to: 'all', status: i < 3 ? 'active' : 'draft', starts_at: ago(-i),
      ends_at: ago(-30), usage_limit: null, usage_count: 0, is_featured: false, requires_admin_approval: true,
      payment_status: 'not_required', created_at: ago(10), updated_at: ago(10),
      approved_by_admin_id: i < 3 ? admin.id : null, approved_at: i < 3 ? ago(9) : null, submitted_at: ago(10),
    }))
    await bulk(c, 'promotions', promos).catch((e) => log('  !! coast promos:', e.message))
    log('near-limit tenant: Coastline Packaging (free plan) at 4/5 drivers and 8/10 promotions')
  }
}
