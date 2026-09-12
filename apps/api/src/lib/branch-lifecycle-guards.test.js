import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
}))

vi.mock('./permissions.js', () => ({
  invalidateUserPermissionCache: vi.fn().mockResolvedValue(undefined),
}))

import { query } from './db.js'
import { invalidateUserPermissionCache } from './permissions.js'
import {
  getSupplierDeactivationBlockers,
  getRestaurantDeactivationBlockers,
  invalidateCachesForSupplierBranchLifecycle,
  DEACTIVATION_BLOCKER,
} from './branch-lifecycle-guards.js'

describe('branch-lifecycle-guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects supplier blockers for reservations and open invoices', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // warehouse reservations
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // open invoices

    const blockers = await getSupplierDeactivationBlockers('sup-1', {
      hasPendingOrders: true,
    })

    expect(blockers.map((b) => b.code)).toEqual([
      DEACTIVATION_BLOCKER.PENDING_ORDERS,
      DEACTIVATION_BLOCKER.ACTIVE_WAREHOUSE_RESERVATIONS,
      DEACTIVATION_BLOCKER.OPEN_INVOICES,
    ])
  })

  it('collects restaurant blockers for staff and central purchasing', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // invoices
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // staff
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // CP drafts

    const blockers = await getRestaurantDeactivationBlockers('rest-1', {
      hasPendingOrders: false,
    })

    expect(blockers.map((b) => b.code)).toEqual([
      DEACTIVATION_BLOCKER.SCHEDULED_STAFF,
      DEACTIVATION_BLOCKER.PENDING_CENTRAL_PURCHASING,
    ])
  })

  it('invalidates branch staff and all org users on supplier lifecycle', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 'staff-1' }] }) // tenant_user_roles
      .mockResolvedValueOnce({
        rows: [{ user_id: 'org-owner' }, { user_id: 'rm-1' }],
      }) // org users
      .mockResolvedValueOnce({ rows: [{ id: 'sup-1' }, { id: 'sup-2' }] }) // org branches

    await invalidateCachesForSupplierBranchLifecycle('sup-1', 'org-1')

    expect(invalidateUserPermissionCache).toHaveBeenCalledWith('staff-1', 'sup-1', 'SUPPLIER')
    expect(invalidateUserPermissionCache).toHaveBeenCalledWith('org-owner', 'sup-1', 'SUPPLIER')
    expect(invalidateUserPermissionCache).toHaveBeenCalledWith('org-owner', 'sup-2', 'SUPPLIER')
    expect(invalidateUserPermissionCache).toHaveBeenCalledWith('rm-1', 'sup-1', 'SUPPLIER')
  })
})
