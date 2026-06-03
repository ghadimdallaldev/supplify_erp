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

const { requestTimingMiddleware, buildSlowBreakdown } = await import('./request-timing.js')

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
      expect.objectContaining({
        event: 'http.request.slow_breakdown',
        authMs: 150,
        totalMs: expect.any(Number),
      })
    )
  })

  it('buildSlowBreakdown exposes canonical phase fields', () => {
    const req = {
      _perf: {
        stages: { auth: 40, tenant: 30, billing: 20, tenantContext: 80, feature: 10, handler: 200 },
        queryMsTotal: 120,
        queryCount: 3,
      },
    }
    const b = buildSlowBreakdown(req, 500)
    expect(b.authMs).toBe(40)
    expect(b.tenantLookupMs).toBe(30)
    expect(b.subscriptionMs).toBe(20)
    expect(b.rbacMs).toBe(60)
    expect(b.queryMs).toBe(120)
    expect(b.handlerMs).toBe(200)
    expect(b.totalMs).toBe(500)
  })
})
