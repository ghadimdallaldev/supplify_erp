import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runCronJob,
  CRON_JOBS,
  _clearRunningJobsForTests,
  _clearRecentCronFailuresForTests,
  getRecentCronFailures,
} from './cron-runner.js'

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
    _clearRecentCronFailuresForTests()
    delete process.env.JOB_DRY_RUN
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

  it('logs result object on completion', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })

    const { logger } = await import('./logger.js')
    const fn = vi.fn().mockResolvedValue({ notified: 3, scanned: 10 })
    await runCronJob(CRON_JOBS.OPERATIONAL_REMINDERS, fn)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'cron.completed',
        job: CRON_JOBS.OPERATIONAL_REMINDERS,
        result: { notified: 3, scanned: 10 },
      })
    )
  })

  it('skips scheduled jobs when CRONS_ENABLED is false', async () => {
    vi.resetModules()
    vi.doMock('../config/env.js', () => ({
      config: { CRONS_ENABLED: false },
    }))
    const { runCronJob: disabledRun } = await import('./cron-runner.js')
    const fn = vi.fn()
    const result = await disabledRun(CRON_JOBS.INVOICE_OVERDUE, fn)
    expect(result).toEqual({ ran: false, skipped: 'crons_disabled' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('runManualCronJob bypasses CRONS_ENABLED', async () => {
    vi.resetModules()
    vi.doMock('../config/env.js', () => ({
      config: { CRONS_ENABLED: false },
    }))
    vi.doMock('./db.js', () => ({
      pool: { connect: vi.fn(async () => mockClient) },
    }))
    vi.doMock('./logger.js', () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }))
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })
    const { runManualCronJob, CRON_JOBS } = await import('./cron-runner.js')
    const fn = vi.fn().mockResolvedValue({ ok: true })
    const result = await runManualCronJob(CRON_JOBS.EMAIL_RETRY, fn)
    expect(result.ran).toBe(true)
    expect(fn).toHaveBeenCalled()
  })

  it('records failures in recentCronFailures ring buffer', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })

    const fn = vi.fn().mockRejectedValue(new Error('db timeout'))
    await expect(runCronJob(CRON_JOBS.FULFILLMENT_EXCEPTIONS, fn)).rejects.toThrow('db timeout')

    const failures = getRecentCronFailures()
    expect(failures).toHaveLength(1)
    expect(failures[0].job).toBe(CRON_JOBS.FULFILLMENT_EXCEPTIONS)
    expect(failures[0].error).toBe('db timeout')
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
