/**
 * Relationship guard for every new order (marketplace visibility, spec §11.2).
 *
 * Runs inside the order's own transaction: takes the shared `rel:<restaurant>:<org>` advisory
 * lock for every supplier organisation in the cart (ascending org id, so concurrent multi-org
 * carts cannot deadlock against each other or against follow/unfollow/block), then re-checks the
 * relationship with the same client. An unfollow or block that commits first is therefore seen,
 * and one that starts later waits until the order commits.
 *
 * A past order no longer grants ordering: only a current follow (and no block) does.
 */
import {
  FollowRequiredError,
  lockRelationshipsShared,
  transactableSupplierIds,
} from '../lib/relationship.js'
import { SupplierBlockedError } from './relationship-writes.service.js'

async function lockSupplierOrgs(client, restaurantId, supplierIds) {
  const ids = [...new Set((supplierIds || []).filter(Boolean))]
  if (!ids.length) return ids
  const { rows } = await client.query(
    'SELECT id, organization_id FROM supplier WHERE id = ANY($1::uuid[])',
    [ids]
  )
  await lockRelationshipsShared(
    client,
    restaurantId,
    rows.map((r) => r.organization_id)
  )
  return ids
}

/**
 * Lock, then split the suppliers into those the restaurant may order from now and the rest.
 * @returns {Promise<{ allowed: Set<string>, missing: Array<{id: string, name: string|null, blocked: boolean}> }>}
 */
export async function lockAndPartitionOrderSuppliers(client, restaurantId, supplierIds) {
  const ids = await lockSupplierOrgs(client, restaurantId, supplierIds)
  if (!ids.length) return { allowed: new Set(), missing: [] }
  return transactableSupplierIds(restaurantId, ids, client)
}

/**
 * Lock and assert. `mode: 'follow'` (default) needs a follow and no block and throws
 * FOLLOW_REQUIRED listing the missing suppliers. `mode: 'notBlocked'` (dispute replacement
 * orders, which remedy an existing order) only refuses a block, with SUPPLIER_BLOCKED.
 */
export async function lockAndAssertOrderRelationships(
  client,
  restaurantId,
  supplierIds,
  { mode = 'follow' } = {}
) {
  const { missing } = await lockAndPartitionOrderSuppliers(client, restaurantId, supplierIds)
  if (mode === 'notBlocked') {
    if (missing.some((m) => m.blocked)) throw new SupplierBlockedError()
    return undefined
  }
  if (missing.length) throw new FollowRequiredError(missing)
  return undefined
}
