import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

vi.mock('./env', () => ({
  getApiBase: () => 'http://localhost:4000',
}))

describe('authSessionRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(async () => {
    const { resetAuthSessionRefreshForTests } = await import('./authSessionRefresh')
    resetAuthSessionRefreshForTests()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('single-flight joins concurrent refreshAuthSession calls', async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                ok: true,
                data: { accessTokenExpiresAt: Date.now() + 1_200_000, expires_in: 1200 },
              }),
            })
          }, 50)
        })
    )

    const { refreshAuthSession, startAuthSessionRefresh, resetAuthSessionRefreshForTests } =
      await import('./authSessionRefresh')
    resetAuthSessionRefreshForTests()
    startAuthSessionRefresh(Date.now() + 1_200_000, true)

    const p1 = refreshAuthSession('fallback')
    const p2 = refreshAuthSession('fallback')
    await vi.advanceTimersByTimeAsync(60)
    const [a, b] = await Promise.all([p1, p2])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats 503 as transient and does not mark logged out', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        error: { name: 'AUTH_TEMPORARILY_UNAVAILABLE', message: 'down' },
      }),
    })

    const { refreshAuthSession, startAuthSessionRefresh, getAuthSessionRefreshStateForTests } =
      await import('./authSessionRefresh')
    startAuthSessionRefresh(Date.now() + 1_200_000, true)
    const outcome = await refreshAuthSession('fallback')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toBe('transient')
    expect(getAuthSessionRefreshStateForTests().stopped).toBe(false)
  })

  it('stopAuthSessionRefresh prevents further refresh', async () => {
    const { refreshAuthSession, startAuthSessionRefresh, stopAuthSessionRefresh } = await import(
      './authSessionRefresh'
    )
    startAuthSessionRefresh(Date.now() + 1_200_000, true)
    stopAuthSessionRefresh()
    const outcome = await refreshAuthSession('proactive')
    expect(outcome).toEqual({ ok: false, reason: 'logged_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
