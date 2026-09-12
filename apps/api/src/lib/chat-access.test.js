import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const getPermissionsForUserMock = vi.fn()
const isFeatureEnabledMock = vi.fn()

vi.mock('./db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('./permissions.js', () => ({
  getPermissionsForUser: (...args) => getPermissionsForUserMock(...args),
}))
vi.mock('./subscription.js', () => ({
  isFeatureEnabled: (...args) => isFeatureEnabledMock(...args),
}))

import { userCanAccessConversation } from './chat-access.js'

describe('socket chat access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockResolvedValue({
      rows: [{ id: 'conv-1', supplier_id: 'supplier-1', restaurant_id: 'restaurant-1' }],
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

  it('allows admins while still requiring the conversation to exist', async () => {
    await expect(
      userCanAccessConversation('admin-user', 'conv-1', { role: 'ADMIN' })
    ).resolves.toBe(true)

    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(
      userCanAccessConversation('admin-user', 'missing', { role: 'ADMIN' })
    ).resolves.toBe(false)
  })
})
