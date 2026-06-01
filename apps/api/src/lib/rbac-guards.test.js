import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}))

import {
  isPermissionSubset,
  assertCanAssignRole,
  assertCanGrantPermissions,
} from './rbac-guards.js'

function mockQueryBySql(handlers) {
  queryMock.mockImplementation((sql, params) => {
    const text = String(sql)
    for (const [pattern, result] of handlers) {
      if (text.includes(pattern)) {
        return Promise.resolve(typeof result === 'function' ? result(params) : result)
      }
    }
    return Promise.resolve({ rows: [] })
  })
}

describe('rbac-guards', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('isPermissionSubset returns true when actor has all target permissions', () => {
    const actor = ['ORDERS_VIEW', 'ORDERS_MANAGE', 'STAFF_INVITE']
    const target = ['ORDERS_VIEW', 'STAFF_INVITE']
    expect(isPermissionSubset(actor, target)).toBe(true)
  })

  it('isPermissionSubset returns false when actor lacks a permission', () => {
    const actor = ['ORDERS_VIEW']
    const target = ['ORDERS_VIEW', 'SETTINGS_MANAGE']
    expect(isPermissionSubset(actor, target)).toBe(false)
  })

  it('isPermissionSubset accepts _MANAGE wildcard', () => {
    const actor = ['ORDERS_MANAGE']
    const target = ['ORDERS_VIEW', 'ORDERS_EDIT']
    expect(isPermissionSubset(actor, target)).toBe(true)
  })

  describe('assertCanGrantPermissions', () => {
    it('allows platform admin to grant any permissions', () => {
      expect(() =>
        assertCanGrantPermissions(['ORDERS_VIEW'], ['SETTINGS_MANAGE'], true)
      ).not.toThrow()
    })

    it('rejects granting permissions the actor lacks', () => {
      expect(() => assertCanGrantPermissions(['ORDERS_VIEW'], ['SETTINGS_MANAGE'], false)).toThrow(
        ForbiddenError
      )
    })

    it('accepts subset grants when actor has _MANAGE wildcard', () => {
      expect(() =>
        assertCanGrantPermissions(['ORDERS_MANAGE'], ['ORDERS_VIEW', 'ORDERS_EDIT'], false)
      ).not.toThrow()
    })
  })

  describe('assertCanAssignRole', () => {
    const baseArgs = {
      requesterId: 'req-1',
      requesterIsPlatformAdmin: false,
      requesterPermissions: ['ORDERS_VIEW', 'STAFF_INVITE', 'ORDERS_MANAGE'],
      targetUserId: 'target-1',
      roleId: 'role-viewer',
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      organizationId: 'org-1',
    }

    it('rejects role from a different tenant', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'role-viewer',
            name: 'Viewer',
            tenant_id: 'other-tenant',
            tenant_type: 'RESTAURANT',
            is_system: true,
          },
        ],
      })
      await expect(assertCanAssignRole(baseArgs)).rejects.toThrow(/does not belong/)
    })

    it('rejects assigning a role with permissions the requester lacks', async () => {
      mockQueryBySql([
        [
          'FROM tenant_roles WHERE id',
          {
            rows: [
              {
                id: 'role-mgr',
                name: 'Restaurant Manager',
                tenant_id: 'tenant-1',
                tenant_type: 'RESTAURANT',
                is_system: true,
              },
            ],
          },
        ],
        [
          'tenant_role_permissions',
          { rows: [{ permission: 'SETTINGS_MANAGE' }, { permission: 'STAFF_MANAGE' }] },
        ],
      ])
      await expect(assertCanAssignRole({ ...baseArgs, roleId: 'role-mgr' })).rejects.toThrow(
        /cannot assign a role with permissions you do not have/
      )
    })

    it('rejects non-owner assigning the Owner role', async () => {
      mockQueryBySql([
        [
          'FROM tenant_roles WHERE id',
          {
            rows: [
              {
                id: 'role-owner',
                name: 'Owner',
                tenant_id: 'tenant-1',
                tenant_type: 'RESTAURANT',
                is_system: true,
              },
            ],
          },
        ],
        ['tenant_user_roles tur', { rows: [] }],
      ])
      await expect(assertCanAssignRole({ ...baseArgs, roleId: 'role-owner' })).rejects.toThrow(
        /Only an Owner can assign the Owner role/
      )
    })

    it('rejects self-promotion to a role with more access', async () => {
      queryMock.mockImplementation((sql, params) => {
        const text = String(sql)
        if (text.includes('FROM tenant_roles WHERE id = $1')) {
          const roleId = params[0]
          if (roleId === 'role-viewer') {
            return Promise.resolve({
              rows: [{ name: 'Viewer', tenant_type: 'RESTAURANT' }],
            })
          }
          return Promise.resolve({
            rows: [
              {
                id: 'role-mgr',
                name: 'Restaurant Manager',
                tenant_id: 'tenant-1',
                tenant_type: 'RESTAURANT',
                is_system: true,
              },
            ],
          })
        }
        if (text.includes('tenant_role_permissions')) {
          const roleId = params[0]
          if (roleId === 'role-viewer') {
            return Promise.resolve({ rows: [{ permission: 'ORDERS_VIEW' }] })
          }
          return Promise.resolve({
            rows: [{ permission: 'ORDERS_MANAGE' }, { permission: 'STAFF_VIEW' }],
          })
        }
        if (text.includes('WHERE tur.user_id = $1 AND tur.tenant_id = $2')) {
          return Promise.resolve({
            rows: [{ name: 'Viewer', role_id: 'role-viewer' }],
          })
        }
        return Promise.resolve({ rows: [] })
      })
      await expect(
        assertCanAssignRole({
          ...baseArgs,
          requesterId: 'target-1',
          targetUserId: 'target-1',
          roleId: 'role-mgr',
          requesterPermissions: ['ORDERS_MANAGE', 'STAFF_VIEW', 'STAFF_INVITE'],
        })
      ).rejects.toThrow(/cannot change your own role to gain more access/)
    })

    it('rejects downgrading the last Owner in an organization', async () => {
      mockQueryBySql([
        [
          'FROM tenant_roles WHERE id',
          (_params) => ({
            rows: [
              {
                id: 'role-viewer',
                name: 'Viewer',
                tenant_id: 'tenant-1',
                tenant_type: 'RESTAURANT',
                is_system: true,
              },
            ],
          }),
        ],
        ['tenant_role_permissions', { rows: [{ permission: 'ORDERS_VIEW' }] }],
        [
          'WHERE tur.user_id = $1 AND tur.tenant_id = $2',
          {
            rows: [{ name: 'Owner' }],
          },
        ],
        [
          'COUNT(DISTINCT tur.user_id)',
          {
            rows: [{ count: 1 }],
          },
        ],
      ])
      await expect(assertCanAssignRole(baseArgs)).rejects.toThrow(ValidationError)
      await expect(assertCanAssignRole(baseArgs)).rejects.toThrow(/last Owner/)
    })

    it('allows assigning a role within the requester permission subset', async () => {
      mockQueryBySql([
        [
          'FROM tenant_roles WHERE id',
          {
            rows: [
              {
                id: 'role-viewer',
                name: 'Viewer',
                tenant_id: 'tenant-1',
                tenant_type: 'RESTAURANT',
                is_system: true,
              },
            ],
          },
        ],
        ['tenant_role_permissions', { rows: [{ permission: 'ORDERS_VIEW' }] }],
        [
          'WHERE tur.user_id = $1 AND tur.tenant_id = $2',
          {
            rows: [{ name: 'Purchaser' }],
          },
        ],
      ])
      const role = await assertCanAssignRole(baseArgs)
      expect(role.name).toBe('Viewer')
    })
  })
})
