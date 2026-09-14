import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resetStartupMigrationsReadyForTests,
  markStartupMigrationsReady,
} from './startup-readiness.js'

describe('startCronsAfterMigrations', () => {
  beforeEach(() => {
    resetStartupMigrationsReadyForTests()
  })

  it('refuses to register crons before startup migrations are ready', async () => {
    const { startCronsAfterMigrations } = await import('./start-crons-after-migrations.js')
    const registerCrons = vi.fn(() => ({ registered: 21, skipped: false }))

    expect(() => startCronsAfterMigrations({ registerCrons })).toThrow(
      /must not start before startup migrations are ready/i
    )
    expect(registerCrons).not.toHaveBeenCalled()
  })

  it('registers crons once migrations are marked ready', async () => {
    const { startCronsAfterMigrations } = await import('./start-crons-after-migrations.js')
    const registerCrons = vi.fn(() => ({ registered: 21, skipped: false }))

    markStartupMigrationsReady()
    const result = startCronsAfterMigrations({ registerCrons })

    expect(registerCrons).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ registered: 21, skipped: false })
  })
})
