/**
 * Seed subscription billing: payment methods, invoices, overdue/grace scenarios.
 * Requires migration 0067_subscription_billing.sql.
 *
 * Run: pnpm run seed:billing
 * (after db:migrate and demo / plan-tier tenants exist)
 */
import 'dotenv/config'
import { pool, query } from '../src/lib/db.js'
import { isMainModule } from './lib/is-main.mjs'
import {
  DEMO_RESTAURANT_ID,
  DEMO_SUPPLIER_ID,
  DEMO_RESTAURANT_EMAIL,
  DEMO_SUPPLIER_EMAIL,
} from './seed-demo-tenants.js'

const PM_RESTAURANT = 'a10e8400-e29b-41d4-a716-446655440001'
const PM_SUPPLIER = 'a10e8400-e29b-41d4-a716-446655440002'

async function tableExists(name) {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  )
  return rows.length > 0
}

async function getSubscription(client, tenantId, tenantType) {
  const { rows } = await client.query(
    `SELECT s.id, s.plan_id, s.billing_cycle, sp.code AS plan_code, sp.price_per_month, sp.price_per_year
     FROM subscription s
     LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
     WHERE s.tenant_id = $1 AND s.tenant_type = $2
     ORDER BY s.created_at DESC LIMIT 1`,
    [tenantId, tenantType]
  )
  return rows[0] || null
}

async function clearTenantBilling(client, tenantId, tenantType) {
  await client.query(`DELETE FROM billing_payment WHERE tenant_id = $1 AND tenant_type = $2`, [
    tenantId,
    tenantType,
  ])
  await client.query(`DELETE FROM billing_invoice WHERE tenant_id = $1 AND tenant_type = $2`, [
    tenantId,
    tenantType,
  ])
  await client.query(`DELETE FROM billing_event WHERE tenant_id = $1 AND tenant_type = $2`, [
    tenantId,
    tenantType,
  ])
  await client.query(
    `DELETE FROM billing_payment_method WHERE tenant_id = $1 AND tenant_type = $2`,
    [tenantId, tenantType]
  )
}

async function upsertPaymentMethod(
  client,
  { id, tenantId, tenantType, last4 = '4242', brand = 'visa', isDefault = true }
) {
  await client.query(
    `INSERT INTO billing_payment_method (
      id, tenant_id, tenant_type, provider, provider_customer_id, provider_payment_method_id,
      type, brand, last4, exp_month, exp_year, is_default, status
    ) VALUES ($1, $2, $3, 'stub', $4, $5, 'CARD', $6, $7, 12, 2030, $8, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET
      is_default = EXCLUDED.is_default,
      status = 'ACTIVE',
      updated_at = now()`,
    [
      id,
      tenantId,
      tenantType,
      `cus_seed_${tenantType.toLowerCase()}`,
      `pm_seed_${id.replace(/-/g, '')}`,
      brand,
      last4,
      isDefault,
    ]
  )
  return id
}

function planAmount(sub, cycle = 'MONTHLY') {
  if (!sub || (sub.plan_code || '').toLowerCase() === 'free') return 0
  if (cycle === 'YEARLY') {
    return Number(sub.price_per_year) || Number(sub.price_per_month) * 12
  }
  return Number(sub.price_per_month) || 0
}

async function seedActiveBilling(client, { tenantId, tenantType, email, paymentMethodId }) {
  const sub = await getSubscription(client, tenantId, tenantType)
  if (!sub) {
    console.warn(`  ⚠ No subscription for ${tenantType} ${tenantId} — skip billing`)
    return
  }
  if ((sub.plan_code || '').toLowerCase() === 'free') {
    await client.query(
      `UPDATE subscription SET
        auto_renew = false,
        billing_email = $2,
        next_billing_date = NULL,
        past_due_since = NULL,
        grace_period_ends_at = NULL,
        account_locked_at = NULL,
        lock_reason = NULL,
        updated_at = now()
       WHERE id = $1`,
      [sub.id, email]
    )
    return
  }

  const cycle = sub.billing_cycle || 'MONTHLY'
  const amount = planAmount(sub, cycle)
  const pmId = await upsertPaymentMethod(client, {
    id: paymentMethodId,
    tenantId,
    tenantType,
  })

  const periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + (cycle === 'YEARLY' ? 365 : 30))

  await client.query(
    `UPDATE subscription SET
      status = 'ACTIVE',
      auto_renew = true,
      billing_email = $2,
      default_payment_method_id = $3,
      next_billing_date = $4,
      current_period_end = $4,
      last_payment_at = now() - interval '2 days',
      last_payment_failed_at = NULL,
      past_due_since = NULL,
      grace_period_ends_at = NULL,
      account_locked_at = NULL,
      lock_reason = NULL,
      updated_at = now()
     WHERE id = $1`,
    [sub.id, email, pmId, periodEnd]
  )

  const invNum = `SUB-SEED-${tenantType.slice(0, 3)}-${tenantId.slice(0, 8)}`
  await client.query(
    `INSERT INTO billing_invoice (
      id, subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
      billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, paid_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, 'USD', $6, $7,
      (SELECT name FROM subscription_plan WHERE id = $7),
      'PAID', now() - interval '1 month', now(), now() - interval '1 month', now() - interval '28 days'
    )
    ON CONFLICT (invoice_number) DO NOTHING`,
    [sub.id, tenantId, tenantType, invNum, amount, cycle, sub.plan_id]
  )

  await client.query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, 'seed.active', '{"source":"seed-billing"}'::jsonb)`,
    [sub.id, tenantId, tenantType]
  )
}

async function seedPastDueGrace(
  client,
  { tenantId, tenantType, email, paymentMethodId, daysLeft = 5 }
) {
  const sub = await getSubscription(client, tenantId, tenantType)
  if (!sub || planAmount(sub) <= 0) return

  const pmId = await upsertPaymentMethod(client, {
    id: paymentMethodId,
    tenantId,
    tenantType,
    last4: '0001',
  })

  const graceEnd = new Date()
  graceEnd.setDate(graceEnd.getDate() + daysLeft)
  const pastDueSince = new Date()
  pastDueSince.setDate(pastDueSince.getDate() - (7 - daysLeft))

  const amount = planAmount(sub, sub.billing_cycle || 'MONTHLY')
  const invNum = `SUB-SEED-OVERDUE-${tenantType}-${tenantId.slice(0, 8)}`

  await client.query(
    `UPDATE subscription SET
      status = 'PAST_DUE',
      auto_renew = true,
      billing_email = $2,
      default_payment_method_id = $3,
      past_due_since = $4,
      grace_period_ends_at = $5,
      account_locked_at = NULL,
      lock_reason = NULL,
      last_payment_failed_at = now() - interval '1 day',
      updated_at = now()
     WHERE id = $1`,
    [sub.id, email, pmId, pastDueSince, graceEnd]
  )

  await client.query(
    `INSERT INTO billing_invoice (
      subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
      billing_cycle, plan_id, plan_name, status, due_date
    ) VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7,
      (SELECT name FROM subscription_plan WHERE id = $7),
      'OPEN', now() - interval '3 days')
    ON CONFLICT (invoice_number) DO UPDATE SET status = 'OPEN', amount = EXCLUDED.amount`,
    [sub.id, tenantId, tenantType, invNum, amount, sub.billing_cycle || 'MONTHLY', sub.plan_id]
  )

  await client.query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, 'seed.past_due_grace', $4::jsonb)`,
    [sub.id, tenantId, tenantType, JSON.stringify({ daysLeft, scenario: 'grace' })]
  )
}

async function seedLockedAccount(client, { tenantId, tenantType, email, paymentMethodId }) {
  const sub = await getSubscription(client, tenantId, tenantType)
  if (!sub || planAmount(sub) <= 0) return

  const pmId = await upsertPaymentMethod(client, {
    id: paymentMethodId,
    tenantId,
    tenantType,
    last4: '9999',
  })

  const graceEnd = new Date()
  graceEnd.setDate(graceEnd.getDate() - 1)
  const amount = planAmount(sub, sub.billing_cycle || 'MONTHLY')
  const invNum = `SUB-SEED-LOCKED-${tenantType}-${tenantId.slice(0, 8)}`

  await client.query(
    `UPDATE subscription SET
      status = 'SUSPENDED',
      auto_renew = true,
      billing_email = $2,
      default_payment_method_id = $3,
      past_due_since = now() - interval '10 days',
      grace_period_ends_at = $4,
      account_locked_at = now() - interval '1 day',
      lock_reason = 'payment_overdue_grace_expired',
      updated_at = now()
     WHERE id = $1`,
    [sub.id, email, pmId, graceEnd]
  )

  await client.query(
    `INSERT INTO billing_invoice (
      subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
      billing_cycle, plan_id, status, due_date
    ) VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, 'OPEN', now() - interval '10 days')
    ON CONFLICT (invoice_number) DO UPDATE SET status = 'OPEN'`,
    [sub.id, tenantId, tenantType, invNum, amount, sub.billing_cycle || 'MONTHLY', sub.plan_id]
  )
}

async function resolveTenantBySlug(client, slug, table) {
  const { rows } = await client.query(`SELECT id, contact_email FROM ${table} WHERE slug = $1`, [
    slug,
  ])
  return rows[0] || null
}

export async function seedBilling() {
  if (!(await tableExists('billing_payment_method'))) {
    throw new Error('billing_payment_method missing — run: pnpm run db:migrate')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('💳 Seeding billing (demo tenants — active)...')
    await clearTenantBilling(client, DEMO_RESTAURANT_ID, 'RESTAURANT')
    await clearTenantBilling(client, DEMO_SUPPLIER_ID, 'SUPPLIER')
    await seedActiveBilling(client, {
      tenantId: DEMO_RESTAURANT_ID,
      tenantType: 'RESTAURANT',
      email: DEMO_RESTAURANT_EMAIL,
      paymentMethodId: PM_RESTAURANT,
    })
    await seedActiveBilling(client, {
      tenantId: DEMO_SUPPLIER_ID,
      tenantType: 'SUPPLIER',
      email: DEMO_SUPPLIER_EMAIL,
      paymentMethodId: PM_SUPPLIER,
    })

    const goldRestaurant = await resolveTenantBySlug(
      client,
      'plan-demo-restaurant-gold',
      'restaurant'
    )
    if (goldRestaurant) {
      console.log('💳 plan-demo-restaurant-gold — past due (grace period)...')
      const pmId = 'a10e8400-e29b-41d4-a716-446655440003'
      await clearTenantBilling(client, goldRestaurant.id, 'RESTAURANT')
      await seedPastDueGrace(client, {
        tenantId: goldRestaurant.id,
        tenantType: 'RESTAURANT',
        email: goldRestaurant.contact_email,
        paymentMethodId: pmId,
        daysLeft: 5,
      })
    }

    const silverSupplier = await resolveTenantBySlug(
      client,
      'plan-demo-supplier-silver',
      'supplier'
    )
    if (silverSupplier) {
      console.log('💳 plan-demo-supplier-silver — locked (overdue)...')
      const pmId = 'a10e8400-e29b-41d4-a716-446655440004'
      await clearTenantBilling(client, silverSupplier.id, 'SUPPLIER')
      await seedLockedAccount(client, {
        tenantId: silverSupplier.id,
        tenantType: 'SUPPLIER',
        email: silverSupplier.contact_email,
        paymentMethodId: pmId,
      })
    }

    await client.query('COMMIT')
    console.log('✅ Billing seed complete')
    console.log('   • restaurant@supplify.com — Gold, card •••• 4242, active')
    console.log('   • supplier@supplify.com — Gold, card •••• 4242, active')
    if (goldRestaurant) {
      console.log('   • restaurant-gold@supplify.com — past due, 5 days until lock')
    }
    if (silverSupplier) {
      console.log('   • supplier-silver@supplify.com — account locked (test pay / admin unlock)')
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

async function main() {
  await seedBilling()
}

if (isMainModule(import.meta.url)) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => pool.end())
}
