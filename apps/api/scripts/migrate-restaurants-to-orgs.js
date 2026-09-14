/**
 * One-time idempotent backfill: restaurant orgs, main branch flags, org user roles.
 * Run after SQL migration 0086 on every environment.
 */
import { query, pool } from '../src/lib/db.js'
import {
  createRestaurantOrganization,
  ensureRestaurantOrgSystemRoles,
  assignRestaurantOrgUserRole,
  linkRestaurantToOrganization,
  isRestaurantOrgMigrationComplete,
} from '../src/lib/restaurant-org.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'

const failures = []

async function migrateRestaurantToOrg(restaurant) {
  try {
    let organizationId = restaurant.organization_id
    if (!organizationId) {
      const org = await createRestaurantOrganization({
        name: restaurant.name,
        slug: restaurant.slug ? `${restaurant.slug}-org` : null,
      })
      organizationId = org.id
      await linkRestaurantToOrganization(restaurant.id, organizationId, { isMain: true })
    }

    await ensureRestaurantOrgSystemRoles(organizationId)

    const { rows: linkedChildren } = await query(
      `
      SELECT l.child_tenant_id AS id, t.name, t.slug
      FROM tenant_account_link l
      JOIN restaurant t ON t.id = l.child_tenant_id
      WHERE l.parent_tenant_id = $1 AND l.parent_tenant_type = 'RESTAURANT'
    `,
      [restaurant.id]
    )

    for (const child of linkedChildren) {
      const { rows: childRow } = await query(
        `SELECT organization_id FROM restaurant WHERE id = $1`,
        [child.id]
      )
      if (!childRow[0]?.organization_id) {
        await query(
          `
          UPDATE restaurant
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
        WHERE tur.tenant_id = $1 AND tur.tenant_type = 'RESTAURANT'
        UNION
        SELECT ur.user_id FROM user_role ur
        WHERE ur.tenant_id = $1 AND ur.tenant_type = 'RESTAURANT'
        UNION
        SELECT id FROM app_user
        WHERE LOWER(TRIM(email)) = LOWER(TRIM($2::text)) AND $2 <> ''
      )
    `,
      [restaurant.id, restaurant.contact_email || '']
    )

    for (const user of users) {
      const { rows: existing } = await query(
        `SELECT 1 FROM restaurant_org_user_roles WHERE user_id = $1 AND organization_id = $2`,
        [user.id, organizationId]
      )
      if (!existing.length) {
        await assignRestaurantOrgUserRole({
          userId: user.id,
          organizationId,
          roleName: 'Org Owner',
        })
      }
    }
  } catch (err) {
    failures.push({ restaurantId: restaurant.id, name: restaurant.name, error: err.message })
    console.error(`Failed to migrate restaurant ${restaurant.id}:`, err.message)
  }
}

export async function migrateRestaurantsToOrgs() {
  if (await isRestaurantOrgMigrationComplete()) {
    console.log('Restaurant org migration already complete — skipping.')
    return { skipped: true, failures: [] }
  }

  console.log('Migrating restaurants to organizations...\n')

  const { rows: primaries } = await query(`
    SELECT r.id, r.name, r.slug, r.contact_email, r.organization_id
    FROM restaurant r
    WHERE r.id NOT IN (
      SELECT child_tenant_id FROM tenant_account_link WHERE child_tenant_type = 'RESTAURANT'
    )
    ORDER BY r.created_at ASC
  `)

  for (const restaurant of primaries) {
    await migrateRestaurantToOrg(restaurant)
  }

  const { rows: remaining } = await query(
    `SELECT id, name, slug, contact_email, organization_id FROM restaurant WHERE organization_id IS NULL`
  )
  for (const restaurant of remaining) {
    await migrateRestaurantToOrg(restaurant)
  }

  if (failures.length) {
    console.warn(`\n${failures.length} restaurant(s) could not be migrated cleanly:`)
    for (const f of failures) {
      console.warn(`  - ${f.restaurantId} (${f.name}): ${f.error}`)
    }
  } else {
    console.log('Restaurant org migration finished successfully.')
  }

  return { skipped: false, failures }
}

if (isMainModule(import.meta.url)) {
  migrateRestaurantsToOrgs()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await disconnectCache()
      await pool.end()
    })
}
