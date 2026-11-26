import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Plan branch capacity is covered by its own tests; these tests exercise the re-key only.
vi.mock('../../../apps/api/src/lib/org-branch-capacity.js', () => ({
  lockOrgBranchCapacity: async () => {},
}))

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  createOrder,
  createOrglessSupplier,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

const migrationsDir = fileURLToPath(new URL('../../../apps/api/db/migrations/', import.meta.url))
const migrationFile = readdirSync(migrationsDir).find((f) =>
  /^\d{4}_org_level_relationships\.sql$/.test(f)
)

let db
let api
let rel
let migrator
let orgLib

async function applyRelationshipMigration() {
  if (!migrationFile) throw new Error('org_level_relationships migration missing')
  const sql = readFileSync(migrationsDir + migrationFile, 'utf8')
  for (const statement of migrator.splitMigrationStatements(sql)) {
    await db.pool.query(statement)
  }
}

/** Put the relationship tables back into their pre-migration (legacy) shape. */
async function makeLegacyShape() {
  await db.pool.query(`
    ALTER TABLE supplier ALTER COLUMN organization_id DROP NOT NULL;
    ALTER TABLE supplier DISABLE TRIGGER supplier_ensure_organization;
    ALTER TABLE supplier_follow DISABLE TRIGGER supplier_follow_fill_org;
    ALTER TABLE supplier_blocklist DISABLE TRIGGER supplier_blocklist_fill_org;
    ALTER TABLE supplier_follow ALTER COLUMN supplier_org_id DROP NOT NULL;
    ALTER TABLE supplier_blocklist ALTER COLUMN supplier_org_id DROP NOT NULL;
    DROP INDEX IF EXISTS uq_supplier_follow_restaurant_org;
    DROP INDEX IF EXISTS uq_supplier_blocklist_restaurant_org;
  `)
}

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  rel = await import('../../../apps/api/src/lib/relationship.js')
  migrator = await import('../../../apps/api/src/lib/sql-migrator.js')
  orgLib = await import('../../../apps/api/src/lib/supplier-org.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

describe('organisation-level relationship migration', () => {
  it('migration creates organisations for orgless suppliers and makes organization_id NOT NULL', async () => {
    const { rows: col } = await db.pool.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'supplier' AND column_name = 'organization_id'`
    )
    expect(col[0].is_nullable).toBe('NO')

    // New writers that omit the organisation still get one (seeds, admin create, e2e).
    const legacy = await createOrglessSupplier(db.pool)
    const { rows } = await db.pool.query(
      `SELECT s.organization_id, s.is_main_branch, o.name
       FROM supplier s JOIN supplier_organizations o ON o.id = s.organization_id WHERE s.id = $1`,
      [legacy.id]
    )
    expect(rows[0].organization_id).toBeTruthy()
    expect(rows[0].is_main_branch).toBe(true)
    expect(rows[0].name).toBe(legacy.name)

    // Existing orgless rows are converted when the migration runs.
    await makeLegacyShape()
    try {
      const { rows: inserted } = await db.pool.query(
        `INSERT INTO supplier (name, slug, is_main_branch) VALUES ('Orgless', 'orgless-x', false)
         RETURNING id`
      )
      await applyRelationshipMigration()
      const { rows: after } = await db.pool.query(
        `SELECT organization_id, is_main_branch FROM supplier WHERE id = $1`,
        [inserted[0].id]
      )
      expect(after[0].organization_id).toBeTruthy()
      expect(after[0].is_main_branch).toBe(true)
    } finally {
      await applyRelationshipMigration()
    }
  })

  it('migration merges duplicate org follows and drops follows that have a block', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const other = await createSupplierOrg(db.pool)
    const r1 = await createRestaurant(db.pool)
    const r2 = await createRestaurant(db.pool)
    await makeLegacyShape()
    try {
      // r1 follows both branches of `org` (one org relationship after migration).
      await db.pool.query(
        `INSERT INTO supplier_follow (restaurant_id, supplier_id, created_at)
         VALUES ($1, $2, now() - interval '2 days'), ($1, $3, now())`,
        [r1.id, org.branchIds[0], org.branchIds[1]]
      )
      // r2 follows branch B of `other` but blocked branch A of the same org.
      await db.pool.query(
        `INSERT INTO supplier_follow (restaurant_id, supplier_id) VALUES ($1, $2)`,
        [r2.id, other.branchIds[0]]
      )
      await db.pool.query(
        `INSERT INTO supplier_blocklist (restaurant_id, supplier_id) VALUES ($1, $2)`,
        [r2.id, other.branchIds[0]]
      )
      await applyRelationshipMigration()
    } catch (error) {
      await applyRelationshipMigration()
      throw error
    }

    const { rows: follows } = await db.pool.query(
      `SELECT restaurant_id, supplier_id, supplier_org_id FROM supplier_follow ORDER BY created_at`
    )
    expect(follows).toEqual([
      { restaurant_id: r1.id, supplier_id: org.branchIds[0], supplier_org_id: org.orgId },
    ])
    const { rows: blocks } = await db.pool.query(
      `SELECT supplier_org_id FROM supplier_blocklist WHERE restaurant_id = $1`,
      [r2.id]
    )
    expect(blocks).toEqual([{ supplier_org_id: other.orgId }])
    const { rows: nullable } = await db.pool.query(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE column_name = 'supplier_org_id' AND table_name IN ('supplier_follow','supplier_blocklist')
       ORDER BY table_name`
    )
    expect(nullable.map((r) => r.is_nullable)).toEqual(['NO', 'NO'])
  })

  it('two concurrent migration runs apply each file once', async () => {
    const { logger } = await import('../../../apps/api/src/lib/logger.js')
    const spy = vi.spyOn(logger, 'info')
    await db.pool.query(`DELETE FROM schema_migrations WHERE version = $1`, [migrationFile])
    try {
      await Promise.all([migrator.runAllSqlMigrations(), migrator.runAllSqlMigrations()])
      const applied = spy.mock.calls.filter(
        ([arg]) => arg && arg.event === 'db.migration.applied' && arg.file === migrationFile
      )
      expect(applied).toHaveLength(1)
      const { rows } = await db.pool.query(
        `SELECT count(*)::int AS n FROM schema_migrations WHERE version = $1`,
        [migrationFile]
      )
      expect(rows[0].n).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('relationship module against real SQL', () => {
  it('follow on branch B row of an org is visible as org follow', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const r = await createRestaurant(db.pool)
    await db.pool.query(
      `INSERT INTO supplier_follow (restaurant_id, supplier_id) VALUES ($1, $2)`,
      [r.id, org.branchIds[1]]
    )
    const relA = await rel.getRelationship(r.id, org.branchIds[0])
    expect(relA).toEqual({ orgId: org.orgId, following: true, blocked: false, publicCatalog: true })
    expect(await rel.canTransact(r.id, org.branchIds[0])).toBe(true)
    const { allowed, missing } = await rel.transactableSupplierIds(r.id, org.branchIds)
    expect([...allowed].sort()).toEqual([...org.branchIds].sort())
    expect(missing).toEqual([])
  })

  it('block on any branch blocks the whole organisation and catalogVisibleSql agrees', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2, publicCatalog: true })
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    await db.pool.query(
      `INSERT INTO supplier_blocklist (restaurant_id, supplier_id) VALUES ($1, $2)`,
      [r.id, org.branchIds[1]]
    )
    expect(await rel.canTransact(r.id, org.branchIds[0])).toBe(false)
    expect(await rel.canViewCatalog(r.id, org.branchIds[0])).toBe(false)
    const { rows } = await db.pool.query(
      `SELECT s.id, ${rel.catalogVisibleSql('$1', 's')} AS visible FROM supplier s
       WHERE s.organization_id = $2`,
      [r.id, org.orgId]
    )
    expect(rows.every((row) => row.visible === false)).toBe(true)
  })

  it('linking a supplier to another organisation re-keys and merges its follows', async () => {
    const standalone = await createSupplierOrg(db.pool, { branches: 1 })
    const target = await createSupplierOrg(db.pool, { branches: 1 })
    const both = await createRestaurant(db.pool)
    const onlyOld = await createRestaurant(db.pool)
    const blockedOld = await createRestaurant(db.pool)
    await follow(db.pool, both.id, standalone.orgId)
    await follow(db.pool, both.id, target.orgId)
    await follow(db.pool, onlyOld.id, standalone.orgId)
    await follow(db.pool, blockedOld.id, target.orgId)
    await db.pool.query(
      `INSERT INTO supplier_blocklist (restaurant_id, supplier_id) VALUES ($1, $2)`,
      [blockedOld.id, standalone.branchIds[0]]
    )

    const linked = await orgLib.linkSupplierToOrganization(standalone.branchIds[0], target.orgId)
    expect(linked.ok).toBe(true)

    const { rows: sup } = await db.pool.query(
      `SELECT organization_id, is_main_branch FROM supplier WHERE id = $1`,
      [standalone.branchIds[0]]
    )
    expect(sup[0]).toEqual({ organization_id: target.orgId, is_main_branch: false })
    const { rows: f } = await db.pool.query(
      `SELECT restaurant_id, supplier_org_id FROM supplier_follow ORDER BY restaurant_id`
    )
    expect(f).toEqual(
      [
        { restaurant_id: both.id, supplier_org_id: target.orgId },
        { restaurant_id: onlyOld.id, supplier_org_id: target.orgId },
      ].sort((a, b) => a.restaurant_id.localeCompare(b.restaurant_id))
    )
    const { rows: b } = await db.pool.query(
      `SELECT restaurant_id, supplier_org_id FROM supplier_blocklist`
    )
    expect(b).toEqual([{ restaurant_id: blockedOld.id, supplier_org_id: target.orgId }])
  })

  it('a supplier that already shares its organisation with other branches cannot be linked away', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const target = await createSupplierOrg(db.pool)
    const linked = await orgLib.linkSupplierToOrganization(org.branchIds[1], target.orgId)
    expect(linked.ok).toBe(false)
  })

  it('unlinking a branch gives it its own organisation and leaves follows with the old one', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    const result = await orgLib.unlinkSupplierFromOrganization(org.branchIds[1], {
      organizationId: org.orgId,
    })
    expect(result.ok).toBe(true)
    const { rows } = await db.pool.query(
      `SELECT organization_id, is_main_branch FROM supplier WHERE id = $1`,
      [org.branchIds[1]]
    )
    expect(rows[0].organization_id).not.toBe(org.orgId)
    expect(rows[0].is_main_branch).toBe(true)
    expect(await rel.canTransact(r.id, org.branchIds[0])).toBe(true)
    expect(await rel.canTransact(r.id, org.branchIds[1])).toBe(false)
  })

  it('org-level relationship does not widen branch data scope', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    const order = await createOrder(db.pool, { restaurantId: r.id, supplierId: org.branchIds[0] })

    const own = await fetch(`${api.baseUrl}/api/orders/${order.id}`, {
      headers: { 'x-test-user': org.users[0].userSub },
    })
    expect(own.status).toBe(200)
    const other = await fetch(`${api.baseUrl}/api/orders/${order.id}`, {
      headers: { 'x-test-user': org.users[1].userSub },
    })
    // Existing branch RBAC answers 403 for another branch's order; the org-level follow must
    // not turn that into access.
    expect([403, 404]).toContain(other.status)
    const body = await other.json()
    expect(JSON.stringify(body)).not.toContain(r.name)
  })
})
