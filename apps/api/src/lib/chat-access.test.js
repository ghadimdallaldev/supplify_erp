import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const getPermissionsForUserMock = vi.fn()
const isFeatureEnabledMock = vi.fn()
const membershipMock = vi.fn().mockResolvedValue(true)
const warehouseAccessMock = vi.fn().mockResolvedValue({ mode: 'all', warehouseIds: [] })
vi.mock('./tenant-switch.js', () => ({ userCanAccessTenant: (...args) => membershipMock(...args) }))
vi.mock('./warehouse-access.js', () => ({
  getWarehouseAccess: (...args) => warehouseAccessMock(...args),
}))

vi.mock('./db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('./permissions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getPermissionsForUser: (...args) => getPermissionsForUserMock(...args),
  }
})
vi.mock('./subscription.js', () => ({
  isFeatureEnabled: (...args) => isFeatureEnabledMock(...args),
}))

import { userCanAccessConversation } from './chat-access.js'

describe('socket chat access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    membershipMock.mockResolvedValue(true)
    warehouseAccessMock.mockResolvedValue({ mode: 'all', warehouseIds: [] })
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'conv-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'restaurant-1',
          is_admin_conversation: false,
        },
      ],
    })
    getPermissionsForUserMock.mockResolvedValue(['CHAT_VIEW', 'CHAT_SEND'])
    isFeatureEnabledMock.mockResolvedValue(true)
  })

  it('allows invited tenant users in the active participant tenant', async () => {
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-1',
        role: 'SUPPLIER',
      })
    ).resolves.toBe(true)

    expect(getPermissionsForUserMock).toHaveBeenCalledWith('staff-user', 'supplier-1', 'SUPPLIER')
  })

  it('rejects a revoked member even with stale chat permissions and an existing socket room', async () => {
    membershipMock.mockResolvedValueOnce(false)
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-1',
        role: 'SUPPLIER',
      })
    ).resolves.toBe(false)
    expect(getPermissionsForUserMock).not.toHaveBeenCalled()
  })

  it('rejects tenant-wide chat for staff restricted to assigned warehouses', async () => {
    warehouseAccessMock.mockResolvedValueOnce({ mode: 'assigned', warehouseIds: ['wh-a'] })
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-1',
        role: 'SUPPLIER',
      })
    ).resolves.toBe(false)
  })

  it('denies a user from another tenant before checking permissions', async () => {
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-other',
        role: 'SUPPLIER',
      })
    ).resolves.toBe(false)

    expect(getPermissionsForUserMock).not.toHaveBeenCalled()
  })

  it('requires the requested socket permission and the chat feature', async () => {
    getPermissionsForUserMock.mockResolvedValueOnce(['CHAT_VIEW'])
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-1',
        role: 'SUPPLIER',
        requiredPermission: 'CHAT_SEND',
      })
    ).resolves.toBe(false)

    isFeatureEnabledMock.mockResolvedValueOnce(false)
    await expect(
      userCanAccessConversation('staff-user', 'conv-1', {
        tenantId: 'supplier-1',
        role: 'SUPPLIER',
      })
    ).resolves.toBe(false)
  })

  it('denies unscoped admins on marketplace conversations', async () => {
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', { role: 'ADMIN' })
    ).resolves.toBe(false)
  })

  it('allows admins on the impersonated tenant conversation', async () => {
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', {
        role: 'ADMIN',
        tenantId: 'supplier-1',
      })
    ).resolves.toBe(true)
  })

  it('allows support admins on support threads', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'conv-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'restaurant-1',
          is_admin_conversation: true,
        },
      ],
    })
    getPermissionsForUserMock.mockResolvedValueOnce(['ADMIN_SUPPORT'])
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', { role: 'ADMIN' })
    ).resolves.toBe(true)
    expect(getPermissionsForUserMock).toHaveBeenCalledWith('admin-user', null, 'ADMIN')
  })

  it('denies a deactivated admin and operational sends during impersonation', async () => {
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', {
        role: 'ADMIN',
        tenantId: 'supplier-1',
        requiredPermission: 'CHAT_SEND',
      })
    ).resolves.toBe(false)
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'conv-1', is_admin_conversation: true }] })
      .mockResolvedValueOnce({ rows: [] })
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', { role: 'ADMIN' })
    ).resolves.toBe(false)
  })

  it('denies admins without ADMIN_SUPPORT on support threads', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'conv-1',
          supplier_id: 'supplier-1',
          restaurant_id: 'restaurant-1',
          is_admin_conversation: true,
        },
      ],
    })
    getPermissionsForUserMock.mockResolvedValueOnce(['ADMIN_FINANCE'])
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', { role: 'ADMIN' })
    ).resolves.toBe(false)
  })

  it('requires the conversation to exist for admins', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(
      userCanAccessConversation('admin-user', 'missing', { role: 'ADMIN' })
    ).resolves.toBe(false)
  })
})
