/**
 * Backfill audit_logs for demo/seed data that was inserted without writeAuditLog().
 */

export async function backfillTenantAuditLogs(client, { tenantId, tenantType, actorUserId }) {
  if (!tenantId || !actorUserId) return { inserted: 0 }

  let inserted = 0

  if (tenantType === 'RESTAURANT') {
    const { rows: orders } = await client.query(
      `SELECT id, total_amount, placed_at, created_at
       FROM customer_order
       WHERE restaurant_id = $1
       ORDER BY COALESCE(placed_at, created_at) DESC
       LIMIT 60`,
      [tenantId]
    )
    for (const order of orders) {
      const { rows: exists } = await client.query(
        `SELECT 1 FROM audit_logs
         WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'
           AND action_type = 'order.created' AND target_id = $2
         LIMIT 1`,
        [tenantId, order.id]
      )
      if (exists.length) continue
      const at = order.placed_at || order.created_at
      await client.query(
        `INSERT INTO audit_logs (
           action_type, actor_user_id, tenant_type, tenant_id, target_id, payload_json, created_at
         ) VALUES ('order.created', $1, 'RESTAURANT', $2, $3, $4, $5)`,
        [
          actorUserId,
          tenantId,
          order.id,
          JSON.stringify({
            resource_type: 'order',
            total_amount: order.total_amount,
            source: 'seed_backfill',
          }),
          at,
        ]
      )
      inserted += 1
    }
  }

  if (tenantType === 'SUPPLIER') {
    const { rows: products } = await client.query(
      `SELECT id, sku, created_at FROM product WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [tenantId]
    )
    for (const product of products) {
      const { rows: exists } = await client.query(
        `SELECT 1 FROM audit_logs
         WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
           AND action_type = 'product.created' AND target_id = $2
         LIMIT 1`,
        [tenantId, product.id]
      )
      if (exists.length) continue
      await client.query(
        `INSERT INTO audit_logs (
           action_type, actor_user_id, tenant_type, tenant_id, target_id, payload_json, created_at
         ) VALUES ('product.created', $1, 'SUPPLIER', $2, $3, $4, $5)`,
        [
          actorUserId,
          tenantId,
          product.id,
          JSON.stringify({ resource_type: 'product', sku: product.sku, source: 'seed_backfill' }),
          product.created_at,
        ]
      )
      inserted += 1
    }
  }

  return { inserted }
}

/** Backfill all tier-catalog slugs (and any restaurant/supplier with orders/products). */
export async function backfillAllCommercialAuditLogs(client) {
  const { rows: restaurants } = await client.query(
    `SELECT r.id, r.slug, (
       SELECT u.id FROM app_user u
       WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(r.contact_email))
       LIMIT 1
     ) AS owner_id
     FROM restaurant r`
  )
  const { rows: suppliers } = await client.query(
    `SELECT s.id, s.slug, (
       SELECT u.id FROM app_user u
       WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(s.contact_email))
       LIMIT 1
     ) AS owner_id
     FROM supplier s`
  )

  let total = 0
  for (const r of restaurants) {
    if (!r.owner_id) continue
    const { inserted } = await backfillTenantAuditLogs(client, {
      tenantId: r.id,
      tenantType: 'RESTAURANT',
      actorUserId: r.owner_id,
    })
    if (inserted) console.log(`   audit: ${r.slug} restaurant +${inserted}`)
    total += inserted
  }
  for (const s of suppliers) {
    if (!s.owner_id) continue
    const { inserted } = await backfillTenantAuditLogs(client, {
      tenantId: s.id,
      tenantType: 'SUPPLIER',
      actorUserId: s.owner_id,
    })
    if (inserted) console.log(`   audit: ${s.slug} supplier +${inserted}`)
    total += inserted
  }
  return total
}
