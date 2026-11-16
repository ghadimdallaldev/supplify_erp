import { checkLinkedAccountLimit } from './plan-enforcement.js'
import { ValidationError } from '../middlewares/errorHandler.js'

/** Shared serialization for create, link and reactivate; count after acquiring the lock. */
export async function lockOrgBranchCapacity(
  client,
  organizationId,
  tenantType,
  { initializingMain = false } = {}
) {
  const table =
    tenantType === 'SUPPLIER' ? 'supplier' : tenantType === 'RESTAURANT' ? 'restaurant' : null
  if (!table || !organizationId) throw new ValidationError('Organization context required')
  const orgTable = tenantType === 'SUPPLIER' ? 'supplier_organizations' : 'restaurant_organizations'
  const { rows: organizations } = await client.query(
    `SELECT id FROM ${orgTable} WHERE id = $1 FOR UPDATE`,
    [organizationId]
  )
  if (!organizations.length) throw new ValidationError('Organization not found')
  if (initializingMain) return
  const { rows: mains } = await client.query(
    `SELECT id FROM ${table} WHERE organization_id = $1 AND is_main_branch = TRUE ORDER BY id LIMIT 1 FOR UPDATE`,
    [organizationId]
  )
  if (!mains.length) throw new ValidationError('Organization has no main branch account')
  const { rows: counts } = await client.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE organization_id = $1 AND is_branch_active = TRUE`,
    [organizationId]
  )
  const checked = await checkLinkedAccountLimit(mains[0].id, tenantType, {
    branches_count: Number(counts[0]?.count ?? 0),
  })
  if (!checked.allowed) {
    const error = new ValidationError(checked.reason || 'Branch account limit reached')
    error.code = 'LIMIT_EXCEEDED'
    error.details = checked
    throw error
  }
}
