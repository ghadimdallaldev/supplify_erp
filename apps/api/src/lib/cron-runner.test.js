import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCronJob, CRON_JOBS, _clearRunningJobsForTests } from './cron-runner.js'

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
}

vi.mock('./db.js', () => ({
  pool: {
    connect: vi.fn(async () => mockClient),
  },
}))

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../config/env.js', () => ({
  config: { CRONS_ENABLED: true },
}))

describe('cron-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearRunningJobsForTests()
  })

  it('runs job when advisory lock is acquired', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })

    const fn = vi.fn().mockResolvedValue({ ok: true })
    const result = await runCronJob(CRON_JOBS.INVOICE_OVERDUE, fn)

    expect(result.ran).toBe(true)
    expect(result.result).toEqual({ ok: true })
    expect(fn).toHaveBeenCalledOnce()
    expect(mockClient.query).toHaveBeenCalledTimes(2)
    expect(mockClient.release).toHaveBeenCalledOnce()
  })

  it('skips when advisory lock is held by another session', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ acquired: false }] })

    const fn = vi.fn()
    const result = await runCronJob(CRON_JOBS.SCHEDULED_ORDERS, fn)

    expect(result.ran).toBe(false)
    expect(result.skipped).toBe('advisory_lock_held')
    expect(fn).not.toHaveBeenCalled()
    expect(mockClient.query).toHaveBeenCalledTimes(1)
    expect(mockClient.release).toHaveBeenCalledOnce()
  })

  it('skips when the same job is already running in-process', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ acquired: true }] })

    let release
    const blocker = new Promise((resolve) => {
      release = resolve
    })

    const fn = vi.fn(() => blocker)
    const first = runCronJob(CRON_JOBS.PROMOTIONS_EXPIRY, fn)
    await Promise.resolve()
    const second = await runCronJob(CRON_JOBS.PROMOTIONS_EXPIRY, vi.fn())

    expect(second.ran).toBe(false)
    expect(second.skipped).toBe('already_running_in_process')

    release()
    await first
  })
})
