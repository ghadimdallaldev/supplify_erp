import { query, withTransaction } from './db.js'
import { assignDefaultRoleForTenant } from './rbac.js'
import { ensureKeycloakRealmRole } from './keycloak-admin.js'
import { ConflictError, ValidationError } from '../middlewares/errorHandler.js'

const KC_ROLE = { RESTAURANT: 'restaurant', SUPPLIER: 'supplier', ADMIN: 'admin' }

export function slugifyName(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return base || 'organization'
}

async function uniqueSlug(client, table, baseSlug) {
  let slug = baseSlug
  let n = 0
  while (n < 100) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE slug = $1`, [candidate])
    if (rows.length === 0) return candidate
    n += 1
  }
  throw new ValidationError('Could not generate a unique organization URL slug')
}

async function assignFreeSubscription(client, tenantId, tenantType) {
  await client.query(
    `
    INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
    SELECT $1, $2, sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
    FROM subscription_plan sp
    WHERE sp.code = 'free' AND sp.tenant_type = $2 AND sp.is_active = true
    LIMIT 1
    `,
    [tenantId, tenantType]
  )
}

export async function userNeedsTenantSetup(user) {
  if (!user || user.role === 'ADMIN') return false
  const email = (user.email || '').trim().toLowerCase()
  if (!email) return true
  if (user.role === 'SUPPLIER') {
    const { rows } = await query(
      'SELECT id FROM supplier WHERE LOWER(TRIM(contact_email)) = $1 LIMIT 1',
      [email]
    )
    return rows.length === 0
  }
  if (user.role === 'RESTAURANT') {
    const { rows } = await query(
      'SELECT id FROM restaurant WHERE LOWER(TRIM(contact_email)) = $1 LIMIT 1',
      [email]
    )
    return rows.length === 0
  }
  return true
}

/**
 * Create restaurant or supplier tenant for an authenticated user (post–Keycloak registration).
 */
export async function completeTenantRegistration({
  userId,
  keycloakSub,
  email,
  accountType,
  businessName,
  phone,
}) {
  const normalizedEmail = email.trim().toLowerCase()
  const type = accountType === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
  const name = businessName.trim()
  if (!name) throw new ValidationError('Business name is required')

  const existingUser = await query('SELECT id, role FROM app_user WHERE id = $1', [userId])
  if (existingUser.rows.length === 0) throw new ValidationError('User not found')
  if (existingUser.rows[0].role === 'ADMIN') {
    throw new ValidationError('Admin accounts do not require organization setup')
  }

  const tenantTable = type === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: existingTenant } = await query(
    `SELECT id FROM ${tenantTable} WHERE LOWER(TRIM(contact_email)) = $1 LIMIT 1`,
    [normalizedEmail]
  )
  if (existingTenant.length > 0) {
    throw new ConflictError(
      type === 'SUPPLIER'
        ? 'A supplier account already exists for this email'
        : 'A restaurant account already exists for this email'
    )
  }

  const baseSlug = slugifyName(name)
  const kcRole = KC_ROLE[type]

  const result = await withTransaction(async (client) => {
    const slug = await uniqueSlug(client, tenantTable, baseSlug)

    let tenant
    if (type === 'SUPPLIER') {
      const { rows } = await client.query(
        `INSERT INTO supplier (name, slug, contact_email, phone, address_json)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)
         RETURNING *`,
        [name, slug, normalizedEmail, phone || null]
      )
      tenant = rows[0]
      await client.query(
        `INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`,
        [tenant.id, `${name} Catalog`]
      )
    } else {
      const { rows } = await client.query(
        `INSERT INTO restaurant (name, slug, contact_email, phone, address_json)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)
         RETURNING *`,
        [name, slug, normalizedEmail, phone || null]
      )
      tenant = rows[0]
    }

    await client.query(
      `UPDATE app_user SET role = $1, keycloak_sub = COALESCE(keycloak_sub, $2), updated_at = now() WHERE id = $3`,
      [type, keycloakSub, userId]
    )

    await assignFreeSubscription(client, tenant.id, type)

    return { tenant, tenantType: type }
  })

  await assignDefaultRoleForTenant(userId, result.tenant.id, result.tenantType)
  await ensureKeycloakRealmRole(normalizedEmail, kcRole)

  return result
}
