import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  sockets: [],
  active: true,
  tenantAllowed: true,
  conversationAllowed: true,
}))
vi.mock('socket.io', () => ({
  Server: class {
    in() {
      return { fetchSockets: async () => state.sockets }
    }
    use() {}
    on() {}
  },
}))
vi.mock('./socket-redis-adapter.js', () => ({ attachSocketRedisAdapter: vi.fn() }))
vi.mock('./tenant-event-access.js', () => ({
  canReceiveTenantEvent: async () => state.tenantAllowed,
}))
vi.mock('./chat-access.js', () => ({
  userCanAccessConversation: async () => state.conversationAllowed,
}))
vi.mock('./db.js', () => ({ query: async () => ({ rows: state.active ? [{ id: 'u' }] : [] }) }))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
import { emitAuthorizedRoom, initializeSocket } from './socket.js'

describe('delivery-time socket authorization', () => {
  beforeEach(async () => {
    state.sockets = []
    state.active = state.tenantAllowed = state.conversationAllowed = true
    await initializeSocket({})
  })
  const recipient = (overrides = {}) => ({
    id: 'socket',
    data: {
      userId: 'u',
      role: 'SUPPLIER',
      tenantId: 'a',
      tenantType: 'SUPPLIER',
      expiresAt: Date.now() + 60000,
      ...overrides,
    },
    emit: vi.fn(),
  })
  it('delivers only within the notification tenant, even when the user has other valid grants', async () => {
    const allowed = recipient(),
      differentWorkspace = recipient({ tenantId: 'b' }),
      expired = recipient({ expiresAt: 1 })
    state.sockets = [allowed, differentWorkspace, expired]
    await emitAuthorizedRoom('user_u', 'notification_new', { title: 'Private' }, null, {
      tenantId: 'a',
      tenantType: 'SUPPLIER',
    })
    expect(allowed.emit).toHaveBeenCalledOnce()
    expect(differentWorkspace.emit).not.toHaveBeenCalled()
    expect(expired.emit).not.toHaveBeenCalled()
  })
  it('denies removed business members and old conversation rooms', async () => {
    const socket = recipient()
    state.sockets = [socket]
    state.tenantAllowed = false
    await emitAuthorizedRoom('supplier_a', 'order_updated', { orderId: 'order' })
    state.conversationAllowed = false
    await emitAuthorizedRoom('conversation_c', 'new_message', { content: 'Private' })
    expect(socket.emit).not.toHaveBeenCalled()
  })
  it('preserves own-user consumer delivery and rechecks account activation', async () => {
    const socket = recipient({ role: 'CONSUMER', tenantId: null, tenantType: null })
    state.sockets = [socket]
    const context = { tenantId: null, tenantType: 'CONSUMER' }
    await emitAuthorizedRoom('user_u', 'notification_new', { title: 'Own order' }, null, context)
    expect(socket.emit).toHaveBeenCalledOnce()
    socket.emit.mockClear()
    state.active = false
    await emitAuthorizedRoom('user_u', 'notification_new', {}, null, context)
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
