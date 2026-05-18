import { query, withTransaction } from './db.js'
import { slugifyName } from './register-account.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'
import { assignDefaultRoleForTenant } from './rbac.js'

async function uniqueSlug(client, table, baseSlug) {
  let slug = baseSlug
  let n = 0
  while (n < 100) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE slug = $1`, [candidate])
    if (rows.length === 0) return candidate
    n += 1
  }
  throw new Error('Could not generate a unique organization URL slug')
}

export async function listLinkedAccounts(parentTenantId, parentTenantType) {
  const table = parentTenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: parentRows } = await query(`SELECT id, name FROM ${table} WHERE id = $1`, [
    parentTenantId,
  ])
  const parent = parentRows[0]
  if (!parent) return { primary: null, linked: [] }

  const { rows: linked } = await query(
    `
      SELECT l.id AS link_id, l.branch_name, t.id, t.name, t.slug, t.phone, t.contact_email
      FROM tenant_account_link l
      JOIN ${table} t ON t.id = l.child_tenant_id
      WHERE l.parent_tenant_id = $1 AND l.parent_tenant_type = $2
      ORDER BY l.created_at DESC
    `,
    [parentTenantId, parentTenantType]
  )

  return {
    primary: { id: parent.id, name: parent.name, isPrimary: true },
    linked: linked.map((row) => ({
      linkId: row.link_id,
      id: row.id,
      name: row.branch_name || row.name,
      accountName: row.name,
      slug: row.slug,
      phone: row.phone,
      contactEmail: row.contact_email,
      isPrimary: false,
    })),
  }
}

export async function createLinkedBranchAccount({
  parentTenantId,
  parentTenantType,
  userId,
  ownerEmail,
  branchName,
  phone,
  address,
}) {
  const tenantType = parentTenantType
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const normalizedEmail = ownerEmail.trim().toLowerCase()
  const name = branchName.trim()

  return withTransaction(async (client) => {
    const slug = await uniqueSlug(client, table, slugifyName(name))
    const addressJson = address ? JSON.stringify(address) : '{}'

    let tenant
    if (tenantType === 'SUPPLIER') {
      const { rows } = await client.query(
        `INSERT INTO supplier (name, slug, contact_email, phone, address_json)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [name, slug, normalizedEmail, phone || null, addressJson]
      )
      tenant = rows[0]
      await client.query(
        `INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`,
        [tenant.id, `${name} Catalog`]
      )
    } else {
      const { rows } = await client.query(
        `INSERT INTO restaurant (name, slug, contact_email, phone, address_json)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [name, slug, normalizedEmail, phone || null, addressJson]
      )
      tenant = rows[0]
    }

    await client.query(
      `
        INSERT INTO tenant_account_link (
          parent_tenant_id, parent_tenant_type, child_tenant_id, child_tenant_type, branch_name
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [parentTenantId, parentTenantType, tenant.id, tenantType, name]
    )

    await createPendingActivationSubscription(client, tenant.id, tenantType, 'free')
    return tenant
  }).then(async (tenant) => {
    await assignDefaultRoleForTenant(userId, tenant.id, tenantType)
    return tenant
  })
}

export async function removeLinkedBranchAccount({
  parentTenantId,
  parentTenantType,
  childTenantId,
}) {
  const { rowCount } = await query(
    `
      DELETE FROM tenant_account_link
      WHERE parent_tenant_id = $1
        AND parent_tenant_type = $2
        AND child_tenant_id = $3
        AND child_tenant_type = $2
    `,
    [parentTenantId, parentTenantType, childTenantId]
  )
  return rowCount > 0
}
