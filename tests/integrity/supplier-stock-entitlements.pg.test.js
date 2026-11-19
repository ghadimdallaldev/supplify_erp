import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', CRONS_ENABLED: false, EMAIL_ENABLED: false },
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: vi.fn(async () => null),
  setCache: vi.fn(async () => {}),
  deleteCache: vi.fn(async () => {}),
  deleteCacheByPrefix: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const target = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (target.hostname !== '127.0.0.1' || target.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated stock entitlement target')
  const pool = new Pool({ connectionString: target.href, max: 1, connectionTimeoutMillis: 2000 })
  const query = (sql, params) => pool.query(sql, params)
  const withTransaction = async (callback) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return { pool, query, withTransaction }
})

import { pool, withTransaction } from '../../apps/api/src/lib/db.js'
import { getCache, setCache } from '../../apps/api/src/lib/cache.js'
import { isFeatureEnabled } from '../../apps/api/src/lib/subscription.js'
import { getTenantSubscription } from '../../apps/api/src/lib/subscription/plans.js'
import { supplierUsesWarehouseInventory } from '../../apps/api/src/services/supplier-stock.service.js'

afterAll(() => pool.end())
beforeEach(() => vi.clearAllMocks())

async function fixture({ subscribed = true } = {}) {
  const ids = { supplier: randomUUID(), warehouse: randomUUID(), plan: randomUUID() }
  await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.supplier,
  ])
  await pool.query(
    `INSERT INTO warehouse(id,supplier_id,tenant_id,name,is_active)
     VALUES($1::uuid,$2,$2,$1::text,true)`,
    [ids.warehouse, ids.supplier]
  )
  await pool.query(
    `INSERT INTO subscription_plan(id,name,code,tenant_type,type,features)
     VALUES($1::uuid,$1::text,$1::text,'SUPPLIER','supplier_only',$2::jsonb)`,
    [
      ids.plan,
      JSON.stringify({ warehouses: true, multi_warehouse: false, audit_stock_feature: true }),
    ]
  )
  if (subscribed) {
    await pool.query(
      `INSERT INTO subscription(tenant_id,tenant_type,plan_id,plan_name,status,billing_cycle)
       VALUES($1,'SUPPLIER',$2,'Audit stock plan','ACTIVE','MONTHLY')`,
      [ids.supplier, ids.plan]
    )
  }
  return ids
}

async function setOverride(tenantId, featureKey, enabled) {
  await pool.query(
    `INSERT INTO feature_flag_override(tenant_id,tenant_type,feature_key,is_enabled)
     VALUES($1,'SUPPLIER',$2,$3)
     ON CONFLICT(tenant_id,tenant_type,feature_key) DO UPDATE SET is_enabled = excluded.is_enabled`,
    [tenantId, featureKey, enabled]
  )
}

describe('transactional supplier stock entitlements with one PostgreSQL connection', () => {
  it('reads real subscriptions and tenant overrides without acquiring another connection', async () => {
    const ids = await fixture()
    await setOverride(ids.supplier, 'warehouses', true)
    await setOverride(ids.supplier, 'multi_warehouse', false)
    await expect(
      withTransaction((client) => supplierUsesWarehouseInventory(ids.supplier, { client }))
    ).resolves.toBe(true)
    expect(getCache).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
  })

  it('observes an override inside a transaction and restores it after rollback', async () => {
    const ids = await fixture()
    await setOverride(ids.supplier, 'warehouses', true)
    await setOverride(ids.supplier, 'multi_warehouse', false)
    const rollback = new Error('audit rollback')
    await expect(
      withTransaction(async (client) => {
        await client.query(
          `UPDATE feature_flag_override SET is_enabled=false
         WHERE tenant_id=$1 AND feature_key='warehouses'`,
          [ids.supplier]
        )
        expect(await supplierUsesWarehouseInventory(ids.supplier, { client })).toBe(false)
        throw rollback
      })
    ).rejects.toBe(rollback)
    await expect(
      withTransaction((client) => supplierUsesWarehouseInventory(ids.supplier, { client }))
    ).resolves.toBe(true)
    expect(setCache).not.toHaveBeenCalled()
  })

  it('resolves a free trial target through the transaction connection', async () => {
    const ids = await fixture()
    await pool.query(
      `UPDATE subscription SET plan_id=(SELECT id FROM subscription_plan
         WHERE code='free' AND tenant_type='SUPPLIER' LIMIT 1), trial_target_plan_id=$2
       WHERE tenant_id=$1`,
      [ids.supplier, ids.plan]
    )
    await expect(
      withTransaction((client) =>
        isFeatureEnabled(ids.supplier, 'SUPPLIER', 'audit_stock_feature', {
          dbQuery: (sql, params) => client.query(sql, params),
        })
      )
    ).resolves.toBe(true)
    expect(getCache).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
  })

  it('creates a missing compatibility subscription on the same connection and rolls it back', async () => {
    const ids = await fixture({ subscribed: false })
    const rollback = new Error('audit subscription rollback')
    await expect(
      withTransaction(async (client) => {
        const subscription = await getTenantSubscription(ids.supplier, 'SUPPLIER', {
          dbQuery: (sql, params) => client.query(sql, params),
        })
        expect(subscription?.tenant_id).toBe(ids.supplier)
        expect(subscription?.lock_reason).toBe('pending_activation')
        throw rollback
      })
    ).rejects.toBe(rollback)
    expect(
      (await pool.query('SELECT id FROM subscription WHERE tenant_id=$1', [ids.supplier])).rows
    ).toHaveLength(0)
    expect(setCache).not.toHaveBeenCalled()
  })

  it('creates one compatibility subscription when two scoped readers overlap', async () => {
    const ids = await fixture({ subscribed: false })
    await withTransaction(async (client) => {
      const options = { dbQuery: (sql, params) => client.query(sql, params) }
      const subscriptions = await Promise.all([
        getTenantSubscription(ids.supplier, 'SUPPLIER', options),
        getTenantSubscription(ids.supplier, 'SUPPLIER', options),
      ])
      expect(subscriptions.every((subscription) => subscription?.tenant_id === ids.supplier)).toBe(
        true
      )
      expect(new Set(subscriptions.map((subscription) => subscription.id)).size).toBe(1)
    })
    expect(
      (await pool.query('SELECT id FROM subscription WHERE tenant_id=$1', [ids.supplier])).rows
    ).toHaveLength(1)
    expect(setCache).not.toHaveBeenCalled()
  })

  it('uses the main branch subscription and overrides for warehouse stock', async () => {
    const ids = await fixture()
    const organization = randomUUID(),
      branch = randomUUID()
    await pool.query('INSERT INTO supplier_organizations(id,name) VALUES($1::uuid,$1::text)', [
      organization,
    ])
    await pool.query('UPDATE supplier SET organization_id=$2,is_main_branch=true WHERE id=$1', [
      ids.supplier,
      organization,
    ])
    await pool.query(
      `INSERT INTO supplier(id,name,slug,organization_id,is_main_branch)
       VALUES($1::uuid,$1::text,$1::text,$2,false)`,
      [branch, organization]
    )
    await pool.query(
      `INSERT INTO warehouse(id,supplier_id,tenant_id,name,is_active)
       VALUES($1::uuid,$2,$2,$1::text,true)`,
      [randomUUID(), branch]
    )
    await setOverride(ids.supplier, 'warehouses', true)
    await setOverride(ids.supplier, 'multi_warehouse', false)
    await expect(
      withTransaction((client) => supplierUsesWarehouseInventory(branch, { client }))
    ).resolves.toBe(true)
    expect(getCache).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
  })
})
