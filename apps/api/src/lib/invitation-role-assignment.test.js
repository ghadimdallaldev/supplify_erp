import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import {
  resolveRolePermissionList,
  RESTAURANT_SYSTEM_ROLES,
  SUPPLIER_SYSTEM_ROLES,
} from './tenant-roles.js'
import { hasPermission } from './permissions.js'

const queryMock = vi.fn()
const createKeycloakUserWithPassword = vi.fn()
const resolveWorkspaceScope = vi.fn()
const assertUserCanJoinWorkspace = vi.fn()
const bindUserToWorkspace = vi.fn()
const invalidateUserAuthCaches = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('./keycloak-admin.js', () => ({
  createKeycloakUserWithPassword: (...args) => createKeycloakUserWithPassword(...args),
}))

vi.mock('./workspace-membership.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    assertEmailCanJoinWorkspace: vi.fn().mockResolvedValue(undefined),
    assertUserCanJoinWorkspace: (...args) => assertUserCanJoinWorkspace(...args),
    bindUserToWorkspace: (...args) => bindUserToWorkspace(...args),
    resolveWorkspaceScope: (...args) => resolveWorkspaceScope(...args),
  }
})

vi.mock('./access-cache.js', () => ({
  invalidateUserAuthCaches: (...args) => invalidateUserAuthCaches(...args),
}))

vi.mock('./supplier-org.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    assignOrgUserRole: vi.fn().mockResolvedValue(undefined),
    invalidateOrgPermissionCaches: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('./permissions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    hasPermission: actual.hasPermission,
    invalidateUserPermissionCache: vi.fn().mockResolvedValue(undefined),
  }
})

import { acceptBranchInvitation } from './branch-invitations.js'
import { acceptRestaurantMemberInvitation } from './restaurant-invitations.js'

const VIEWER_ROLE_ID = '11111111-1111-4111-8111-111111111101'
const ACCOUNTANT_ROLE_ID = '11111111-1111-4111-8111-111111111102'
const MANAGER_ROLE_ID = '11111111-1111-4111-8111-111111111103'
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222201'
const RESTAURANT_ID = '33333333-3333-4333-8333-333333333301'
const INVITER_ID = '44444444-4444-4444-8444-444444444401'
const TOKEN = 'a'.repeat(96)

function futureExpiry() {
  return new Date(Date.now() + 86400000).toISOString()
}

function mockAcceptTransaction(roleId, roleName, tenantType, tenantId) {
  const lockedRow = {
    id: 'inv-1',
    supplier_id: SUPPLIER_ID,
    restaurant_id: RESTAURANT_ID,
    organization_id: 'org-1',
    token: TOKEN,
    invited_email: 'invitee@test.com',
    invited_name: 'Invitee',
    role_id: roleId,
    role_name: roleName,
    invited_by: INVITER_ID,
    status: 'pending',
    expires_at: futureExpiry(),
    invitation_type: 'member',
    branch_name: 'Branch',
    restaurant_name: 'Cafe',
    organization_name: 'Org',
  }

  queryMock.mockImplementation((sql, params) => {
    if (
      sql.includes('branch_invitations') ||
      sql.includes('restaurant_invitations') ||
      sql.includes('FROM branch_invitations') ||
      sql.includes('FROM restaurant_invitations')
    ) {
      return { rows: [lockedRow] }
    }
    if (sql.includes('FROM tenant_roles tr') && sql.includes('WHERE tr.id = $1')) {
      return { rows: [{ id: roleId, name: roleName }] }
    }
    if (sql.includes('INSERT INTO app_user')) {
      return { rows: [{ id: 'user-new', email: 'invitee@test.com' }] }
    }
    if (sql.includes('INSERT INTO tenant_user_roles')) {
      expect(params[1]).toBe(roleId)
      expect(params[2]).toBe(tenantType)
      expect(params[3]).toBe(tenantId)
      return { rows: [] }
    }
    if (
      sql.includes('UPDATE branch_invitations') ||
      sql.includes('UPDATE restaurant_invitations')
    ) {
      return { rows: [] }
    }
    if (sql.includes('SELECT name FROM tenant_roles WHERE id')) {
      return { rows: [{ name: roleName }] }
    }
    return { rows: [] }
  })
}

describe('acceptBranchInvitation role assignment', () => {
  beforeEach(() => {
    queryMock.mockReset()
    createKeycloakUserWithPassword.mockReset()
    resolveWorkspaceScope.mockReset()
    assertUserCanJoinWorkspace.mockReset()
    bindUserToWorkspace.mockReset()
    invalidateUserAuthCaches.mockReset()

    createKeycloakUserWithPassword.mockResolvedValue({ userId: 'kc-1', created: true })
    resolveWorkspaceScope.mockResolvedValue({
      workspaceType: 'SUPPLIER',
      organizationId: 'org-1',
      homeTenantId: SUPPLIER_ID,
    })
    assertUserCanJoinWorkspace.mockResolvedValue(undefined)
    bindUserToWorkspace.mockResolvedValue({})
  })

  it('assigns Viewer role from invitation record', async () => {
    mockAcceptTransaction(VIEWER_ROLE_ID, 'Viewer', 'SUPPLIER', SUPPLIER_ID)

    const result = await acceptBranchInvitation({
      token: TOKEN,
      fullName: 'Invitee',
      email: 'invitee@test.com',
      password: 'password123',
    })

    expect(result.roleName).toBe('Viewer')
    expect(createKeycloakUserWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ realmRoleName: 'supplier' })
    )
    expect(invalidateUserAuthCaches).toHaveBeenCalled()
  })

  it('assigns Accountant role from invitation record', async () => {
    mockAcceptTransaction(ACCOUNTANT_ROLE_ID, 'Accountant', 'SUPPLIER', SUPPLIER_ID)

    const result = await acceptBranchInvitation({
      token: TOKEN,
      email: 'invitee@test.com',
      password: 'password123',
    })

    expect(result.roleName).toBe('Accountant')
  })

  it('assigns Manager role from invitation record', async () => {
    mockAcceptTransaction(MANAGER_ROLE_ID, 'Supplier Manager', 'SUPPLIER', SUPPLIER_ID)

    const result = await acceptBranchInvitation({
      token: TOKEN,
      email: 'invitee@test.com',
      password: 'password123',
    })

    expect(result.roleName).toBe('Supplier Manager')
  })

  it('rejects expired invitation', async () => {
    queryMock.mockImplementation((sql) => {
      if (sql.includes('FROM branch_invitations bi')) {
        return {
          rows: [
            {
              status: 'pending',
              expires_at: new Date(Date.now() - 1000).toISOString(),
              role_id: VIEWER_ROLE_ID,
              supplier_id: SUPPLIER_ID,
              invited_email: 'invitee@test.com',
              branch_name: 'B',
              organization_name: 'O',
              role_name: 'Viewer',
            },
          ],
        }
      }
      return { rows: [] }
    })

    await expect(
      acceptBranchInvitation({
        token: TOKEN,
        email: 'invitee@test.com',
        password: 'password123',
      })
    ).rejects.toMatchObject({ code: 'expired' })
  })

  it('rejects already accepted invitation', async () => {
    queryMock.mockImplementation((sql) => {
      if (sql.includes('FROM branch_invitations bi')) {
        return {
          rows: [
            {
              status: 'accepted',
              expires_at: futureExpiry(),
              role_id: VIEWER_ROLE_ID,
              supplier_id: SUPPLIER_ID,
              invited_email: 'invitee@test.com',
              branch_name: 'B',
              organization_name: 'O',
              role_name: 'Viewer',
            },
          ],
        }
      }
      return { rows: [] }
    })

    await expect(
      acceptBranchInvitation({
        token: TOKEN,
        email: 'invitee@test.com',
        password: 'password123',
      })
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects email mismatch', async () => {
    mockAcceptTransaction(VIEWER_ROLE_ID, 'Viewer', 'SUPPLIER', SUPPLIER_ID)

    await expect(
      acceptBranchInvitation({
        token: TOKEN,
        email: 'wrong@test.com',
        password: 'password123',
      })
    ).rejects.toMatchObject({ code: 'email_mismatch' })
  })

  it('blocks user already linked to another supplier account', async () => {
    const { WorkspaceMembershipError } = await import('./workspace-membership.js')
    mockAcceptTransaction(VIEWER_ROLE_ID, 'Viewer', 'SUPPLIER', SUPPLIER_ID)
    assertUserCanJoinWorkspace.mockRejectedValueOnce(
      new WorkspaceMembershipError(
        'This user is already linked to another account. A user can only belong to one supplier or restaurant.'
      )
    )

    await expect(
      acceptBranchInvitation({
        token: TOKEN,
        email: 'invitee@test.com',
        password: 'password123',
      })
    ).rejects.toBeInstanceOf(WorkspaceMembershipError)
  })
})

describe('acceptRestaurantMemberInvitation role assignment', () => {
  beforeEach(() => {
    queryMock.mockReset()
    createKeycloakUserWithPassword.mockResolvedValue({ userId: 'kc-1', created: true })
    resolveWorkspaceScope.mockResolvedValue({
      workspaceType: 'RESTAURANT',
      organizationId: 'org-r1',
      homeTenantId: RESTAURANT_ID,
    })
    assertUserCanJoinWorkspace.mockResolvedValue(undefined)
    bindUserToWorkspace.mockResolvedValue({})
  })

  it('assigns Viewer for restaurant member invite', async () => {
    mockAcceptTransaction(VIEWER_ROLE_ID, 'Viewer', 'RESTAURANT', RESTAURANT_ID)

    const result = await acceptRestaurantMemberInvitation({
      token: TOKEN,
      email: 'invitee@test.com',
      password: 'password123',
    })

    expect(result.roleName).toBe('Viewer')
    expect(createKeycloakUserWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ realmRoleName: 'restaurant' })
    )
  })
})

describe('role permission boundaries after invite', () => {
  it('restaurant Viewer cannot create orders but can view workspace data', () => {
    const viewerPerms = resolveRolePermissionList(
      RESTAURANT_SYSTEM_ROLES.find((r) => r.name === 'Viewer'),
      'RESTAURANT'
    )
    expect(hasPermission(viewerPerms, P.ORDERS_CREATE)).toBe(false)
    expect(hasPermission(viewerPerms, P.ORDERS_VIEW)).toBe(true)
    expect(hasPermission(viewerPerms, P.RESERVATIONS_VIEW)).toBe(true)
    expect(hasPermission(viewerPerms, P.SETTINGS_VIEW)).toBe(true)
  })

  it('supplier Viewer cannot mutate catalog or fulfillment but can view', () => {
    const viewerPerms = resolveRolePermissionList(
      SUPPLIER_SYSTEM_ROLES.find((r) => r.name === 'Viewer'),
      'SUPPLIER'
    )
    expect(hasPermission(viewerPerms, P.ORDERS_VIEW)).toBe(true)
    expect(hasPermission(viewerPerms, P.CATALOG_VIEW)).toBe(true)
    expect(hasPermission(viewerPerms, P.FULFILLMENT_VIEW)).toBe(true)
    expect(hasPermission(viewerPerms, P.ORDERS_MANAGE)).toBe(false)
    expect(hasPermission(viewerPerms, P.CATALOG_EDIT)).toBe(false)
    expect(hasPermission(viewerPerms, P.FULFILLMENT_MANAGE)).toBe(false)
    expect(hasPermission(viewerPerms, P.CHAT_SEND)).toBe(false)
  })

  it('Accountant cannot manage orders or staff', () => {
    const perms = resolveRolePermissionList(
      RESTAURANT_SYSTEM_ROLES.find((r) => r.name === 'Accountant'),
      'RESTAURANT'
    )
    expect(hasPermission(perms, P.ORDERS_CREATE)).toBe(false)
    expect(hasPermission(perms, P.STAFF_INVITE)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(false)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
  })
})
