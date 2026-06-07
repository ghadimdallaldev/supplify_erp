import { describe, it, expect, vi } from 'vitest'
import { replaceOrgRolePermissions } from './org-role-permissions.js'

describe('replaceOrgRolePermissions', () => {
  it('deletes existing permissions and batch-inserts with branch_scope', async () => {
    const calls = []
    const db = vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
      return { rows: [] }
    })

    await replaceOrgRolePermissions(db, {
      permissionsTable: 'restaurant_org_role_permissions',
      roleId: 'role-1',
      permissions: ['ORDERS_VIEW', 'ORDERS_CREATE', 'CHAT_VIEW'],
      branchScope: 'all',
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('DELETE FROM restaurant_org_role_permissions')
    expect(calls[0].params).toEqual(['role-1'])

    expect(calls[1].sql).toContain('INSERT INTO restaurant_org_role_permissions')
    expect(calls[1].sql).toContain('ON CONFLICT (role_id, permission) DO UPDATE SET branch_scope')
    expect(calls[1].params).toEqual([
      'role-1',
      'ORDERS_VIEW',
      'all',
      'ORDERS_CREATE',
      'all',
      'CHAT_VIEW',
      'all',
    ])
  })

  it('skips insert when permission list is empty', async () => {
    const db = vi.fn(async () => ({ rows: [] }))

    await replaceOrgRolePermissions(db, {
      permissionsTable: 'org_role_permissions',
      roleId: 'role-2',
      permissions: [],
      branchScope: 'assigned',
    })

    expect(db).toHaveBeenCalledTimes(1)
    expect(db.mock.calls[0][0]).toContain('DELETE FROM org_role_permissions')
  })
})
