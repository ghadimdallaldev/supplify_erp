import { query, withTransaction } from './db.js'
import { performance } from 'node:perf_hooks'
import { invalidateUserAuthCaches } from './access-cache.js'
import { ensureOrgSystemRoles, assignOrgUserRole } from './supplier-org.js'
import { ensureRestaurantOrgSystemRoles, assignRestaurantOrgUserRole } from './restaurant-org.js'
import { ensureTenantSystemRoles, assignOwnerRoleForUser } from './tenant-roles.js'
import { ensureKeycloakRealmRole } from './keycloak-admin.js'
import { ConflictError, ValidationError } from '../middlewares/errorHandler.js'
import {
  bindUserToWorkspace,
  getUserWorkspaceMembership,
  resolveWorkspaceScope,
} from './workspace-membership.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'
import { sendNotification, notifyAdminNewTenant } from '../services/notification.service.js'
import { recordRegistrationLegalAcceptances } from './legal-acceptance.js'
import { logger } from './logger.js'

const KC_ROLE = { RESTAURANT: 'restaurant', SUPPLIER: 'supplier', ADMIN: 'admin' }

function createRegistrationPhaseTimer() {
  let lapStart = performance.now()
  const phases = {}
  return {
    lap(phase) {
      phases[phase] = Math.round(performance.now() - lapStart)
      lapStart = performance.now()
    },
    phases,
  }
}

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

export async function userNeedsTenantSetup(user) {
  if (!user || user.role === 'ADMIN') return false
  if (user.role === 'PENDING') return true
  const email = (user.email || '').trim().toLowerCase()
  if (!email) return true

  const [{ rows: restaurants }, { rows: suppliers }] = await Promise.all([
    query('SELECT id FROM restaurant WHERE LOWER(TRIM(contact_email)) = $1 LIMIT 1', [email]),
    query('SELECT id FROM supplier WHERE LOWER(TRIM(contact_email)) = $1 LIMIT 1', [email]),
  ])
  return restaurants.length === 0 && suppliers.length === 0
}

async function completeSupplierRegistration(
  client,
  { userId, keycloakSub, normalizedEmail, name, slug, phone },
  lap
) {
  lap?.('createTenantAndOrg')

  const { rows: supplierRows } = await client.query(
    `INSERT INTO supplier (name, slug, contact_email, phone, address_json)
     VALUES ($1, $2, $3, $4, '{}'::jsonb)
     RETURNING *`,
    [name, slug, normalizedEmail, phone || null]
  )
  const tenant = supplierRows[0]

  await client.query(`INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`, [
    tenant.id,
    `${name} Catalog`,
  ])

  const orgSlug = `${slug}-org`
  const { rows: orgRows } = await client.query(
    `INSERT INTO supplier_organizations (name, slug)
     VALUES ($1, $2)
     RETURNING *`,
    [name, orgSlug]
  )
  const organization = orgRows[0]

  await client.query(
    `UPDATE supplier
     SET organization_id = $1, is_main_branch = true, updated_at = now()
     WHERE id = $2`,
    [organization.id, tenant.id]
  )

  await ensureOrgSystemRoles(organization.id, client)
  lap?.('ensureOrgRoles')

  await ensureTenantSystemRoles(tenant.id, 'SUPPLIER', client)
  lap?.('ensureTenantRoles')

  await assignOrgUserRole({
    userId,
    organizationId: organization.id,
    roleName: 'Org Owner',
    client,
  })

  await assignOwnerRoleForUser(userId, tenant.id, 'SUPPLIER', null, client, {
    rolesAlreadyEnsured: true,
  })
  lap?.('assignOwnerRole')

  await client.query(
    `UPDATE app_user SET role = 'SUPPLIER', keycloak_sub = COALESCE(keycloak_sub, $1), updated_at = now() WHERE id = $2`,
    [keycloakSub, userId]
  )

  await createPendingActivationSubscription(client, tenant.id, 'SUPPLIER', 'free')
  lap?.('subscription')

  return { tenant, tenantType: 'SUPPLIER', organizationId: organization.id }
}

async function completeRestaurantRegistration(
  client,
  { userId, keycloakSub, normalizedEmail, name, slug, phone, type },
  lap
) {
  lap?.('createTenantAndOrg')

  const { rows } = await client.query(
    `INSERT INTO restaurant (name, slug, contact_email, phone, address_json)
     VALUES ($1, $2, $3, $4, '{}'::jsonb)
     RETURNING *`,
    [name, slug, normalizedEmail, phone || null]
  )
  const tenant = rows[0]

  const orgSlug = `${slug}-org`
  const { rows: orgRows } = await client.query(
    `INSERT INTO restaurant_organizations (name, slug)
     VALUES ($1, $2)
     RETURNING *`,
    [name, orgSlug]
  )
  const organization = orgRows[0]

  await client.query(
    `UPDATE restaurant
     SET organization_id = $1, is_main_branch = true, updated_at = now()
     WHERE id = $2`,
    [organization.id, tenant.id]
  )

  await ensureRestaurantOrgSystemRoles(organization.id, client)
  lap?.('ensureOrgRoles')

  await ensureTenantSystemRoles(tenant.id, 'RESTAURANT', client)
  lap?.('ensureTenantRoles')

  await assignRestaurantOrgUserRole({
    userId,
    organizationId: organization.id,
    roleName: 'Org Owner',
    client,
  })

  await assignOwnerRoleForUser(userId, tenant.id, 'RESTAURANT', null, client, {
    rolesAlreadyEnsured: true,
  })
  lap?.('assignOwnerRole')

  await client.query(
    `UPDATE app_user SET role = $1, keycloak_sub = COALESCE(keycloak_sub, $2), updated_at = now() WHERE id = $3`,
    [type, keycloakSub, userId]
  )

  await createPendingActivationSubscription(client, tenant.id, type, 'free')
  lap?.('subscription')

  return { tenant, tenantType: type, organizationId: organization.id }
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
  legalAcceptance,
  ipAddress,
  userAgent,
}) {
  const normalizedEmail = email.trim().toLowerCase()
  const type = accountType === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
  const name = businessName.trim()
  if (!name) throw new ValidationError('Business name is required')

  const registrationStarted = performance.now()
  const timer = createRegistrationPhaseTimer()

  const existingUser = await query('SELECT id, role FROM app_user WHERE id = $1', [userId])
  if (existingUser.rows.length === 0) throw new ValidationError('User not found')
  if (existingUser.rows[0].role === 'ADMIN') {
    throw new ValidationError('Admin accounts do not require organization setup')
  }

  const existingMembership = await getUserWorkspaceMembership(userId)
  if (existingMembership) {
    throw new ConflictError(
      'You are already linked to an account. A user can only belong to one supplier or restaurant.'
    )
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

  timer.lap('preflight')

  const result = await withTransaction(async (client) => {
    const slug = await uniqueSlug(client, tenantTable, baseSlug)

    let registrationResult
    if (type === 'SUPPLIER') {
      registrationResult = await completeSupplierRegistration(
        client,
        {
          userId,
          keycloakSub,
          normalizedEmail,
          name,
          slug,
          phone,
        },
        timer.lap.bind(timer)
      )
    } else {
      registrationResult = await completeRestaurantRegistration(
        client,
        {
          userId,
          keycloakSub,
          normalizedEmail,
          name,
          slug,
          phone,
          type,
        },
        timer.lap.bind(timer)
      )
    }

    timer.lap('workspaceAndLegal')

    const scope = await resolveWorkspaceScope(
      registrationResult.tenant.id,
      registrationResult.tenantType,
      client
    )
    await bindUserToWorkspace(
      {
        userId,
        workspaceType: scope.workspaceType,
        organizationId: scope.organizationId,
        homeTenantId: scope.homeTenantId,
        isMainAdmin: true,
      },
      client
    )

    await recordRegistrationLegalAcceptances(
      {
        userId,
        tenantId: registrationResult.tenant.id,
        tenantType: registrationResult.tenantType,
        acceptedDocuments: legalAcceptance.acceptedDocuments,
        electronicSignatureAttestation: legalAcceptance.electronicSignatureAttestation,
        packVersion: legalAcceptance.packVersion,
        ipAddress,
        userAgent,
      },
      client
    )

    return registrationResult
  })

  timer.lap('postTransaction')

  // Role changes in DB; invalidate auth/tenant/billing caches before the client refetches.
  await invalidateUserAuthCaches({
    userId,
    keycloakSub,
    tenantId: result.tenant.id,
    tenantType: result.tenantType,
  })

  if (result.tenantType === 'RESTAURANT') {
    const { invalidateRestaurantOrgPermissionCaches } = await import('./restaurant-org.js')
    if (result.organizationId) {
      await invalidateRestaurantOrgPermissionCaches(userId, result.organizationId)
    }
  } else {
    const { invalidateOrgPermissionCaches } = await import('./supplier-org.js')
    await invalidateOrgPermissionCaches(userId, result.organizationId)
  }

  timer.lap('invalidateCaches')

  logger.info('Tenant registration timing', {
    tenantType: result.tenantType,
    tenantId: result.tenant.id,
    phases: timer.phases,
    totalMs: Math.round(performance.now() - registrationStarted),
  })

  // Keycloak + welcome email are not required to finish signup; do not block the HTTP response.
  void ensureKeycloakRealmRole(normalizedEmail, kcRole)
  void sendNotification({
    userId,
    userType: result.tenantType,
    notificationType: 'SYSTEM',
    notificationCategory: 'system_updates',
    title: 'Welcome to Supplify',
    message:
      result.tenantType === 'SUPPLIER'
        ? `Your supplier account "${name}" is ready.`
        : `Your restaurant account "${name}" is ready.`,
    referenceId: result.tenant.id,
    referenceType: 'TENANT',
    metadata: { tenantId: result.tenant.id, tenantType: result.tenantType, tenantName: name },
  }).catch(() => {})
  void notifyAdminNewTenant({
    tenantId: result.tenant.id,
    tenantType: result.tenantType,
    tenantName: name,
    contactEmail: normalizedEmail,
  }).catch(() => {})

  return result
}
