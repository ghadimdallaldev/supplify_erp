import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const loggerWarn = vi.fn()

vi.mock('../lib/logger.js', () => ({
  logger: { warn: loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/db.js', () => ({
  pool: { totalCount: 2, idleCount: 1, waitingCount: 0, options: { max: 20 } },
}))

vi.mock('../config/env.js', () => ({
  config: { SLOW_REQUEST_MS: 100 },
}))

const { requestTimingMiddleware } = await import('./request-timing.js')

function mockReqRes() {
  const req = { method: 'GET', path: '/api/test', originalUrl: '/api/test', requestId: 'r1' }
  const res = new EventEmitter()
  res.statusCode = 200
  return { req, res }
}

describe('requestTimingMiddleware', () => {
  beforeEach(() => {
    loggerWarn.mockClear()
  })

  it('does not log breakdown for fast requests', async () => {
    const { req, res } = mockReqRes()
    const next = vi.fn()
    requestTimingMiddleware(req, res, next)
    expect(next).toHaveBeenCalled()
    res.emit('finish')
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  it('logs slow breakdown when total exceeds threshold', async () => {
    vi.useFakeTimers()
    const { req, res } = mockReqRes()
    requestTimingMiddleware(req, res, vi.fn())
    req._perf.stages.auth = 150
    req._perf.t0 = process.hrtime.bigint() - BigInt(150 * 1_000_000)
    res.emit('finish')
    vi.useRealTimers()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'http.request.slow_breakdown' })
    )
  })
})
