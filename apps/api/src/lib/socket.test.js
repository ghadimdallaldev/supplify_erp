import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serializeNotificationPayload, emitNotificationNew, emitToUser } from './socket.js'

describe('socket helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('serializeNotificationPayload maps notification fields', () => {
    const payload = serializeNotificationPayload({
      id: 'n1',
      title: 'Hello',
      message: 'World',
      reference_type: 'ORDER',
      reference_id: 'o1',
      metadata: '{"link":"/app/orders/o1"}',
      created_at: '2026-01-01T00:00:00Z',
      is_read: false,
    })
    expect(payload.id).toBe('n1')
    expect(payload.title).toBe('Hello')
    expect(payload.metadata).toEqual({ link: '/app/orders/o1' })
    expect(payload.is_read).toBe(false)
  })

  it('emitNotificationNew is no-op when io is not initialized', () => {
    expect(() =>
      emitNotificationNew({ id: 'n1', user_id: 'u1', title: 'T', message: 'M' })
    ).not.toThrow()
  })

  it('emitToUser is no-op when io is not initialized', () => {
    expect(() => emitToUser('u1', 'test', {})).not.toThrow()
  })
})
