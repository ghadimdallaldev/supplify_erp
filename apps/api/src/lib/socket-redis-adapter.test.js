import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { waitForRedisReady } from './socket-redis-adapter.js'

describe('waitForRedisReady', () => {
  it('resolves immediately when client is already ready', async () => {
    const client = { status: 'ready' }
    await expect(waitForRedisReady(client, 100)).resolves.toBeUndefined()
  })

  it('resolves on ready event', async () => {
    const client = Object.assign(new EventEmitter(), { status: 'connecting' })
    const promise = waitForRedisReady(client, 500)
    client.status = 'ready'
    client.emit('ready')
    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects on error event', async () => {
    const client = Object.assign(new EventEmitter(), { status: 'connecting' })
    const promise = waitForRedisReady(client, 500)
    client.emit('error', new Error('ECONNREFUSED'))
    await expect(promise).rejects.toThrow('ECONNREFUSED')
  })

  it('rejects on timeout', async () => {
    vi.useFakeTimers()
    const client = Object.assign(new EventEmitter(), { status: 'connecting' })
    const promise = waitForRedisReady(client, 50)
    vi.advanceTimersByTime(60)
    await expect(promise).rejects.toThrow(/timed out/)
    vi.useRealTimers()
  })
})
