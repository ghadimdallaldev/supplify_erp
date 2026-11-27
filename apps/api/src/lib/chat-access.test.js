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

import {
  ChatReadOnlyError,
  canOpenConversation,
  canSendMessage,
  userCanAccessConversation,
} from './chat-access.js'

/** db for the relationship predicates: { following, blocked, openOrderIds } */
function relDb({ following = true, blocked = false, openOrderIds = [] } = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (/AS following/.test(sql) && /AS blocked/.test(sql)) {
        return { rows: [{ org_id: 'org-1', following, blocked, public_catalog: false }] }
      }
      if (/customer_order/.test(sql)) return { rows: openOrderIds.map((id) => ({ id })) }
      return { rows: [] }
    }),
  }
}

const conv = { id: 'conv-1', supplier_id: 'supplier-1', restaurant_id: 'restaurant-1' }

describe('chat relationship rules', () => {
  it('general send without follow is read-only and lists open orders', async () => {
    const result = await canSendMessage(
      { conversation: conv, orderId: null, actorRole: 'RESTAURANT' },
      relDb({ following: false, openOrderIds: ['o-1'] })
    )
    expect(result).toEqual({ allowed: false, openOrderIds: ['o-1'] })
  })

  it('general send with follow is allowed for both sides', async () => {
    for (const actorRole of ['RESTAURANT', 'SUPPLIER']) {
      const result = await canSendMessage({ conversation: conv, actorRole }, relDb())
      expect(result.allowed).toBe(true)
    }
  })

  it('order-tagged message allowed while open after unfollow; refused after block', async () => {
    const open = await canSendMessage(
      { conversation: conv, orderId: 'o-1', actorRole: 'SUPPLIER' },
      relDb({ following: false, openOrderIds: ['o-1'] })
    )
    expect(open.allowed).toBe(true)
    const closed = await canSendMessage(
      { conversation: conv, orderId: 'o-2', actorRole: 'SUPPLIER' },
      relDb({ following: false, openOrderIds: ['o-1'] })
    )
    expect(closed.allowed).toBe(false)
    const blocked = await canSendMessage(
      { conversation: conv, orderId: 'o-1', actorRole: 'RESTAURANT' },
      relDb({ following: false, blocked: true, openOrderIds: ['o-1'] })
    )
    expect(blocked).toEqual({ allowed: false, openOrderIds: [] })
  })

  it('support conversations are exempt', async () => {
    const db = relDb({ following: false, blocked: true })
    const result = await canSendMessage(
      { conversation: { ...conv, is_admin_conversation: true }, actorRole: 'ADMIN' },
      db
    )
    expect(result.allowed).toBe(true)
    expect(db.query).not.toHaveBeenCalled()
  })

  it('supplier cannot open conversation after block; restaurant reads history', async () => {
    expect(await canOpenConversation(conv, 'SUPPLIER', relDb({ blocked: true }))).toBe(false)
    expect(await canOpenConversation(conv, 'RESTAURANT', relDb({ blocked: true }))).toBe(true)
    expect(await canOpenConversation(conv, 'SUPPLIER', relDb({ following: false }))).toBe(true)
  })

  it('CHAT_READ_ONLY carries openOrderIds', () => {
    const err = new ChatReadOnlyError(['o-1'])
    expect(err).toMatchObject({ code: 'CHAT_READ_ONLY', statusCode: 403 })
    expect(err.details).toEqual({ openOrderIds: ['o-1'] })
  })
})

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
