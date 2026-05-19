/**
 * One-time idempotent backfill: supplier orgs, main branch flags, org user roles.
 * Run after SQL migration 0082 on every environment.
 */
import { query, pool } from '../src/lib/db.js'
import {
  createSupplierOrganization,
  ensureOrgSystemRoles,
  assignOrgUserRole,
  linkSupplierToOrganization,
  isOrgMigrationComplete,
} from '../src/lib/supplier-org.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'

const failures = []

async function migrateSupplierToOrg(supplier) {
  try {
    let organizationId = supplier.organization_id
    if (!organizationId) {
      const org = await createSupplierOrganization({
        name: supplier.name,
        slug: supplier.slug ? `${supplier.slug}-org` : null,
      })
      organizationId = org.id
      await linkSupplierToOrganization(supplier.id, organizationId, { isMain: true })
    }

    await ensureOrgSystemRoles(organizationId)

    const { rows: linkedChildren } = await query(
      `
      SELECT l.child_tenant_id AS id, t.name, t.slug
      FROM tenant_account_link l
      JOIN supplier t ON t.id = l.child_tenant_id
      WHERE l.parent_tenant_id = $1 AND l.parent_tenant_type = 'SUPPLIER'
    `,
      [supplier.id]
    )

    for (const child of linkedChildren) {
      const { rows: childRow } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [
        child.id,
      ])
      if (!childRow[0]?.organization_id) {
        await query(
          `
          UPDATE supplier
          SET organization_id = $2, is_main_branch = false, updated_at = NOW()
          WHERE id = $1
        `,
          [child.id, organizationId]
        )
      }
    }

    const { rows: users } = await query(
      `
      SELECT DISTINCT u.id, u.email
      FROM app_user u
      WHERE u.id IN (
        SELECT tur.user_id FROM tenant_user_roles tur
        WHERE tur.tenant_id = $1 AND tur.tenant_type = 'SUPPLIER'
        UNION
        SELECT ur.user_id FROM user_role ur
        WHERE ur.tenant_id = $1 AND ur.tenant_type = 'SUPPLIER'
        UNION
        SELECT id FROM app_user
        WHERE LOWER(TRIM(email)) = LOWER(TRIM($2::text)) AND $2 <> ''
      )
    `,
      [supplier.id, supplier.contact_email || '']
    )

    for (const user of users) {
      const { rows: existing } = await query(
        `SELECT 1 FROM org_user_roles WHERE user_id = $1 AND organization_id = $2`,
        [user.id, organizationId]
      )
      if (!existing.length) {
        await assignOrgUserRole({
          userId: user.id,
          organizationId,
          roleName: 'Org Owner',
        })
      }
    }
  } catch (err) {
    failures.push({ supplierId: supplier.id, name: supplier.name, error: err.message })
    console.error(`Failed to migrate supplier ${supplier.id}:`, err.message)
  }
}

export async function migrateSuppliersToOrgs() {
  if (await isOrgMigrationComplete()) {
    console.log('Supplier org migration already complete — skipping.')
    return { skipped: true, failures: [] }
  }

  console.log('Migrating suppliers to organizations...\n')

  const { rows: primaries } = await query(`
    SELECT s.id, s.name, s.slug, s.contact_email, s.organization_id
    FROM supplier s
    WHERE s.id NOT IN (
      SELECT child_tenant_id FROM tenant_account_link WHERE child_tenant_type = 'SUPPLIER'
    )
    ORDER BY s.created_at ASC
  `)

  for (const supplier of primaries) {
    await migrateSupplierToOrg(supplier)
  }

  const { rows: remaining } = await query(
    `SELECT id, name, slug, contact_email, organization_id FROM supplier WHERE organization_id IS NULL`
  )
  for (const supplier of remaining) {
    await migrateSupplierToOrg(supplier)
  }

  const { rows: mainCheck } = await query(`
    SELECT COUNT(*)::int AS missing_main
    FROM supplier
    WHERE organization_id IS NOT NULL AND is_main_branch = true
    GROUP BY organization_id
    HAVING COUNT(*) = 0
  `)
  if (mainCheck.length) {
    console.warn('Some organizations have no main branch flagged — check manually.')
  }

  if (failures.length) {
    console.warn(`\n${failures.length} supplier(s) could not be migrated cleanly:`)
    for (const f of failures) {
      console.warn(`  - ${f.supplierId} (${f.name}): ${f.error}`)
    }
  } else {
    console.log('Supplier org migration finished successfully.')
  }

  return { skipped: false, failures }
}

if (isMainModule(import.meta.url)) {
  migrateSuppliersToOrgs()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await disconnectCache()
      await pool.end()
    })
}
