import { query } from './db.js'

function dbFor(client) {
  return client ? (sql, params) => client.query(sql, params) : query
}

function tenantTable(tenantType) {
  if (tenantType === 'RESTAURANT') return 'restaurant'
  if (tenantType === 'SUPPLIER') return 'supplier'
  throw new Error('Invalid tenant type')
}

function tenantRoleValue(tenantType) {
  return tenantType === 'RESTAURANT' ? 'RESTAURANT' : 'SUPPLIER'
}

function tenantScopeSql(tenantType) {
  const table = tenantTable(tenantType)
  return `
    WITH root AS (
      SELECT id, organization_id FROM ${table} WHERE id = $1
    ), tenant_scope AS (
      SELECT id, organization_id FROM root
      UNION
      SELECT t.id, t.organization_id
      FROM ${table} t
      JOIN root r ON r.organization_id IS NOT NULL AND t.organization_id = r.organization_id
    )`
}

export async function countActiveTenantLoginUsers(tenantId, tenantType, client = null) {
  const db = dbFor(client)
  const role = tenantRoleValue(tenantType)
  try {
    const { rows } = await db(
      `${tenantScopeSql(tenantType)}, role_users AS (
        SELECT DISTINCT tur.user_id
        FROM tenant_user_roles tur
        JOIN tenant_scope ts ON ts.id = tur.tenant_id
        WHERE tur.tenant_type = $2
      ), workspace_users AS (
        SELECT DISTINCT m.user_id
        FROM user_workspace_membership m
        CROSS JOIN (SELECT organization_id FROM root LIMIT 1) r
        WHERE m.workspace_type = $2
          AND m.status = 'active'
          AND (
            m.home_tenant_id IN (SELECT id FROM tenant_scope)
            OR (r.organization_id IS NOT NULL AND m.organization_id = r.organization_id)
          )
      ), members AS (
        SELECT user_id FROM role_users
        UNION
        SELECT user_id FROM workspace_users
      )
      SELECT COUNT(DISTINCT u.id)::int AS count
      FROM app_user u
      JOIN members m ON m.user_id = u.id
      WHERE u.role = $2`,
      [tenantId, role]
    )
    return parseInt(rows[0]?.count || 0, 10)
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') return 1
    throw error
  }
}

export async function countPendingTenantInvitations(tenantId, tenantType, client = null) {
  const db = dbFor(client)
  const invitationTable =
    tenantType === 'RESTAURANT' ? 'restaurant_invitations' : 'branch_invitations'
  const tenantColumn = tenantType === 'RESTAURANT' ? 'restaurant_id' : 'supplier_id'
  try {
    const { rows } = await db(
      `${tenantScopeSql(tenantType)}
      SELECT COUNT(DISTINCT lower(trim(i.invited_email)))::int AS count
      FROM ${invitationTable} i
      JOIN tenant_scope ts ON ts.id = i.${tenantColumn}
      WHERE i.status = 'pending'
        AND i.expires_at > NOW()
        AND i.invited_email IS NOT NULL
        AND trim(i.invited_email) <> ''`,
      [tenantId]
    )
    return parseInt(rows[0]?.count || 0, 10)
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') return 0
    throw error
  }
}

export async function isActiveTenantLoginUser(tenantId, tenantType, userId, client = null) {
  if (!userId) return false
  const db = dbFor(client)
  const role = tenantRoleValue(tenantType)
  try {
    const { rows } = await db(
      `${tenantScopeSql(tenantType)}, role_users AS (
        SELECT DISTINCT tur.user_id
        FROM tenant_user_roles tur
        JOIN tenant_scope ts ON ts.id = tur.tenant_id
        WHERE tur.tenant_type = $2
      ), workspace_users AS (
        SELECT DISTINCT m.user_id
        FROM user_workspace_membership m
        CROSS JOIN (SELECT organization_id FROM root LIMIT 1) r
        WHERE m.workspace_type = $2
          AND m.status = 'active'
          AND (
            m.home_tenant_id IN (SELECT id FROM tenant_scope)
            OR (r.organization_id IS NOT NULL AND m.organization_id = r.organization_id)
          )
      )
      SELECT TRUE AS present
      FROM app_user u
      WHERE u.id = $3
        AND u.role = $2
        AND (
          EXISTS (SELECT 1 FROM role_users ru WHERE ru.user_id = u.id)
          OR EXISTS (SELECT 1 FROM workspace_users wu WHERE wu.user_id = u.id)
        )
      LIMIT 1`,
      [tenantId, role, userId]
    )
    return rows.length > 0
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') return false
    throw error
  }
}
