import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    DATABASE_URL: 'postgres://localhost/test',
    DATABASE_POOL_MAX: 5,
    DATABASE_POOL_IDLE_TIMEOUT_MS: 600_000,
    DATABASE_SSL: false,
    DATABASE_SSL_REJECT_UNAUTHORIZED: false,
    DATABASE_STATEMENT_TIMEOUT: 0,
    DB_KEEPALIVE_ENABLED: false,
    DB_KEEPALIVE_INTERVAL_SECONDS: 60,
    DB_POOL_KEEPALIVE_MS: 0,
  },
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../middlewares/request-timing.js', () => ({
  recordPoolWaitIfNeeded: vi.fn(),
  recordQueryMs: vi.fn(),
}))

describe('db keepalive', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start keepalive timer when disabled', async () => {
    const spy = vi.spyOn(global, 'setInterval')
    const { startPoolKeepalive, stopPoolKeepalive } = await import('./db.js')
    startPoolKeepalive()
    expect(spy).not.toHaveBeenCalled()
    stopPoolKeepalive()
    spy.mockRestore()
  })
})
